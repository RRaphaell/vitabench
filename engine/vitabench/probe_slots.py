from __future__ import annotations

import unicodedata
from typing import Any

from numpy.random import Generator

from .schema import Persona, Probe, ProbeTemplate, ScenarioSpec

EVENTS = ("Mary's wedding", "the feast of San Marco")
LESSONS = (
    ("kept medicine in the house and burned the clothes of the sick", "medicine"),
    ("left the crowded parishes and slept out by the water at the Zattere", "dock"),
    ("kept from the crowds of the Rialto and prayed at San Zaccaria", "san_zaccaria"),
)
PLANT_WINDOW = 0.6
PLANT_WHO = {"mother": "Mother", "news": "The criers of the Rialto", "letter": "A letter"}
PAYOFF_WHO = {"news": "The criers of the Rialto"}


class ProbeError(ValueError):
    pass


def slug(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return "".join(ch if ch.isalnum() else "_" for ch in plain).strip("_").lower()


def pick_one(rng: Generator, values: list[Any]) -> Any:
    return values[int(rng.integers(0, len(values)))]


def person(
    spec: ScenarioSpec, rng: Generator, pool: str, family: str | None = None, exclude: str | None = None
) -> dict[str, str]:
    pool_families = spec.cast.name_pools["families"]
    families = [f for f in pool_families if f != exclude] or pool_families
    first = pick_one(rng, spec.cast.name_pools[pool])
    house = family or pick_one(rng, families)
    return {"id": f"{slug(first)}_{slug(house)}", "name": f"{first} {house}", "family": house}


def from_roster(roster: list[Any], rng: Generator, role: str) -> dict[str, str] | None:
    rows = [r if isinstance(r, dict) else r.model_dump(by_alias=True) for r in roster]
    matching = [r for r in rows if r.get("role") == role]
    if not matching:
        return None
    row = pick_one(rng, matching)
    return {"id": row["id"], "name": row["name"], "family": row["name"].split(" ")[-1]}


def fill(text: str, slots: dict[str, Any], template_id: str) -> str:
    try:
        return text.format(**slots)
    except KeyError as exc:
        raise ProbeError(f"probe template '{template_id}' uses unknown slot {exc}") from exc


def delay_label(delay_seasons: int) -> str:
    if delay_seasons < 4:
        return "1 season" if delay_seasons <= 1 else f"{delay_seasons} seasons"
    years = delay_seasons // 4
    return "1 year" if years == 1 else f"{years} years"


def plant_time(rng: Generator, delay: int, max_seasons: int) -> int:
    latest = min(int(max_seasons * PLANT_WINDOW), max_seasons - delay - 1)
    if latest <= 1:
        latest = max(2, int(max_seasons * PLANT_WINDOW))
    return int(rng.integers(1, latest))


def slots_for(
    spec: ScenarioSpec, persona: Persona, rng: Generator, roster: list[Any] | None, plant_t: int
) -> dict[str, Any]:
    roles = [r.role for r in spec.cast.roles if r.role in ("cooper", "moneylender", "merchant", "glassmaker")]
    role = pick_one(rng, roles or [spec.cast.roles[0].role])
    npc = (from_roster(roster, rng, role) if roster else None) or person(spec, rng, "venetian_male")
    kin = person(spec, rng, "venetian_female", family=npc["family"])
    stranger = person(spec, rng, "venetian_male", exclude=persona.name.split()[-1])
    church = pick_one(rng, [p for p in spec.map.places if p.kind == "church"])
    traded = [i for i in spec.economy.items if i.price <= 12]
    item = pick_one(rng, traded)
    lesson, lesson_action = pick_one(rng, list(LESSONS))
    amount = int(rng.integers(10, 61))
    return {
        "npc": npc["name"],
        "npc_id": npc["id"],
        "npc_role": role.replace("_", " "),
        "npc_kin": kin["name"],
        "npc_kin_id": kin["id"],
        "stranger": stranger["name"],
        "stranger_id": stranger["id"],
        "amount": amount,
        "amount_high": int(round(amount * 1.2)) + 1,
        "event": pick_one(rng, list(EVENTS)),
        "year": spec.start_year + plant_t // 4,
        "city": spec.city,
        "place_name": church.name,
        "place_id": church.id,
        "npc_family": npc["family"],
        "item": item.id.replace("_", " "),
        "item_price": item.price,
        "item_price_high": item.price + int(rng.integers(2, 7)),
        "lesson": lesson,
        "lesson_action": lesson_action,
        "persona": persona.name,
    }


def build_probe(
    probe_id: str,
    template: ProbeTemplate,
    slots: dict[str, Any],
    plant_t: int,
    payoff_t: int,
    negative: bool,
) -> Probe:
    side = template.negative_twin["payoff"] if negative else template.payoff.model_dump()
    check = template.negative_twin["check"] if negative else template.check.model_dump()
    expected = check["expected"]
    payoff_actor = slots["stranger"] if negative else slots["npc_kin"]
    payoff_actor_id = slots["stranger_id"] if negative else slots["npc_kin_id"]
    if template.check.kind == "goal_action" and not negative:
        payoff_actor, payoff_actor_id = "", ""
        expected = fill(str(expected), slots, template.id)
    slots = dict(slots) | {
        "negative": negative,
        "within_seasons": int(check.get("within_seasons", 2)),
        "amount_tolerance": float(check.get("amount_tolerance", 0.1)),
        "check_kind": check["kind"],
        "plant_channel": template.plant.channel,
        "payoff_channel": side["channel"],
        "payoff_actor": payoff_actor,
        "payoff_visitor_id": f"pf_{probe_id}",
        "plant_visitor_id": f"pv_{probe_id}",
        "plant_effects": {} if negative else template.plant.effects,
        "payoff_delivered": False,
        "plant_who": PLANT_WHO.get(template.plant.channel, slots["npc"]),
        "payoff_who": payoff_actor or PAYOFF_WHO.get(side["channel"], slots["npc"]),
    }
    return Probe(
        id=probe_id,
        template_id=template.id,
        type="negative" if negative else template.type,
        plant_t=plant_t,
        payoff_t=payoff_t,
        delay_seasons=payoff_t - plant_t,
        slots=slots,
        plant_text="" if negative else fill(template.plant.text, slots, template.id),
        payoff_text=fill(side["text"], slots, template.id),
        options=list(side.get("options", [])),
        expected=expected,
        amount=slots["amount"],
        npc=payoff_actor_id or slots["npc_id"],
    )
