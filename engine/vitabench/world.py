from __future__ import annotations

import math
from typing import Any

from vitabench.clock import age_at, interpolate_index, is_year_end, label, life_seasons, year_of
from vitabench.dialogue import activity_for, mother_line, render_observation
from vitabench.director import STREAM_HAZARD, ScheduledEvent, build_script, rng_for
from vitabench.npcs import Roster
from vitabench.schema import (
    WEEKS_PER_SEASON,
    Activity,
    Conversation,
    DeathSummary,
    DebtState,
    Intent,
    Job,
    Main,
    Nearby,
    Observation,
    Persona,
    Plan,
    Probe,
    ScenarioSpec,
    SelfState,
    TalkItem,
    Visitor,
)

EAT_TIERS = {"poor": (1, 8, -1), "plain": (2, 13, 0), "good": (4, 16, 1)}
HUNGER_PER_WEEK = 12
ENERGY_PER_WORK_WEEK = 8
IDLE_ENERGY_GAIN = 3
REST_ENERGY = 9
REST_HEALTH = 2
STARVING_HUNGER = 20
STARVING_HEALTH = 3
FED_HUNGER = 50
HEALTH_RECOVERY = 1
FRAILTY_AGE = 45
FRAILTY_PER_YEAR = 1.2
MIN_HEALTH_CAP = 30
GOMPERTZ_A = 0.0005
GOMPERTZ_B = 0.085
PLAGUE_HAZARD_MULT = 6.0


def _probe_hook(name: str):
    try:
        from vitabench import probes as probes_module
    except Exception:
        return None
    return getattr(probes_module, name, None)


class World:
    def __init__(
        self,
        spec: ScenarioSpec,
        persona_id: str,
        seed: int,
        probes: list[Probe] | None = None,
    ) -> None:
        self.spec = spec
        self.seed = seed
        self.persona = self._find_persona(persona_id)
        self.places = {p.id: p for p in spec.map.places}
        self.jobs = {j.id: j for j in spec.economy.jobs}
        self.items = {i.id: i for i in spec.economy.items}
        self.t = 0
        self.max_t = life_seasons(spec.max_years)
        self.alive = True
        self.cause = ""
        self.state = SelfState(
            at=self.persona.home,
            job=self.persona.job or None,
            money=self.persona.money,
            health=self.persona.health,
            energy=self.persona.energy,
            hunger=self.persona.hunger,
            assets=[],
            debts=[DebtState(to=d.to, amount=d.amount, due_year=d.due_year) for d in self.persona.debts],
        )
        self.roster = Roster(spec, self.persona, seed)
        self.script = build_script(spec, seed)
        self.active_events: list[ScheduledEvent] = []
        self.action_log: list[dict[str, Any]] = []
        self.memory_lines: list[str] = []
        self.pending_visitors: list[Visitor] = []
        self.pending_conversations: list[Conversation] = []
        self.pending_news: list[str] = []
        self.probes: list[Probe] = probes if probes is not None else []
        self.met: set[str] = set()
        self.last_plan: Plan | None = None
        self.season_events: list[dict[str, Any]] = []
        self.rng = rng_for(spec.id, seed, STREAM_HAZARD)
        self._enter_season()

    def _find_persona(self, persona_id: str) -> Persona:
        for p in self.spec.personas:
            if p.id == persona_id:
                return p
        raise KeyError(f"unknown persona {persona_id!r} in scenario {self.spec.id!r}")

    # ---------- derived state ----------

    @property
    def debts(self) -> list[DebtState]:
        return self.state.debts

    @property
    def year(self) -> int:
        return year_of(self.spec.start_year, self.t)

    @property
    def age(self) -> int:
        return age_at(self.persona.born, self.spec.start_year, self.t)

    def event_mult(self, key: str) -> float:
        m = 1.0
        for ev in self.active_events:
            value = ev.effects.get(key)
            if isinstance(value, int | float):
                m *= float(value)
        return m

    def in_plague(self) -> bool:
        return any(ev.kind == "plague" for ev in self.active_events)

    def market(self) -> dict[str, int]:
        f = interpolate_index(self.spec.economy.price_index, self.year) * self.event_mult("price_mult")
        return {i.id: max(1, round(i.price * f)) for i in self.items.values()}

    def place_name(self, place_id: str) -> str:
        place = self.places.get(place_id)
        return place.name if place else place_id

    # ---------- observation ----------

    def observe(self) -> Observation:
        for debt in self.state.debts:
            debt.overdue = debt.due_year < self.year
        nearby = [
            Nearby(npc=n.id, name=n.name, role=n.role, trust=round(n.trust, 2))
            for n in self.roster.nearby(self.state.at, self.t)
        ]
        self.met.update(n.npc for n in nearby)
        self.met.update(v.npc for v in self.pending_visitors)
        obs = Observation(
            t=self.t,
            date=label(self.spec.start_year, self.t),
            year=self.year,
            season=self.t % 4,
            age=self.age,
            self=self.state.model_copy(deep=True),
            news=list(self.pending_news[:3]),
            events=[ev.text for ev in self.active_events],
            visitors=list(self.pending_visitors),
            conversations=self._conversations(),
            market=self.market(),
            nearby=nearby,
            goals=[g.text for g in self.persona.goals],
            questions=[],
            text="",
        )
        return obs.model_copy(update={"text": render_observation(self, obs)})

    def _conversations(self) -> list[Conversation]:
        convos = list(self.pending_conversations)
        mother = self.roster.by_id.get("mother")
        if mother and mother.alive and self.state.at == self.persona.home:
            if not any(c.npc == "mother" for c in convos):
                convos.append(Conversation(npc="mother", says=mother_line(self.t)))
        return convos

    # ---------- stepping ----------

    def step_season(self, plan: Plan) -> list[dict[str, Any]]:
        if not self.alive:
            return []
        self.last_plan = plan
        job = self._plan_job(plan)
        work_weeks = min(plan.work.weeks if plan.work else 0, WEEKS_PER_SEASON) if job else 0
        moves = [m for m in plan.moves if m in self.places][: WEEKS_PER_SEASON - work_weeks]
        rest_weeks = min(plan.rest_weeks, WEEKS_PER_SEASON - work_weeks - len(moves))
        if plan.main == Main.seek_job and job is not None:
            self.state.job = job.id
            self._log("seek_job", target=job.id)
        cost, hunger_gain, health_gain = EAT_TIERS[plan.eat]
        bread_price = self.market().get("bread", 1)
        illness_p = float(self.spec.hazards.get("illness", 0.0)) * self.event_mult("illness_mult")
        wage_mult = self.event_mult("wage_mult") * self.event_mult("trade_mult")
        wages = 0
        food = 0
        for w in range(WEEKS_PER_SEASON):
            phase = w - work_weeks
            if w < work_weeks and job is not None:
                wages += self._work_week(job, wage_mult)
            elif phase < len(moves):
                self.state.at = moves[phase]
                self.state.energy -= 2
            elif phase < len(moves) + rest_weeks:
                self.state.energy += REST_ENERGY
                self.state.health += REST_HEALTH
            else:
                self.state.energy += IDLE_ENERGY_GAIN
            food += self._eat_week(cost * bread_price, hunger_gain, health_gain)
            self.state.hunger -= HUNGER_PER_WEEK
            if self.state.hunger < STARVING_HUNGER:
                self.state.health -= STARVING_HEALTH
            elif self.state.hunger >= FED_HUNGER:
                self.state.health += HEALTH_RECOVERY
            if self.rng.random() < illness_p:
                self.state.health -= 8
            self._clamp()
        if work_weeks and job is not None:
            self._log("work", target=job.id, amount=wages)
        for move in moves:
            self._log("move", target=move)
        if food:
            self._log("eat", target=plan.eat, amount=food)
        if rest_weeks:
            self._log("rest", amount=rest_weeks)
        self._buy(plan.buy)
        for item in plan.talk:
            self._talk(item)
        self._death_check()
        self._call_probe("check_due")
        events = self.season_events
        self.t += 1
        self.pending_visitors = []
        self.pending_conversations = []
        self.pending_news = []
        self._enter_season()
        return events

    def _plan_job(self, plan: Plan) -> Job | None:
        wanted = (plan.work.job if plan.work else None) or self.state.job
        job = self.jobs.get(wanted or "")
        if job is None:
            if plan.main in (Main.work, Main.seek_job):
                self._log("work_failed", target=wanted)
            return None
        for key, need in job.requires.items():
            if getattr(self.state, key, 0) < need:
                self._log("work_failed", target=job.id, amount=need)
                return None
        return job

    def _work_week(self, job: Job, wage_mult: float) -> int:
        wage = max(0, round(job.wage_week * wage_mult))
        self.state.money += wage
        self.state.energy += job.energy_week or -ENERGY_PER_WORK_WEEK
        self.state.health += job.health_week
        return wage

    def _eat_week(self, price: int, hunger_gain: int, health_gain: int) -> int:
        if self.state.money < price:
            return 0
        self.state.money -= price
        self.state.hunger += hunger_gain
        self.state.health += health_gain
        return price

    def _buy(self, buy: list[str]) -> None:
        prices = self.market()
        for item_id in buy:
            item = self.items.get(item_id)
            if item is None or self.state.money < prices.get(item_id, item.price if item else 0):
                continue
            price = prices[item_id]
            self.state.money -= price
            for key, value in item.effects.items():
                if key == "asset":
                    if value not in self.state.assets:
                        self.state.assets.append(str(value))
                elif isinstance(value, int | float):
                    setattr(self.state, key, getattr(self.state, key, 0) + int(value))
            self._log("buy", target=item_id, amount=price)
        self._clamp()

    def _talk(self, item: TalkItem) -> None:
        npc = self.roster.get(item.to)
        creditor = any(d.to == item.to for d in self.state.debts)
        target = item.to if creditor or npc is None else npc.id
        amount = item.amount
        if item.intent == Intent.pay:
            amount = amount or self._owed_to(target)
            paid = min(self.state.money, max(0, amount))
            self.state.money -= paid
            self._settle(target, paid)
            amount = paid
        elif item.intent == Intent.lend and amount:
            amount = min(self.state.money, amount)
            self.state.money -= amount
        elif item.intent == Intent.borrow and amount:
            self.state.money += amount
            self.state.debts.append(DebtState(to=target, amount=amount, due_year=self.year + 2))
        if npc is not None:
            self.met.add(npc.id)
            delta = {Intent.pay: 0.1, Intent.agree: 0.05, Intent.refuse: -0.1, Intent.promise: 0.05}
            npc.trust = round(min(1.0, max(0.0, npc.trust + delta.get(item.intent, 0.01))), 3)
        self._log("talk", target=target, amount=amount, intent=item.intent.value)

    def _owed_to(self, target: str) -> int:
        return sum(d.amount for d in self.state.debts if d.to == target)

    def _settle(self, target: str, paid: int) -> None:
        left = paid
        for debt in list(self.state.debts):
            if debt.to != target or left <= 0:
                continue
            take = min(debt.amount, left)
            debt.amount -= take
            left -= take
            if debt.amount <= 0:
                self.state.debts.remove(debt)

    def health_cap(self) -> int:
        return max(MIN_HEALTH_CAP, round(100 - max(0, self.age - FRAILTY_AGE) * FRAILTY_PER_YEAR))

    def _clamp(self) -> None:
        self.state.health = max(0, min(self.health_cap(), self.state.health))
        self.state.energy = max(0, min(100, self.state.energy))
        self.state.hunger = max(0, min(100, self.state.hunger))
        self.state.money = max(0, self.state.money)

    # ---------- events, probes, death ----------

    def _sync_active(self) -> None:
        self.active_events = [ev for ev in self.script if ev.active_at(self.t)]

    def _fire(self, ev: ScheduledEvent) -> None:
        effects = ev.effects
        for key in ("health", "energy", "hunger"):
            if key in effects:
                setattr(self.state, key, getattr(self.state, key) + int(effects[key]))
        if "money_frac" in effects:
            self.state.money += round(self.state.money * float(effects["money_frac"]))
        dead = self.roster.plague_deaths(float(effects.get("npc_death_rate", 0.0)), self.t, self.rng)
        self._clamp()
        self.pending_news.append(ev.text)
        self.season_events.append(
            {"t": self.t, "id": ev.id, "kind": ev.kind, "text": ev.text, "npc_deaths": dead}
        )

    def _enter_season(self) -> None:
        self.season_events = []
        self._sync_active()
        for ev in self.script:
            if ev.t == self.t:
                self._fire(ev)
        self._call_probe("plant_due")
        self._call_probe("payoff_due")

    def _call_probe(self, name: str) -> None:
        hook = _probe_hook(name)
        if hook is not None:
            hook(self)

    def _death_check(self) -> None:
        if self.state.health <= 0:
            self._die("starvation" if self.state.hunger <= 0 else "illness")
            return
        if not is_year_end(self.t):
            return
        era = PLAGUE_HAZARD_MULT if self.in_plague() else 1.0
        hazard = GOMPERTZ_A * math.exp(GOMPERTZ_B * (self.age - 20)) * era
        if self.rng.random() < min(1.0, hazard):
            self._die("plague" if self.in_plague() else "old age")

    def _die(self, cause: str) -> None:
        self.alive = False
        self.cause = cause
        self.season_events.append({"t": self.t, "id": "death", "kind": "death", "text": cause})

    def _log(self, kind: str, target: str | None = None, amount: int | None = None,
             intent: str | None = None) -> None:
        self.action_log.append(
            {"t": self.t, "kind": kind, "target": target, "amount": amount, "intent": intent}
        )

    # ---------- summaries ----------

    def goals_met(self) -> list[str]:
        met: list[str] = []
        children = [c for c in self.persona.family.get("children", []) if isinstance(c, dict)]
        for goal in self.persona.goals:
            ok = True
            for key, want in goal.check.items():
                if key == "asset":
                    ok &= want in self.state.assets
                elif key == "debt":
                    ok &= sum(d.amount for d in self.state.debts) <= int(want)
                elif key == "children_alive":
                    ok &= len([c for c in children if c.get("alive", True)]) >= int(want)
                elif key == "job":
                    ok &= self.state.job == want
                else:
                    ok &= getattr(self.state, key, 0) >= int(want)
            if ok:
                met.append(goal.id)
        return met

    def death_summary(self) -> DeathSummary:
        return DeathSummary(
            t=self.t,
            age=self.age,
            cause=self.cause or ("outlived the scenario" if self.t >= self.max_t else "unknown"),
            money=self.state.money,
            goals_met=self.goals_met(),
            years_lived=max(0, self.age - self.spec.start_age_default),
        )

    def hero_activity(self) -> Activity:
        return activity_for(self)
