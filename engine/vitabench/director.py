from __future__ import annotations

from typing import Any, Literal
from zlib import crc32

import numpy as np
from pydantic import BaseModel

from vitabench.clock import life_seasons, t_of
from vitabench.schema import WEEKS_PER_SEASON, ScenarioSpec

STREAM_EVENTS = 1
STREAM_NPC = 2
STREAM_PROBES = 3
STREAM_HAZARD = 4
STREAM_DIALOGUE = 5

HAZARD_KINDS = ("fire", "theft", "illness", "price_shock")

HAZARD_SPECS: dict[str, dict[str, Any]] = {
    "fire": {
        "text": "A fire takes hold in the workshops nearby",
        "effects": {"health": -6, "money_frac": -0.12},
        "duration_seasons": 1,
    },
    "theft": {
        "text": "Thieves break in and take what they can carry",
        "effects": {"money_frac": -0.25},
        "duration_seasons": 1,
    },
    "illness": {
        "text": "A fever lays you low for weeks",
        "effects": {"health": -16, "energy": -20},
        "duration_seasons": 1,
    },
    "price_shock": {
        "text": "Grain fails upriver and prices spike",
        "effects": {"price_mult": 1.45},
        "duration_seasons": 2,
    },
}


def rng_for(scenario_id: str, seed: int, stream: int) -> np.random.Generator:
    return np.random.default_rng([crc32(scenario_id.encode()), int(seed), int(stream)])


class ScheduledEvent(BaseModel):
    id: str
    kind: str
    text: str
    t: int
    duration_seasons: int = 1
    effects: dict[str, Any] = {}
    source: Literal["history", "hazard"] = "history"
    district: str | None = None

    def active_at(self, t: int) -> bool:
        return self.t <= t < self.t + max(1, self.duration_seasons)


def _history_events(spec: ScenarioSpec, horizon: int) -> list[ScheduledEvent]:
    out: list[ScheduledEvent] = []
    for ev in spec.events:
        t = t_of(spec.start_year, ev.year, ev.season)
        if t < 0 or t >= horizon:
            continue
        out.append(
            ScheduledEvent(
                id=ev.id,
                kind=ev.kind,
                text=ev.text,
                t=t,
                duration_seasons=ev.duration_seasons,
                effects=dict(ev.effects),
                source="history",
            )
        )
    return out


def _hazard_events(spec: ScenarioSpec, seed: int, horizon: int) -> list[ScheduledEvent]:
    rng = rng_for(spec.id, seed, STREAM_EVENTS)
    weeks = horizon * WEEKS_PER_SEASON
    out: list[ScheduledEvent] = []
    for kind in HAZARD_KINDS:
        p = float(spec.hazards.get(kind, 0.0))
        draws = rng.random(weeks)
        if p <= 0.0:
            continue
        hits = np.nonzero(draws < p)[0]
        for n, week in enumerate(hits.tolist()):
            base = HAZARD_SPECS[kind]
            t = week // WEEKS_PER_SEASON
            out.append(
                ScheduledEvent(
                    id=f"{kind}_{t}_{n}",
                    kind=kind,
                    text=base["text"],
                    t=t,
                    duration_seasons=base["duration_seasons"],
                    effects=dict(base["effects"]),
                    source="hazard",
                )
            )
    return out


def build_script(spec: ScenarioSpec, seed: int) -> list[ScheduledEvent]:
    horizon = life_seasons(spec.max_years)
    script = _history_events(spec, horizon) + _hazard_events(spec, seed, horizon)
    script.sort(key=lambda e: (e.t, e.source, e.id))
    return script
