from __future__ import annotations

import inspect
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from vitabench import frames
from vitabench.adapters.base import scenario_brief
from vitabench.schema import AnyFrame, Plan, Probe, ScenarioSpec
from vitabench.scoring import score_run
from vitabench.trace import TraceWriter, read_trace, write_frames_json

TURN_TIMEOUT = 120.0
PROBE_KINDS = {"plant": "probe_plant", "payoff": "probe_payoff", "result": "probe_result"}


@dataclass
class RunResult:
    run_dir: Path
    scores: dict[str, Any]
    cost_usd: float
    t_end: int
    cause: str


def _plan_probes(spec: ScenarioSpec, persona: Any, seed: int) -> list[Probe]:
    try:
        from vitabench import probes as probes_module
    except ImportError:
        return []
    fn = getattr(probes_module, "plan_probes", None)
    if fn is None:
        return []
    from vitabench.clock import life_seasons
    from vitabench.director import STREAM_PROBES, rng_for
    from vitabench.npcs import Roster

    supply = {
        "spec": spec,
        "scenario": spec,
        "persona": persona,
        "persona_id": persona.id,
        "seed": seed,
        "rng": rng_for(spec.id, seed, STREAM_PROBES),
        "max_seasons": life_seasons(spec.max_years),
        "roster": [
            {"id": npc.id, "name": npc.name, "role": npc.role, "home": npc.home}
            for npc in Roster(spec, persona, seed).npcs
        ],
    }
    params = inspect.signature(fn).parameters
    missing = [n for n, p in params.items() if p.default is p.empty and n not in supply]
    if missing:
        raise TypeError(f"vitabench.probes.plan_probes needs unknown arguments {missing}")
    return list(fn(**{n: supply[n] for n in params if n in supply}))


def _probe_payload(probe: Probe, kind: str) -> dict[str, Any]:
    from vitabench import probes as probes_module

    over: dict[str, Any] = {}
    if kind == "result":
        over = {"action": probe.action_taken or "", "ok": probe.passed, "retrieved": probe.plant_text or None}
    builder = getattr(probes_module, "record_for", None) or getattr(probes_module, "_record", None)
    if builder is not None:
        return builder(kind, probe, **over)
    return {
        "kind": kind,
        "probe_id": probe.id,
        "type": probe.type,
        "delay_seasons": probe.delay_seasons,
        "claim": probe.plant_text if kind == "plant" else probe.payoff_text,
        "who": probe.npc or "",
        "t": probe.plant_t if kind == "plant" else probe.payoff_t,
        **over,
    }


def _probe_records(world: Any, seen: set[tuple[str, str]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for probe in world.probes:
        stages = (
            ("plant", probe.planted),
            ("payoff", bool(probe.slots.get("payoff_delivered"))),
            ("result", probe.resolved),
        )
        for kind, reached in stages:
            key = (probe.id, kind)
            if reached and key not in seen:
                seen.add(key)
                out.append(_probe_payload(probe, kind))
    return out


def build_world(spec: ScenarioSpec, persona_id: str, seed: int) -> Any:
    from vitabench.world import World

    persona = next((p for p in spec.personas if p.id == persona_id), None)
    if persona is None:
        raise KeyError(f"unknown persona {persona_id!r} in scenario {spec.id!r}")
    return World(spec, persona_id, seed, _plan_probes(spec, persona, seed))


def _memory(agent: Any) -> dict[str, list[str]] | None:
    getter = getattr(agent, "memory", None)
    return getter() if callable(getter) else None


def _act(
    agent: Any,
    observation: Any,
    pool: ThreadPoolExecutor | None,
    timeout: float | None,
) -> tuple[Plan, str | None]:
    try:
        if pool is None:
            result = agent.act(observation)
        else:
            result = pool.submit(agent.act, observation).result(timeout=timeout)
    except Exception as exc:  # noqa: BLE001 - a broken agent turn is data, not a crash
        return Plan(), f"{type(exc).__name__}: {exc}"
    if isinstance(result, Plan):
        return result, getattr(agent, "last_error", None)
    try:
        return Plan.model_validate(result), getattr(agent, "last_error", None)
    except Exception as exc:  # noqa: BLE001
        return Plan(), f"{type(exc).__name__}: {exc}"


def _write_probe_or_event(
    writer: TraceWriter,
    payload: dict[str, Any],
    t: int,
    emit: Callable[[AnyFrame], None],
) -> None:
    kind = str(payload.get("kind", "event"))
    trace_kind = PROBE_KINDS.get(kind, "event")
    payload_t = int(payload.get("t", t))
    writer.write(trace_kind, payload_t, payload)
    if trace_kind != "event":
        emit(frames.moment(payload, payload_t, trace_kind))


def run_life(
    spec: ScenarioSpec,
    persona_id: str,
    seed: int,
    agent: Any,
    run_dir: str | Path,
    harness_name: str = "none",
    model_name: str = "mock",
    on_frame: Callable[[AnyFrame], None] | None = None,
    turn_timeout: float | None = None,
) -> RunResult:
    world = build_world(spec, persona_id, seed)
    run_dir = Path(run_dir)
    writer = TraceWriter(run_dir)
    writer.write_meta(
        scenario=spec.id,
        persona=persona_id,
        seed=seed,
        harness=harness_name,
        model=model_name,
        probes=len(world.probes),
    )
    emit = on_frame or (lambda frame: None)

    hello = frames.hello(world, writer.run_id, harness_name, model_name, seed)
    writer.write("birth", 0, hello.model_dump(by_alias=True, mode="json"))
    emit(hello)
    agent.on_birth(world.persona, scenario_brief(spec))

    seen: set[tuple[str, str]] = set()
    pool = ThreadPoolExecutor(max_workers=1) if turn_timeout else None
    try:
        while world.alive and world.t < world.max_t:
            t = world.t
            observation = world.observe()
            season = frames.frame(world, _memory(agent))
            writer.write(
                "observation",
                t,
                {
                    "observation": observation.model_dump(mode="json"),
                    "frame": season.model_dump(by_alias=True, mode="json"),
                },
            )
            emit(season)

            started = time.perf_counter()
            plan, error = _act(agent, observation, pool, turn_timeout)
            wall_ms = int((time.perf_counter() - started) * 1000)
            if error:
                writer.write("plan_invalid", t, {"error": error}, wall_ms=wall_ms)
            writer.write("plan", t, plan.model_dump(mode="json"), wall_ms=wall_ms)
            usage = getattr(agent, "last_usage", None)
            if usage is not None:
                writer.write("llm", t, usage.model_dump(mode="json"), cost_usd=usage.cost_usd)

            events = world.step_season(plan)
            for event in events:
                kind = str(event.get("kind", "event"))
                if kind == "death":
                    continue
                if kind in PROBE_KINDS:
                    seen.add((str(event.get("probe_id", "")), kind))
                _write_probe_or_event(writer, event, t, emit)
            for record in _probe_records(world, seen):
                _write_probe_or_event(writer, record, t, emit)
    finally:
        if pool is not None:
            pool.shutdown(wait=False)

    summary = world.death_summary()
    writer.write("death", summary.t, summary.model_dump(mode="json"))
    agent.on_death(summary)
    scores = score_run(read_trace(run_dir))
    writer.write("score", summary.t, scores)
    writer.close()
    emit(frames.end(world, scores, writer.cost_usd))
    write_frames_json(run_dir)
    return RunResult(run_dir, scores, round(writer.cost_usd, 6), summary.t, summary.cause)
