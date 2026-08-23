from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from vitabench import frames as frames_mod
from vitabench.adapters.claude_code import home_for
from vitabench.clock import life_seasons
from vitabench.director import STREAM_PROBES, rng_for
from vitabench.npcs import Roster
from vitabench.scenario import load_scenario
from vitabench.schema import Observation, Persona, Plan, Probe, ScenarioSpec
from vitabench.scoring import score_run
from vitabench.server.harvest import HomeMemory, frame_memory, season_memory, season_probes
from vitabench.trace import (
    TraceWriter,
    frames_from_trace,
    hello_from_trace,
    new_run_id,
    read_meta,
    read_trace,
)
from vitabench.world import World

log = logging.getLogger("vitabench.server")
ALIVE, DEAD, FAILED = "alive", "dead", "failed"


class LiveUnavailable(RuntimeError):
    """The scenario or persona this run asks for does not exist."""


def runs_root() -> Path:
    env = os.environ.get("VITABENCH_RUNS")
    return Path(env).expanduser() if env else Path(__file__).resolve().parents[3] / "runs"


def _scenario_path(scenario: str) -> Path:
    candidate = Path(scenario).expanduser()
    if candidate.exists():
        return candidate
    return Path(__file__).resolve().parents[2] / "scenarios" / scenario


def plant_probes(spec: ScenarioSpec, persona: Persona, seed: int) -> list[Probe]:
    try:
        from vitabench.probes import plan_probes
    except ImportError:
        return []
    rng = rng_for(spec.id, seed, STREAM_PROBES)
    roster = [{"id": n.id, "name": n.name, "role": n.role} for n in Roster(spec, persona, seed).alive_npcs()]
    return list(plan_probes(spec, persona, rng, life_seasons(spec.max_years), roster))


def _dump(model: Any) -> dict[str, Any]:
    return model.model_dump(by_alias=True, mode="json")


class LiveLife:
    def __init__(
        self, run_id: str, scenario: str, persona: str | None,
        seed: int, harness: str, model: str, run_dir: Path,
    ) -> None:
        self.run_id, self.scenario, self.seed = run_id, scenario, seed
        self.harness, self.model, self.run_dir = harness, model, run_dir
        self.status = "created"
        self.frames: list[dict[str, Any]] = []
        self.error: str | None = None
        self.t = 0
        self.turns = 0
        self.subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._lock = asyncio.Lock()
        self._obs_q: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._plan_q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._pull = False
        self._last_obs: Observation | None = None
        self._probe_state: dict[str, tuple[bool, bool]] = {}
        self.home = home_for(run_id) if harness.startswith("claude") else None
        self._home_memory = HomeMemory(self.home) if self.home is not None else None
        self._memory: dict[str, Any] = {}

        self.spec = load_scenario(_scenario_path(scenario))
        self.persona = self._pick_persona(persona)
        self.persona_id = self.persona.id
        probes = plant_probes(self.spec, self.persona, seed)
        self.world = World(self.spec, self.persona_id, seed, probes)
        self.trace = TraceWriter(run_dir, run_id)

    def _pick_persona(self, persona: str | None) -> Persona:
        for candidate in self.spec.personas:
            if persona in (None, candidate.id):
                return candidate
        ids = ", ".join(p.id for p in self.spec.personas)
        raise LiveUnavailable(f"persona {persona!r} not in scenario {self.spec.id} ({ids})")

    @property
    def brief(self) -> str:
        from vitabench.adapters.base import scenario_brief

        return scenario_brief(self.spec)

    def info(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "scenario": self.spec.id,
            "persona": self.persona_id,
            "seed": self.seed,
            "harness": self.harness,
            "model": self.model,
            "status": self.status,
            "t": self.t, "turns": self.turns, "frames": len(self.frames),
            "date": self.world.observe().date if self.status == ALIVE else "",
            "cost_usd": round(self.trace.cost_usd, 6),
            "run_dir": str(self.run_dir), "home": str(self.home or ""),
            "error": self.error, "live": True,
        }

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.subscribers.add(queue)
        return queue

    def _emit(self, frame: dict[str, Any]) -> None:
        self.frames.append(frame)
        for queue in list(self.subscribers):
            queue.put_nowait(frame)

    def _write_probes(self) -> None:
        for kind, payload in season_probes(self.world, self._probe_state):
            t = int(payload.get("t") or self.world.t)
            self.trace.write(kind, t, payload)
            self._emit(_dump(frames_mod.moment(payload, t, kind)))

    async def start(self) -> dict[str, Any]:
        async with self._lock:
            if self.status != "created":
                raise RuntimeError(f"run {self.run_id} already started")
            hello = frames_mod.hello(self.world, self.run_id, self.harness, self.model, self.seed)
            self.trace.write_meta(
                scenario=self.spec.id, persona=self.persona_id, seed=self.seed,
                harness=self.harness, model=self.model,
                home=str(self.home) if self.home else None,
            )
            self.trace.write("birth", 0, _dump(hello))
            self._emit(_dump(hello))
            self.status = ALIVE
            self._write_probes()
            return self._publish_observation()

    def _publish_observation(self) -> dict[str, Any]:
        obs = self.world.observe()
        self._last_obs = obs
        self.t = obs.t
        frame = _dump(frames_mod.frame(self.world, frame_memory(self._memory)))
        self.trace.write("observation", obs.t, {"observation": obs.model_dump(mode="json"), "frame": frame})
        self._emit(frame)
        body = obs.model_dump(mode="json")
        if self._pull:
            self._obs_q.put_nowait(body)
        return body

    def _finish(self) -> dict[str, Any]:
        summary = self.world.death_summary()
        self.trace.write("death", summary.t, summary.model_dump(mode="json"))
        scores = score_run(read_trace(self.run_dir))
        self.trace.write("score", summary.t, scores)
        self._emit(_dump(frames_mod.end(self.world, scores, self.trace.cost_usd)))
        self.status = DEAD
        self.trace.close()
        if self._pull:
            self._obs_q.put_nowait(None)
        return {"dead": True, "run_id": self.run_id, "summary": summary.model_dump(mode="json"),
                "scores": scores, "cost_usd": round(self.trace.cost_usd, 6)}

    async def act(self, plan: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            if self.status == "created":
                raise RuntimeError(f"run {self.run_id} has not started")
            if self.status != ALIVE:
                return {"dead": True, "run_id": self.run_id, "status": self.status}
            try:
                parsed = Plan.model_validate(plan)
            except ValidationError as exc:
                parsed = Plan()
                errors = exc.errors(include_url=False)
                self.trace.write("plan_invalid", self.t, {"raw": plan, "errors": errors})
            self.trace.write("plan", self.t, parsed.model_dump(mode="json"))
            events = await asyncio.to_thread(self.world.step_season, parsed)
            self.turns += 1
            for event in events:
                self.trace.write("event", int(event.get("t", self.t)), event)
            self._write_memory(parsed)
            self._write_probes()
            if not self.world.alive:
                return self._finish()
            return self._publish_observation()

    def _write_memory(self, plan: Plan) -> None:
        self._memory = season_memory(self._home_memory, plan)
        if self._memory["wrote"] or self._memory["retrieved"]:
            self.trace.write("memory", self.world.t, self._memory)

    async def next_observation(self) -> dict[str, Any] | None:
        if not self._pull:
            self._pull = True
            if self._last_obs is not None:
                self._obs_q.put_nowait(self._last_obs.model_dump(mode="json"))
            asyncio.create_task(self._pump_plans())
        return await self._obs_q.get()

    async def submit_plan(self, plan: dict[str, Any]) -> None:
        await self._plan_q.put(plan)

    async def _pump_plans(self) -> None:
        while self.status == ALIVE:
            plan = await self._plan_q.get()
            try:
                await self.act(plan)
            except Exception as exc:
                self.fail(str(exc))
                self._obs_q.put_nowait(None)
                return

    async def start_mock(self, agent: Any, max_turns: int = 400) -> dict[str, Any]:
        await self.start()
        agent.on_birth(self.persona, self.brief)
        result: dict[str, Any] = {}
        for _ in range(max_turns):
            if self._last_obs is None or self.status != ALIVE:
                break
            plan = agent.act(self._last_obs)
            result = await self.act(plan.model_dump() if hasattr(plan, "model_dump") else plan)
            if result.get("dead"):
                break
        if result.get("summary"):
            agent.on_death(self.world.death_summary())
        return self.info()

    def fail(self, message: str) -> None:
        self.error = message
        self.status = FAILED
        self.trace.write("death", self.t, {"t": self.t, "cause": "error", "message": message})
        self.trace.close()


class Registry:
    def __init__(self) -> None:
        self.lives: dict[str, LiveLife] = {}

    def create(
        self, scenario: str = "venice_1340", persona: str | None = None, seed: int = 1,
        harness: str = "claude-code", model: str = "sonnet", run_id: str | None = None,
    ) -> LiveLife:
        run_id = run_id or new_run_id()
        life = LiveLife(run_id, scenario, persona, seed, harness, model, runs_root() / run_id)
        self.lives[run_id] = life
        return life

    def get(self, run_id: str) -> LiveLife | None:
        return self.lives.get(run_id)

    def only_live(self) -> LiveLife | None:
        alive = [life for life in self.lives.values() if life.status == ALIVE]
        return alive[0] if len(alive) == 1 else None

    def listing(self) -> list[dict[str, Any]]:
        rows = [life.info() for life in self.lives.values()]
        known = {row["run_id"] for row in rows}
        root = runs_root()
        if root.is_dir():
            for entry in sorted(root.iterdir()):
                if entry.name in known or not (entry / "trace.jsonl").exists():
                    continue
                meta = read_meta(entry)
                rows.append({
                    "run_id": entry.name, "status": "recorded", "live": False, "run_dir": str(entry),
                    **{k: v for k, v in meta.items() if k != "run_id"},
                })
        return rows


def frames_for(run_dir: Path) -> list[dict[str, Any]]:
    records = read_trace(run_dir)
    frames = frames_from_trace(records, hello_from_trace(records))
    return [f.model_dump(by_alias=True, mode="json") for f in frames]


REGISTRY = Registry()
