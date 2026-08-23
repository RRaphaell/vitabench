from __future__ import annotations

from typing import Any

from vitabench.clock import label
from vitabench.schema import (
    EndFrame,
    EventFrame,
    Frame,
    HelloFrame,
    HeroFrame,
    MemoryFrame,
    MomentFrame,
    PersonFrame,
    RelationFrame,
    RosterEntry,
)

MAX_RELATIONS = 12


def _xz(world: Any, place_id: str) -> tuple[int, int]:
    place = world.places.get(place_id)
    if place is None:
        return (0, 0)
    return tuple(place.xz)  # type: ignore[return-value]


def roster_entries(world: Any) -> list[RosterEntry]:
    return [
        RosterEntry.model_validate(
            {
                "id": npc.id,
                "name": npc.name,
                "role": npc.role,
                "class": npc.class_,
                "model": npc.model,
                "home": npc.home,
                "routine": list(npc.routine),
            }
        )
        for npc in world.roster.npcs
    ]


def hello(
    world: Any,
    run_id: str,
    harness: str = "none",
    model: str = "mock",
    seed: int | None = None,
) -> HelloFrame:
    return HelloFrame(
        run_id=run_id,
        scenario=world.spec.map,
        scenario_id=world.spec.id,
        start_year=world.spec.start_year,
        max_years=world.spec.max_years,
        persona=world.persona,
        roster=roster_entries(world),
        harness=harness,
        model=model,
        seed=int(world.seed if seed is None else seed),
    )


def _people(world: Any) -> list[PersonFrame]:
    talking = {item.to for item in (world.last_plan.talk if world.last_plan else [])}
    talking |= {v.npc for v in world.pending_visitors}
    people = []
    for npc in world.roster.npcs:
        here = world.roster.position_at(npc.id, world.t)
        nxt = world.roster.position_at(npc.id, world.t + 1)
        people.append(
            PersonFrame(
                id=npc.id,
                xz=_xz(world, here),
                to=nxt if nxt != here else None,
                alive=npc.alive,
                talking=npc.id in talking,
            )
        )
    return people


def _relations(world: Any, memory: dict[str, list[str]] | None) -> list[RelationFrame]:
    known = " ".join((memory or {}).get("wrote", []) + list(world.memory_lines)).lower()
    out = []
    for npc_id in sorted(world.met)[:MAX_RELATIONS]:
        npc = world.roster.by_id.get(npc_id)
        if npc is None:
            continue
        out.append(
            RelationFrame(
                id=npc.id,
                name=npc.name,
                role=npc.role,
                world=True,
                agent=npc.name.split()[0].lower() in known or npc.id in known,
            )
        )
    return out


def frame(world: Any, memory: dict[str, list[str]] | None = None) -> Frame:
    hero_to = world.last_plan.moves[-1] if (world.last_plan and world.last_plan.moves) else None
    return Frame(
        t=world.t,
        date=label(world.spec.start_year, world.t),
        hero=HeroFrame(
            xz=_xz(world, world.state.at),
            to=hero_to,
            age=world.age,
            money=world.state.money,
            health=world.state.health,
            energy=world.state.energy,
            activity=world.hero_activity(),
            alive=world.alive,
        ),
        people=_people(world),
        events=[
            EventFrame(id=ev.id, kind=ev.kind, active=True, text=ev.text, district=ev.district)
            for ev in world.active_events
        ],
        news=world.pending_news[0] if world.pending_news else "",
        memory=MemoryFrame(**(memory or {})),
        relations=_relations(world, memory),
    )


def moment(payload: dict[str, Any], t: int, record_kind: str = "probe_result") -> MomentFrame:
    from vitabench.trace import moment_from_payload

    return moment_from_payload(payload, t, record_kind)


def end(world: Any, scores: dict[str, Any] | None = None, cost_usd: float = 0.0) -> EndFrame:
    summary = world.death_summary()
    return EndFrame(
        t=summary.t,
        age=summary.age,
        cause=summary.cause,
        scores=scores or {},
        cost_usd=round(float(cost_usd), 6),
    )
