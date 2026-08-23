from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Any

from vitabench.clock import interpolate_index
from vitabench.schema import WEEKS_PER_SEASON, DebtState, Intent, Item, Job, Persona, SelfState

EAT_TIERS = {"poor": (1, 8, -1), "plain": (2, 13, 0), "good": (4, 16, 1)}
HUNGER_PER_WEEK = 12
ENERGY_PER_WORK_WEEK = 8
IDLE_ENERGY_GAIN = 3
REST_ENERGY = 9
REST_HEALTH = 2
MOVE_ENERGY = 2
STARVING_HUNGER = 20
STARVING_HEALTH = 3
FED_HUNGER = 50
HEALTH_RECOVERY = 1
ILLNESS_HEALTH = 8
FRAILTY_AGE = 45
FRAILTY_PER_YEAR = 1.2
MIN_HEALTH_CAP = 30
GOMPERTZ_A = 0.0005
GOMPERTZ_B = 0.085
PLAGUE_HAZARD_MULT = 6.0


def market_prices(
    items: Iterable[Item], price_index: dict[int, float], year: int, mult: float
) -> dict[str, int]:
    factor = interpolate_index(price_index, year) * mult
    return {item.id: max(1, round(item.price * factor)) for item in items}


def health_cap(age: int) -> int:
    return max(MIN_HEALTH_CAP, round(100 - max(0, age - FRAILTY_AGE) * FRAILTY_PER_YEAR))


def mortality_hazard(age: int, plague: bool) -> float:
    era = PLAGUE_HAZARD_MULT if plague else 1.0
    return min(1.0, GOMPERTZ_A * math.exp(GOMPERTZ_B * (age - 20)) * era)


def clamp(state: SelfState, cap: int) -> None:
    state.health = max(0, min(cap, state.health))
    state.energy = max(0, min(100, state.energy))
    state.hunger = max(0, min(100, state.hunger))
    state.money = max(0, state.money)


def work_week(state: SelfState, job: Job, wage_mult: float) -> int:
    wage = max(0, round(job.wage_week * wage_mult))
    state.money += wage
    state.energy += job.energy_week or -ENERGY_PER_WORK_WEEK
    state.health += job.health_week
    return wage


def move_week(state: SelfState, place_id: str) -> None:
    state.at = place_id
    state.energy -= MOVE_ENERGY


def rest_week(state: SelfState) -> None:
    state.energy += REST_ENERGY
    state.health += REST_HEALTH


def idle_week(state: SelfState) -> None:
    state.energy += IDLE_ENERGY_GAIN


def eat_week(state: SelfState, price: int, hunger_gain: int, health_gain: int) -> int:
    if state.money < price:
        return 0
    state.money -= price
    state.hunger += hunger_gain
    state.health += health_gain
    return price


def needs_week(state: SelfState, sick: bool) -> None:
    state.hunger -= HUNGER_PER_WEEK
    if state.hunger < STARVING_HUNGER:
        state.health -= STARVING_HEALTH
    elif state.hunger >= FED_HUNGER:
        state.health += HEALTH_RECOVERY
    if sick:
        state.health -= ILLNESS_HEALTH


def pick_job(
    jobs: dict[str, Job], state: SelfState, wanted: str | None
) -> tuple[Job | None, dict[str, Any] | None]:
    job = jobs.get(wanted or "")
    if job is None:
        return None, {"target": wanted}
    for key, need in job.requires.items():
        if getattr(state, key, 0) < need:
            return None, {"target": job.id, "amount": need}
    return job, None


def run_weeks(
    state: SelfState,
    job: Job | None,
    work_weeks: int,
    moves: list[str],
    rest_weeks: int,
    tier: tuple[int, int, int],
    bread_price: int,
    wage_mult: float,
    sick: list[bool],
    cap: int,
) -> tuple[int, int]:
    cost, hunger_gain, health_gain = tier
    wages = 0
    food = 0
    for w in range(WEEKS_PER_SEASON):
        phase = w - work_weeks
        if w < work_weeks and job is not None:
            wages += work_week(state, job, wage_mult)
        elif phase < len(moves):
            move_week(state, moves[phase])
        elif phase < len(moves) + rest_weeks:
            rest_week(state)
        else:
            idle_week(state)
        food += eat_week(state, cost * bread_price, hunger_gain, health_gain)
        needs_week(state, sick[w])
        clamp(state, cap)
    return wages, food


def goals_met(persona: Persona, state: SelfState) -> list[str]:
    met: list[str] = []
    children = [c for c in persona.family.get("children", []) if isinstance(c, dict)]
    for goal in persona.goals:
        ok = True
        for key, want in goal.check.items():
            if key == "asset":
                ok &= want in state.assets
            elif key == "debt":
                ok &= sum(d.amount for d in state.debts) <= int(want)
            elif key == "children_alive":
                ok &= len([c for c in children if c.get("alive", True)]) >= int(want)
            elif key == "job":
                ok &= state.job == want
            else:
                ok &= getattr(state, key, 0) >= int(want)
        if ok:
            met.append(goal.id)
    return met


def buy_items(
    state: SelfState, wanted: Iterable[str], catalog: dict[str, Item], prices: dict[str, int]
) -> list[tuple[str, int]]:
    bought: list[tuple[str, int]] = []
    for item_id in wanted:
        item = catalog.get(item_id)
        if item is None or state.money < prices.get(item_id, item.price):
            continue
        price = prices[item_id]
        state.money -= price
        for key, value in item.effects.items():
            if key == "asset":
                if value not in state.assets:
                    state.assets.append(str(value))
            elif isinstance(value, int | float):
                setattr(state, key, getattr(state, key, 0) + int(value))
        bought.append((item_id, price))
    return bought


def apply_talk(state: SelfState, target: str, intent: Intent, amount: int | None, year: int) -> int | None:
    if intent == Intent.pay:
        owed = amount or owed_to(state.debts, target)
        paid = min(state.money, max(0, owed))
        state.money -= paid
        settle(state.debts, target, paid)
        return paid
    if intent == Intent.lend and amount:
        amount = min(state.money, amount)
        state.money -= amount
    elif intent == Intent.borrow and amount:
        state.money += amount
        state.debts.append(DebtState(to=target, amount=amount, due_year=year + 2))
    return amount


def apply_event_effects(state: SelfState, effects: dict[str, Any]) -> None:
    for key in ("health", "energy", "hunger"):
        if key in effects:
            setattr(state, key, getattr(state, key) + int(effects[key]))
    if "money_frac" in effects:
        state.money += round(state.money * float(effects["money_frac"]))


def owed_to(debts: Iterable[DebtState], target: str) -> int:
    return sum(d.amount for d in debts if d.to == target)


def settle(debts: list[DebtState], target: str, paid: int) -> None:
    left = paid
    for debt in list(debts):
        if debt.to != target or left <= 0:
            continue
        take = min(debt.amount, left)
        debt.amount -= take
        left -= take
        if debt.amount <= 0:
            debts.remove(debt)
