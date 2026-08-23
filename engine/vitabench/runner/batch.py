from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from vitabench.adapters.mock import POLICIES, MockAgent
from vitabench.harnesses.base import get_harness
from vitabench.runner.life import TURN_TIMEOUT, RunResult, run_life
from vitabench.scenario import load_scenario
from vitabench.schema import ScenarioSpec

MOCK_PREFIX = "mock:"
LEADERBOARD_NAME = "leaderboard.json"


def make_agent(harness: str, model: str, seed: int) -> tuple[Any, str, float | None]:
    if harness.startswith(MOCK_PREFIX) or harness in POLICIES:
        policy = harness.removeprefix(MOCK_PREFIX)
        return MockAgent(policy=policy, seed=seed), "mock", None
    from vitabench.adapters.api_loop import ApiLoopAgent

    return ApiLoopAgent(model=model, harness=get_harness(harness)), model, TURN_TIMEOUT


def run_one(
    spec: ScenarioSpec,
    persona_id: str,
    seed: int,
    harness: str,
    model: str,
    out_dir: Path,
) -> RunResult:
    agent, model_label, timeout = make_agent(harness, model, seed)
    run_dir = out_dir / f"{harness.replace(':', '_')}_s{seed}"
    return run_life(
        spec,
        persona_id,
        seed,
        agent,
        run_dir,
        harness_name=harness,
        model_name=model_label,
        turn_timeout=timeout,
    )


def batch(
    spec_path: str | Path,
    persona_id: str | None,
    seeds: list[int],
    harnesses: list[str],
    model: str,
    out_dir: str | Path,
    concurrency: int = 4,
) -> dict[str, Any]:
    from vitabench.scoring import aggregate

    spec = load_scenario(Path(spec_path))
    persona = persona_id or spec.personas[0].id
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    jobs = [(harness, seed) for harness in harnesses for seed in seeds]
    results: list[RunResult] = []
    if concurrency > 1 and len(jobs) > 1:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            futures = [pool.submit(run_one, spec, persona, s, h, model, out_dir) for h, s in jobs]
            results = [f.result() for f in futures]
    else:
        results = [run_one(spec, persona, s, h, model, out_dir) for h, s in jobs]
    leaderboard = aggregate([r.run_dir for r in results])
    path = out_dir / LEADERBOARD_NAME
    path.write_text(json.dumps(leaderboard, indent=2), encoding="utf-8")
    return {
        "out_dir": str(out_dir),
        "runs": [str(r.run_dir) for r in results],
        "leaderboard": leaderboard,
        "leaderboard_path": str(path),
        "cost_usd": round(sum(r.cost_usd for r in results), 6),
    }
