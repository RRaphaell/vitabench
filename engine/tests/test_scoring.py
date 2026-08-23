from __future__ import annotations

from typing import Any

from vitabench.adapters.base import price_for, usage_cost
from vitabench.schema import TraceRecord
from vitabench.scoring import CHANCE_DEFAULT, aggregate, score_run
from vitabench.trace import TraceWriter

PERSONA = {"id": "marco", "name": "Marco", "born": 1318, "sex": "male", "job": "ropemaker",
           "home": "home_marco", "district": "castello", "money": 60, "health": 92, "energy": 80,
           "hunger": 70, "goals": [{"id": "warehouse", "text": "own a warehouse", "check": {}}]}


def rec(seq: int, kind: str, payload: dict[str, Any], t: int = 0, cost: float | None = None) -> TraceRecord:
    return TraceRecord(seq=seq, run_id="r_test", t=t, kind=kind, payload=payload, cost_usd=cost)


def probe(pid: str, ptype: str, delay: int, passed: bool) -> dict[str, Any]:
    return {"probe_id": pid, "type": ptype, "delay_seasons": delay, "passed": passed,
            "payoff_text": "a claim", "who": "Ines"}


def base_records(probes: list[dict[str, Any]], money: int = 100, cost: float = 0.0) -> list[TraceRecord]:
    records = [rec(1, "birth", {"max_years": 40, "persona": PERSONA})]
    for i, p in enumerate(probes):
        records.append(rec(2 + i, "probe_result", p, t=p["delay_seasons"]))
    records.append(rec(90, "llm", {"model": "claude-sonnet-5"}, cost=cost))
    records.append(
        rec(99, "death", {"t": 160, "age": 62, "cause": "old age", "money": money,
                          "goals_met": ["warehouse"], "years_lived": 40}, t=160)
    )
    return records


def test_memory_buckets_are_chance_corrected() -> None:
    scores = score_run(base_records([
        probe("p1", "ledger", 1, True),
        probe("p2", "ledger", 4, True),
        probe("p3", "fact", 40, False),
        probe("p4", "fact", 100, False),
    ]))
    assert scores["M_raw_by_delay"] == {"1": 1.0, "4": 1.0, "40": 0.0, "100": 0.0}
    assert scores["M_by_delay"]["1"] == 1.0
    assert scores["M_by_delay"]["100"] == 0.0
    assert scores["M"] == 0.5
    assert scores["memory"] == {"x": 2, "y": 4}
    assert scores["chance"] == CHANCE_DEFAULT


def test_partial_bucket_correction_uses_chance() -> None:
    scores = score_run(base_records([
        probe("p1", "ledger", 4, True),
        probe("p2", "ledger", 4, False),
    ]))
    assert scores["M_raw_by_delay"]["4"] == 0.5
    assert abs(scores["M_by_delay"]["4"] - (0.5 - 0.33) / 0.67) < 1e-3


def test_negatives_count_false_accepts() -> None:
    scores = score_run(base_records([
        probe("n1", "negative", 40, True),
        probe("n2", "negative", 40, False),
        probe("p1", "ledger", 1, True),
    ]))
    assert scores["negatives"] == {"x": 1, "y": 2}
    assert scores["N"] == 0.5
    assert scores["memory"]["y"] == 1


def test_quiz_scored_separately() -> None:
    scores = score_run(base_records([
        probe("q1", "quiz", 40, True),
        probe("p1", "ledger", 1, True),
    ]))
    assert scores["quiz"] == {"x": 1, "y": 1}
    assert scores["memory"]["y"] == 1


def test_h_is_the_weighted_sum_and_cost_comes_from_llm_records() -> None:
    scores = score_run(base_records([probe("p1", "ledger", 1, True)], cost=0.25))
    expected = round(0.55 * scores["M"] + 0.25 * scores["N"] + 0.20 * scores["L"], 4)
    assert scores["H"] == expected
    assert scores["cost_usd"] == 0.25
    assert 0.0 < scores["L"] <= 1.0
    assert scores["age"] == 62 and scores["cause"] == "old age"


def test_price_table_and_cache_discount() -> None:
    assert price_for("claude-sonnet-5") == (3.0, 15.0)
    assert price_for("claude-haiku-4-5") == (1.0, 5.0)
    assert usage_cost("claude-sonnet-5", 1_000_000, 0) == 3.0
    assert usage_cost("claude-sonnet-5", 0, 1_000_000) == 15.0
    assert usage_cost("claude-sonnet-5", 0, 0, 1_000_000) == 0.3


def _write_run(tmp_path, name: str, harness: str, seed: int, passed: list[bool]) -> str:
    run_dir = tmp_path / name
    writer = TraceWriter(run_dir, run_id=f"r_{name}")
    writer.write_meta(scenario="venice_1340", persona="marco", seed=seed, harness=harness, model="mock")
    writer.write("birth", 0, {"max_years": 40, "persona": PERSONA})
    for i, ok in enumerate(passed):
        writer.write("probe_result", 40, probe(f"p{i}", "ledger", 40, ok))
    writer.write("death", 160, {"t": 160, "age": 62, "cause": "old age", "money": 300,
                                "goals_met": [], "years_lived": 40})
    writer.close()
    return str(run_dir)


def test_aggregate_groups_by_harness_with_bootstrap_ci(tmp_path) -> None:
    runs = [
        _write_run(tmp_path, "notes_s0", "notes", 0, [True, True]),
        _write_run(tmp_path, "notes_s1", "notes", 1, [True, False]),
        _write_run(tmp_path, "notes_s2", "notes", 2, [False, False]),
        _write_run(tmp_path, "none_s0", "none", 0, [False, False]),
    ]
    board = aggregate(runs)
    assert [row["harness"] for row in board] == ["notes", "none"]
    notes = board[0]
    assert notes["n"] == 3 and notes["seeds"] == [0, 1, 2]
    lo, hi = notes["ci"]["H"]
    assert lo <= notes["H"] <= hi
    assert board[1]["M"] == 0.0
    assert aggregate(runs) == board
