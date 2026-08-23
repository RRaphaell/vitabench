from __future__ import annotations

from pathlib import Path

from vitabench.schema import HelloFrame, Persona
from vitabench.scoring import score_run
from vitabench.trace import TraceWriter, frames_from_trace, read_meta, read_trace

MAP = {"size": {"cols": 4, "rows": 4}, "water": [], "districts": [], "places": [], "landmarks": []}


def hello_frame() -> HelloFrame:
    persona = Persona(
        id="marco", name="Marco Dandolo", born=1318, sex="male", job="ropemaker", home="home_marco",
        district="castello", money=60, health=92, energy=80, hunger=70,
    )
    return HelloFrame(
        run_id="r_test", scenario=MAP, scenario_id="test", start_year=1340, max_years=40,
        persona=persona, roster=[], harness="claude-code", model="claude-sonnet-5", seed=1,
    )


def test_end_frame_cost_sums_llm_records(tmp_path: Path) -> None:
    writer = TraceWriter(tmp_path / "run", run_id="r_cost")
    writer.write("birth", 0, hello_frame().model_dump(by_alias=True, mode="json"))
    writer.write("llm", 1, {"model": "claude-sonnet-5", "cost_usd": 0.25})
    writer.write("llm", 2, {"model": "claude-sonnet-5", "cost_usd": 1.5}, cost_usd=1.5)
    writer.write("plan", 2, {"main": "work"}, cost_usd=99.0)
    writer.write("death", 3, {"t": 3, "age": 24, "cause": "plague"})
    writer.write("score", 3, {"H": 0.5, "cost_usd": 0.0})
    writer.close()

    records = read_trace(tmp_path / "run")
    assert frames_from_trace(records, hello_frame())[-1].cost_usd == 1.75
    scores = score_run(records)
    assert scores["cost"] == scores["cost_usd"] == 1.75


def test_memory_grep_fills_retrieved_when_recall_is_empty(tmp_path: Path) -> None:
    home = tmp_path / "home"
    home.mkdir()
    (home / "memory.md").write_text("- 1349: Zorzi Vialli is a cheat\n", encoding="utf-8")
    writer = TraceWriter(tmp_path / "run", run_id="r_grep")
    writer.write_meta(harness="claude-code", model="claude-sonnet-5", home=str(home))
    writer.write("birth", 0, hello_frame().model_dump(by_alias=True, mode="json"))
    writer.write("memory", 2, {"wrote": ["1341: Tomas Ferrer lent me 30 ducats", "bought bread"],
                               "retrieved": []})
    writer.write("memory", 6, {"wrote": ["1342: still owe the Ferrer house"], "retrieved": []})
    writer.write("memory", 60, {"wrote": ["1356: Ferrer married a Gritti"], "retrieved": []})
    writer.write("probe_result", 40, {"probe_id": "p1", "type": "ledger", "delay_seasons": 40,
                                      "passed": True, "who": "Ines Ferrer", "npc": "tomas_ferrer",
                                      "action": "pay 30"})
    writer.write("probe_result", 44, {"probe_id": "n1", "type": "negative", "delay_seasons": 40,
                                      "passed": True, "who": "Zorzi Vialli", "npc": "zorzi_vialli",
                                      "action": "refuse"})
    writer.write("death", 45, {"t": 45, "age": 33, "cause": "plague"})
    writer.close()

    records = read_trace(tmp_path / "run")
    moments = [f for f in frames_from_trace(records, hello_frame(), read_meta(tmp_path / "run"))
               if f.type == "moment"]
    assert moments[0].retrieved == "1341: Tomas Ferrer lent me 30 ducats"
    assert moments[1].retrieved is None  # end-of-life memory file is not time-indexed
    assert [f.retrieved for f in frames_from_trace(records, hello_frame()) if f.type == "moment"][1] is None
