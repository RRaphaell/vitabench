from __future__ import annotations

from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

import numpy as np

from vitabench.schema import TraceRecord
from vitabench.trace import llm_cost, read_meta, read_trace

CHANCE_DEFAULT = 0.33
DELAY_BUCKETS = (1, 4, 40, 100)
BUCKET_LABELS = {1: "1 season", 4: "1 year", 40: "10 years", 100: "25 years"}
RANDOM_HARNESS = "mock:random"
MIN_CHANCE_PROBES = 8
WEALTH_REF = 500.0
BOOTSTRAP_RESAMPLES = 2000
WEIGHTS = {"M": 0.55, "N": 0.25, "L": 0.20}


def _bucket(delay_seasons: int) -> int:
    return min(DELAY_BUCKETS, key=lambda b: abs(b - max(0, delay_seasons)))


def _corrected(rate: float, chance: float) -> float:
    if chance >= 1.0:
        return 0.0
    return max(0.0, min(1.0, (rate - chance) / (1.0 - chance)))


def _results(records: Sequence[TraceRecord]) -> list[dict[str, Any]]:
    results = [r.payload for r in records if r.kind == "probe_result"]
    return [p for p in results if p.get("passed", p.get("ok")) is not None]


def _passed(probe: dict[str, Any]) -> bool:
    value = probe.get("passed", probe.get("ok"))
    return bool(value)


def _first(records: Sequence[TraceRecord], kind: str) -> dict[str, Any]:
    for record in records:
        if record.kind == kind:
            return record.payload
    return {}


def _life_score(records: Sequence[TraceRecord], death: dict[str, Any]) -> tuple[float, dict[str, Any]]:
    birth = _first(records, "birth")
    persona = birth.get("persona") or {}
    goals_total = max(1, len(persona.get("goals") or []))
    max_years = int(birth.get("max_years") or 40)
    goals_met = list(death.get("goals_met") or [])
    money = int(death.get("money") or 0)
    years = int(death.get("years_lived") or (int(death.get("t", 0)) // 4))
    wealth = float(np.clip(np.log1p(max(0, money)) / np.log1p(WEALTH_REF), 0.0, 1.0))
    lived = float(np.clip(years / max(1, max_years), 0.0, 1.0))
    goals = min(1.0, len(goals_met) / goals_total)
    detail = {"goals_met": goals_met, "goals_total": goals_total, "money": money, "years_lived": years}
    return 0.4 * goals + 0.3 * wealth + 0.3 * lived, detail


def score_run(records: Iterable[TraceRecord], chance: float = CHANCE_DEFAULT) -> dict[str, Any]:
    records = list(records)
    results = _results(records)
    positives = [p for p in results if p.get("type") not in ("negative", "quiz")]
    negatives = [p for p in results if p.get("type") == "negative"]
    quizzes = [p for p in results if p.get("type") == "quiz"]

    raw_by_delay: dict[str, float] = {}
    counts_by_delay: dict[str, list[int]] = {}
    for probe in positives:
        key = str(_bucket(int(probe.get("delay_seasons") or 0)))
        hit, total = counts_by_delay.setdefault(key, [0, 0])
        counts_by_delay[key] = [hit + int(_passed(probe)), total + 1]
    m_by_delay: dict[str, float] = {}
    for key, (hit, total) in counts_by_delay.items():
        raw_by_delay[key] = round(hit / total, 4)
        m_by_delay[key] = round(_corrected(hit / total, chance), 4)

    memory_hits = sum(1 for p in positives if _passed(p))
    negative_ok = sum(1 for p in negatives if _passed(p))
    quiz_ok = sum(1 for p in quizzes if _passed(p))
    m = round(float(np.mean(list(m_by_delay.values()))) if m_by_delay else 0.0, 4)
    n = round(negative_ok / len(negatives), 4) if negatives else 1.0

    death = _first(records, "death")
    cost = llm_cost(records)
    life, life_detail = _life_score(records, death)
    life = round(life, 4)
    h = round(WEIGHTS["M"] * m + WEIGHTS["N"] * n + WEIGHTS["L"] * life, 4)
    return {
        "H": h,
        "M": m,
        "M_by_delay": m_by_delay,
        "M_raw_by_delay": raw_by_delay,
        "N": n,
        "L": life,
        "chance": chance,
        "cost_usd": cost,
        "cost": cost,
        "memory": {"x": memory_hits, "y": len(positives)},
        "negatives": {"x": negative_ok, "y": len(negatives)},
        "quiz": {"x": quiz_ok, "y": len(quizzes)},
        "turns": sum(1 for r in records if r.kind == "observation"),
        "age": int(death.get("age") or 0),
        "cause": str(death.get("cause") or "unknown"),
        **life_detail,
    }


def _bootstrap_ci(values: Sequence[float], seed: int = 0) -> list[float]:
    array = np.asarray(values, dtype=float)
    if array.size == 0:
        return [0.0, 0.0]
    if array.size == 1:
        return [round(float(array[0]), 4)] * 2
    rng = np.random.default_rng(seed)
    picks = rng.integers(0, array.size, size=(BOOTSTRAP_RESAMPLES, array.size))
    means = array[picks].mean(axis=1)
    lo, hi = np.percentile(means, [2.5, 97.5])
    return [round(float(lo), 4), round(float(hi), 4)]


def _mean_by_delay(entries: Sequence[dict[str, Any]], field: str = "M_by_delay") -> dict[str, float]:
    out: dict[str, float] = {}
    for bucket in DELAY_BUCKETS:
        key = str(bucket)
        vals = [e[field][key] for e in entries if key in e.get(field, {})]
        if vals:
            out[key] = round(float(np.mean(vals)), 4)
    return out


def chance_from_scores(scored: Sequence[dict[str, Any]]) -> tuple[float, str]:
    hits = sum(e["memory"]["x"] for e in scored if e.get("harness") == RANDOM_HARNESS)
    total = sum(e["memory"]["y"] for e in scored if e.get("harness") == RANDOM_HARNESS)
    if total >= MIN_CHANCE_PROBES:
        return round(hits / total, 4), f"{RANDOM_HARNESS} ({hits}/{total} probes)"
    if total:
        return CHANCE_DEFAULT, f"default ({total} {RANDOM_HARNESS} probes, need {MIN_CHANCE_PROBES})"
    return CHANCE_DEFAULT, f"default (no {RANDOM_HARNESS} runs here)"


def _rescore(entry: dict[str, Any], chance: float) -> None:
    raw = entry.get("M_raw_by_delay") or {}
    by_delay = {key: round(_corrected(rate, chance), 4) for key, rate in raw.items()}
    m = round(float(np.mean(list(by_delay.values()))) if by_delay else 0.0, 4)
    entry["M_by_delay"] = by_delay
    entry["M"] = m
    entry["chance"] = chance
    entry["H"] = round(WEIGHTS["M"] * m + WEIGHTS["N"] * entry["N"] + WEIGHTS["L"] * entry["L"], 4)


def memory_table(rows: Sequence[dict[str, Any]]) -> list[str]:
    heads = "".join(f"{BUCKET_LABELS[b]:>10}" for b in DELAY_BUCKETS)
    header = f"{'harness':<16}{'model':<18}{heads}{'M':>8}{'negatives':>12}"
    lines = [header, "-" * len(header)]
    for row in rows:
        raw = row.get("M_raw_by_delay") or {}
        cells = "".join(
            f"{raw[str(b)]:>10.2f}" if str(b) in raw else f"{'—':>10}" for b in DELAY_BUCKETS
        )
        neg = row.get("negatives") or {"x": 0, "y": 0}
        lines.append(
            f"{row['harness']:<16}{row['model']:<18}{cells}{row['M']:>8.3f}"
            + f"{neg['x']}/{neg['y']}".rjust(12)
        )
    return lines


def markdown_tables(rows: Sequence[dict[str, Any]]) -> str:
    lead = [
        "| harness | model | n | H [95% CI] | M | N | L | $/life |",
        "|---|---|--:|---|--:|--:|--:|--:|",
    ]
    for row in rows:
        lo, hi = row["ci"]["H"]
        lead.append(
            f"| {row['harness']} | {row['model']} | {row['n']} | {row['H']:.3f} [{lo:.3f}, {hi:.3f}] |"
            f" {row['M']:.3f} | {row['N']:.3f} | {row['L']:.3f} | ${row['cost_usd']:.4f} |"
        )
    heads = " | ".join(BUCKET_LABELS[b] for b in DELAY_BUCKETS)
    delay = [f"| harness | model | {heads} | M | negatives |", "|---|---|" + "--:|" * 6]
    for row in rows:
        raw = row.get("M_raw_by_delay") or {}
        cells = " | ".join(f"{raw[str(b)]:.2f}" if str(b) in raw else "—" for b in DELAY_BUCKETS)
        neg = row.get("negatives") or {"x": 0, "y": 0}
        delay.append(
            f"| {row['harness']} | {row['model']} | {cells} | {row['M']:.3f} | {neg['x']}/{neg['y']} |"
        )
    chance = rows[0]["chance"] if rows else CHANCE_DEFAULT
    source = rows[0].get("chance_source", "default") if rows else "default"
    return "\n".join(
        ["## Leaderboard", "", *lead, "",
         f"## Memory pass rate by delay (raw; chance {chance} from {source})", "", *delay, ""]
    )


def score_dir(run_dir: str | Path) -> dict[str, Any]:
    meta = read_meta(run_dir)
    scored = score_run(read_trace(run_dir))
    scored["run_dir"] = str(run_dir)
    scored["harness"] = meta.get("harness", "unknown")
    scored["model"] = meta.get("model", "unknown")
    scored["seed"] = meta.get("seed", 0)
    scored["scenario"] = meta.get("scenario", "unknown")
    scored["persona"] = meta.get("persona", "unknown")
    return scored


def find_runs(root: str | Path) -> list[Path]:
    root = Path(root)
    if (root / "trace.jsonl").exists():
        return [root]
    return sorted(p.parent for p in root.rglob("trace.jsonl"))


def aggregate(run_dirs: Iterable[str | Path], chance: float | None = None) -> list[dict[str, Any]]:
    scored = [score_dir(d) for d in run_dirs]
    source = "given"
    if chance is None:
        chance, source = chance_from_scores(scored)
    for entry in scored:
        _rescore(entry, chance)
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for entry in scored:
        groups.setdefault((entry["harness"], entry["model"]), []).append(entry)
    leaderboard: list[dict[str, Any]] = []
    for (harness, model), entries in groups.items():
        row = {
            "harness": harness,
            "model": model,
            "n": len(entries),
            "seeds": sorted({e["seed"] for e in entries}, key=str),
            "H": round(float(np.mean([e["H"] for e in entries])), 4),
            "M": round(float(np.mean([e["M"] for e in entries])), 4),
            "M_by_delay": _mean_by_delay(entries),
            "M_raw_by_delay": _mean_by_delay(entries, "M_raw_by_delay"),
            "negatives": {
                "x": sum(e["negatives"]["x"] for e in entries),
                "y": sum(e["negatives"]["y"] for e in entries),
            },
            "chance": chance,
            "chance_source": source,
            "N": round(float(np.mean([e["N"] for e in entries])), 4),
            "L": round(float(np.mean([e["L"] for e in entries])), 4),
            "cost_usd": round(float(np.mean([e["cost_usd"] for e in entries])), 6),
            "cost": round(float(np.mean([e["cost_usd"] for e in entries])), 6),
            "ci": {
                key: _bootstrap_ci([e[key] for e in entries])
                for key in ("H", "M", "N", "L")
            },
        }
        leaderboard.append(row)
    leaderboard.sort(key=lambda r: r["H"], reverse=True)
    return leaderboard
