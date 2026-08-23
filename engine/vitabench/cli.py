from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from pathlib import Path

import typer

from vitabench.adapters.api_loop import DEFAULT_MODEL
from vitabench.adapters.mock import MockAgent
from vitabench.harnesses.base import get_harness
from vitabench.runner.batch import LEADERBOARD_NAME
from vitabench.runner.batch import batch as run_batch
from vitabench.runner.life import TURN_TIMEOUT, run_life
from vitabench.scenario import ScenarioError, load_scenario, validate_report
from vitabench.scoring import aggregate, find_runs, markdown_tables, memory_table
from vitabench.trace import read_trace, write_frames_json

DEFAULT_SCENARIO = "scenarios/venice_1340"
RESULTS_NAME = "results.md"
HELP = "VitaBench — live one life in a real city, measure what the harness remembers."
app = typer.Typer(no_args_is_help=True, add_completion=False, help=HELP)
scenario_app = typer.Typer(no_args_is_help=True, help="Scenario tools.")
app.add_typer(scenario_app, name="scenario")


def _seed_list(seeds: str) -> list[int]:
    out: list[int] = []
    for part in seeds.split(","):
        part = part.strip()
        if "-" in part:
            lo, hi = part.split("-", 1)
            out.extend(range(int(lo), int(hi) + 1))
        elif part:
            out.append(int(part))
    return out


@app.command()
def run(
    scenario: str = typer.Option(DEFAULT_SCENARIO, help="Scenario folder."),
    persona: str | None = typer.Option(None, help="Persona id; defaults to the first in the scenario."),
    seed: int = typer.Option(1),
    agent: str = typer.Option("mock", help="mock | api"),
    policy: str = typer.Option("sensible", help="Mock policy: sensible | random | goldfish"),
    harness: str = typer.Option("none", help="API harness: none | notes"),
    model: str = typer.Option(DEFAULT_MODEL),
    out: str | None = typer.Option(None, help="Run directory; defaults to runs/<auto>."),
) -> None:
    spec = load_scenario(Path(scenario))
    persona_id = persona or spec.personas[0].id
    if agent == "mock":
        worker = MockAgent(policy=policy, seed=seed)
        harness_label, model_label, timeout = f"mock:{policy}", "mock", None
    elif agent == "api":
        from vitabench.adapters.api_loop import ApiLoopAgent

        worker = ApiLoopAgent(model=model, harness=get_harness(harness))
        harness_label, model_label, timeout = harness, model, TURN_TIMEOUT
    else:
        raise typer.BadParameter(f"unknown agent {agent!r}, expected mock or api")
    stamp = datetime.now().strftime("%H%M%S")
    tag = harness_label.replace(":", "_")
    run_dir = Path(out) if out else Path("runs") / f"{spec.id}_{persona_id}_{tag}_s{seed}_{stamp}"
    result = run_life(
        spec, persona_id, seed, worker, run_dir,
        harness_name=harness_label, model_name=model_label, turn_timeout=timeout,
    )
    scores = result.scores
    typer.echo(
        f"{spec.id}/{persona_id} seed={seed} harness={harness_label} → "
        f"died at {scores.get('age')} of {result.cause} after {scores.get('turns')} seasons"
    )
    typer.echo(
        f"H={scores['H']} M={scores['M']} (memory {scores['memory']['x']}/{scores['memory']['y']}) "
        f"N={scores['N']} (negatives {scores['negatives']['x']}/{scores['negatives']['y']}) "
        f"L={scores['L']} cost=${result.cost_usd}"
    )
    typer.echo(str(result.run_dir))


@app.command()
def batch(
    scenario: str = typer.Option(DEFAULT_SCENARIO),
    persona: str | None = typer.Option(None),
    seeds: str = typer.Option("0-4", help="Seed list or range, e.g. 0-4 or 1,2,7."),
    harnesses: str = typer.Option("mock:sensible,mock:goldfish", help="Comma separated."),
    model: str = typer.Option(DEFAULT_MODEL),
    out: str = typer.Option("runs/batch"),
    concurrency: int = typer.Option(4),
) -> None:
    report = run_batch(
        scenario, persona, _seed_list(seeds), [h.strip() for h in harnesses.split(",") if h.strip()],
        model, out, concurrency,
    )
    _print_leaderboard(report["leaderboard"])
    typer.echo(f"{len(report['runs'])} runs · ${report['cost_usd']} · {report['leaderboard_path']}")


def _print_leaderboard(rows: list[dict]) -> None:
    header = (
        f"{'harness':<16}{'model':<18}{'n':>2}  {'H [95% CI]':<24}"
        f"{'M':>7}{'N':>7}{'L':>7}{'$/life':>9}"
    )
    typer.echo(header)
    typer.echo("-" * len(header))
    for row in rows:
        lo, hi = row["ci"]["H"]
        score = f"{row['H']:.3f} [{lo:.3f}, {hi:.3f}]"
        typer.echo(
            f"{row['harness']:<16}{row['model']:<18}{row['n']:>2}  {score:<24}"
            f"{row['M']:>7.3f}{row['N']:>7.3f}{row['L']:>7.3f}{row['cost_usd']:>9.4f}"
        )


@app.command()
def score(
    runs: str = typer.Argument("runs", help="A run directory or a directory of runs."),
    out: str | None = typer.Option(None, help="Where to write leaderboard.json."),
) -> None:
    run_dirs = find_runs(runs)
    if not run_dirs:
        typer.echo(f"no traces under {runs}")
        raise typer.Exit(code=1)
    leaderboard = aggregate(run_dirs)
    _print_leaderboard(leaderboard)
    if leaderboard:
        typer.echo("")
        typer.echo(f"memory pass rate by delay · chance {leaderboard[0]['chance']} "
                   f"from {leaderboard[0]['chance_source']}")
        for line in memory_table(leaderboard):
            typer.echo(line)
    target = Path(out) if out else Path(runs) / LEADERBOARD_NAME
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(leaderboard, indent=2), encoding="utf-8")
    results = target.parent / RESULTS_NAME
    results.write_text(markdown_tables(leaderboard), encoding="utf-8")
    typer.echo(f"{len(run_dirs)} runs → {target} · {results}")


@app.command()
def replay(run_dir: str = typer.Argument(...)) -> None:
    path = write_frames_json(run_dir)
    frames = json.loads(path.read_text(encoding="utf-8"))
    counts = Counter(f["type"] for f in frames)
    records = Counter(r.kind for r in read_trace(run_dir))
    typer.echo(f"{path} · " + " · ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    typer.echo("trace: " + " · ".join(f"{k} {v}" for k, v in sorted(records.items())))


@scenario_app.command("validate")
def scenario_validate(path: str = typer.Argument(DEFAULT_SCENARIO)) -> None:
    try:
        spec = load_scenario(Path(path))
    except ScenarioError as exc:
        typer.echo(str(exc))
        raise typer.Exit(code=1) from exc
    report = validate_report(spec)
    typer.echo(f"{spec.id} ok · " + " · ".join(f"{k} {v}" for k, v in report.items()))


@app.command()
def director(path: str = typer.Argument(DEFAULT_SCENARIO), seed: int = typer.Option(0)) -> None:
    from vitabench.clock import label
    from vitabench.director import build_script

    spec = load_scenario(Path(path))
    script = build_script(spec, seed)
    for event in script:
        typer.echo(
            f"t={event.t:>4} {label(spec.start_year, event.t):<14}{event.kind:<10}"
            f"{event.source:<8}{event.text}"
        )
    typer.echo(f"{len(script)} events over {spec.max_years} years (seed {seed})")


@app.command()
def serve(port: int = typer.Option(8700), host: str = typer.Option("127.0.0.1")) -> None:
    from vitabench.server.app import serve as serve_app

    serve_app(port=port, host=host)


@app.command()
def claude(
    seed: int = typer.Option(1),
    model: str = typer.Option("sonnet", help="sonnet | opus | any model the claude CLI accepts."),
    out: str | None = typer.Option(None, help="Run directory; defaults to runs/claude_<model>_s<seed>."),
    server: str = typer.Option("http://127.0.0.1:8700", help="A running `vitabench serve`."),
    scenario: str = typer.Option(DEFAULT_SCENARIO),
    persona: str | None = typer.Option(None),
) -> None:
    """Live one life with the Claude Code CLI against a running engine server."""
    import asyncio

    from vitabench.adapters.base import scenario_brief
    from vitabench.adapters.claude_code import drive_life

    spec = load_scenario(Path(scenario))
    chosen = next((p for p in spec.personas if persona in (None, p.id)), None)
    if chosen is None:
        raise typer.BadParameter(f"persona {persona!r} not in {spec.id}")
    run_dir = Path(out) if out else Path("runs") / f"claude_{model}_s{seed}"
    result = asyncio.run(
        drive_life(
            server, run_dir, spec.id, chosen, scenario_brief(spec),
            seed=seed, model=model, city=spec.city, year=spec.start_year,
        )
    )
    typer.echo(
        f"{result['run_id']} · {result['attempts']} claude attempts · ${result['cost_usd']:.4f} · "
        f"{result['records']} trace records · home {result['home']}"
    )
    typer.echo(str(run_dir))


def main() -> None:
    app()


if __name__ == "__main__":
    main()
