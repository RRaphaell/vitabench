from __future__ import annotations

import json
from pathlib import Path

import pytest

from vitabench.adapters.mock import MockAgent
from vitabench.harnesses.base import get_harness
from vitabench.schema import (
    Conversation,
    HelloFrame,
    Intent,
    Observation,
    Persona,
    Plan,
    SelfState,
    Visitor,
)
from vitabench.trace import TraceWriter, frames_from_trace, read_trace, write_frames_json

SCENARIO_DIR = Path(__file__).resolve().parents[1] / "scenarios" / "venice_1340"

PERSONA = Persona(
    id="marco", name="Marco Dandolo", born=1318, sex="male", job="ropemaker", home="home_marco",
    district="castello", money=60, health=92, energy=80, hunger=70,
)
MAP = {"size": {"cols": 4, "rows": 4}, "water": [], "districts": [], "places": [], "landmarks": []}


def observation(t: int, visitors: list[Visitor] | None = None,
                conversations: list[Conversation] | None = None, **state) -> Observation:
    fields = {"at": "home_marco", "job": "ropemaker", "money": 100, "health": 90,
              "energy": 70, "hunger": 60} | state
    me = SelfState(**fields)
    return Observation(
        t=t, date=f"Spring {1340 + t // 4}", year=1340 + t // 4, season=t % 4, age=22 + t // 4,
        self=me, visitors=visitors or [], conversations=conversations or [],
        market={"bread": 1, "medicine": 12}, goals=["own a warehouse"], text="a season",
    )


def hello_frame() -> HelloFrame:
    return HelloFrame(
        run_id="r_test", scenario=MAP, scenario_id="test", start_year=1340, max_years=40,
        persona=PERSONA, roster=[], harness="mock:sensible", model="mock", seed=1,
    )


def frame_payload(t: int) -> dict:
    return {
        "type": "frame", "t": t, "date": f"Spring {1340 + t // 4}",
        "hero": {"xz": [3, 3], "to": None, "age": 22, "money": 60, "health": 90, "energy": 70,
                 "activity": {"icon": "🔨", "text": "working"}},
        "people": [], "events": [], "news": "", "memory": {"wrote": [], "retrieved": []}, "relations": [],
    }


def plant_visitor() -> Visitor:
    return Visitor(id="v1", npc="tomas_ferrer", name="Tomas Ferrer", role="cooper",
                   says="I lend you 30 ducats. Pay me back when you can.")


def payoff_visitor() -> Visitor:
    return Visitor(id="v2", npc="ines_ferrer", name="Ines Ferrer", role="fishwife",
                   says="My father Tomas Ferrer always said your family owes him 30 ducats.",
                   options=["pay", "refuse", "ask_proof"])


def false_visitor() -> Visitor:
    return Visitor(id="v3", npc="zorzi_vialli", name="Zorzi Vialli", role="moneylender",
                   says="Your father owed me 45 ducats in 1351. Pay me.",
                   options=["pay", "refuse", "ask_proof"])


def intents(plan: Plan) -> list[Intent]:
    return [item.intent for item in plan.talk]


def test_sensible_agent_pays_a_remembered_claim_and_refuses_a_stranger() -> None:
    agent = MockAgent("sensible", seed=1)
    agent.on_birth(PERSONA, "brief")
    agent.act(observation(0, visitors=[plant_visitor()]))
    paid = agent.act(observation(40, visitors=[payoff_visitor()]))
    refused = agent.act(observation(41, visitors=[false_visitor()]))
    assert intents(paid) == [Intent.pay]
    assert paid.talk[0].amount == 30
    assert intents(refused) == [Intent.ask_proof]


def test_goldfish_forgets_and_refuses_everything() -> None:
    agent = MockAgent("goldfish", seed=1)
    agent.on_birth(PERSONA, "brief")
    agent.act(observation(0, visitors=[plant_visitor()]))
    later = agent.act(observation(40, visitors=[payoff_visitor()]))
    assert intents(later) == [Intent.ask_proof]
    assert agent.facts == []


def test_sensible_agent_buys_medicine_when_ill_and_is_deterministic() -> None:
    agent = MockAgent("sensible", seed=3)
    agent.on_birth(PERSONA, "brief")
    plan = agent.act(observation(4, health=40))
    assert plan.buy == ["medicine"]
    first = [MockAgent("random", seed=7).act(observation(t)) for t in range(3)]
    second = [MockAgent("random", seed=7).act(observation(t)) for t in range(3)]
    assert [p.model_dump() for p in first] == [p.model_dump() for p in second]


def test_notes_harness_carries_text_between_turns() -> None:
    harness = get_harness("notes")
    assert harness.extra_tools()[0]["name"] == "update_notes"
    harness.on_tool("update_notes", {"text": "1346 Tomas lent me 30 ducats"})
    assert "30 ducats" in harness.prefix()
    memory = harness.drain_memory()
    assert memory["wrote"] == ["1346 Tomas lent me 30 ducats"]
    assert harness.drain_memory()["wrote"] == []


def test_trace_roundtrip_and_frames_json(tmp_path: Path) -> None:
    writer = TraceWriter(tmp_path / "run", run_id="r_test")
    writer.write_meta(scenario="test", persona="marco", seed=1, harness="mock:sensible", model="mock")
    writer.write("birth", 0, hello_frame().model_dump(by_alias=True, mode="json"))
    writer.write("observation", 0, {"observation": {}, "frame": frame_payload(0)})
    writer.write("probe_plant", 0, {"probe_id": "p1", "type": "ledger", "plant_text": "lends you 30",
                                    "who": "Tomas Ferrer", "delay_seasons": 40})
    writer.write("observation", 40, {"observation": {}, "frame": frame_payload(40)})
    writer.write("probe_result", 40, {"probe_id": "p1", "type": "ledger", "delay_seasons": 40,
                                      "passed": True, "who": "Ines Ferrer", "action": "pay 30"})
    writer.write("llm", 40, {"model": "claude-sonnet-5"}, cost_usd=0.5)
    writer.write("death", 41, {"t": 41, "age": 32, "cause": "plague"})
    writer.write("score", 41, {"H": 0.5, "cost_usd": 0.5})
    writer.close()

    records = read_trace(tmp_path / "run")
    assert [r.seq for r in records] == list(range(1, 9))
    frames = frames_from_trace(records, hello_frame())
    kinds = [f.type for f in frames]
    assert kinds == ["hello", "frame", "moment", "frame", "moment", "end"]
    assert frames[2].kind == "plant"
    assert frames[4].label == "remembered · 10 years"
    assert frames[-1].cause == "plague" and frames[-1].cost_usd == 0.5

    path = write_frames_json(tmp_path / "run")
    assert [f["type"] for f in json.loads(path.read_text())] == kinds


def test_negative_moment_labels_confabulation(tmp_path: Path) -> None:
    writer = TraceWriter(tmp_path / "run")
    writer.write("birth", 0, hello_frame().model_dump(by_alias=True, mode="json"))
    writer.write("probe_result", 60, {"probe_id": "n1", "type": "negative", "delay_seasons": 100,
                                      "passed": False, "who": "Zorzi", "action": "pay 45"})
    writer.write("death", 61, {"t": 61, "age": 37, "cause": "illness"})
    writer.close()
    frames = frames_from_trace(read_trace(tmp_path / "run"), hello_frame())
    assert frames[1].kind == "negative"
    assert frames[1].label == "confabulated"


@pytest.mark.parametrize("policy", ["sensible", "goldfish"])
def test_full_life_runs_and_scores(tmp_path: Path, policy: str) -> None:
    pytest.importorskip("vitabench.world")
    if not (SCENARIO_DIR / "scenario.yaml").exists():
        pytest.skip("scenario venice_1340 not available yet")
    from vitabench.runner.life import run_life
    from vitabench.scenario import load_scenario

    spec = load_scenario(SCENARIO_DIR)
    seen: list[str] = []
    result = run_life(
        spec, spec.personas[0].id, 1, MockAgent(policy, seed=1), tmp_path / policy,
        harness_name=f"mock:{policy}", model_name="mock", on_frame=lambda f: seen.append(f.type),
    )
    assert seen[0] == "hello" and seen[-1] == "end"
    assert seen.count("frame") >= 4
    assert result.cause
    assert 0.0 <= result.scores["H"] <= 1.0
    assert (result.run_dir / "frames.json").exists()
    kinds = {r.kind for r in read_trace(result.run_dir)}
    assert {"birth", "observation", "plan", "death", "score"} <= kinds


def test_probe_and_memory_records_reach_frames(tmp_path: Path) -> None:
    pytest.importorskip("vitabench.world")
    if not (SCENARIO_DIR / "scenario.yaml").exists():
        pytest.skip("scenario venice_1340 not available yet")
    from vitabench.runner.life import run_life
    from vitabench.scenario import load_scenario
    from vitabench.trace import hello_from_trace

    spec = load_scenario(SCENARIO_DIR)
    result = run_life(
        spec, "marco", 1, MockAgent("sensible", seed=1), tmp_path / "run",
        harness_name="mock:sensible", model_name="mock",
    )
    records = read_trace(result.run_dir)
    kinds = [r.kind for r in records]
    assert {"probe_plant", "probe_payoff", "probe_result", "memory"} <= set(kinds)
    plants = [r for r in records if r.kind == "probe_plant"]
    fields = {"probe_id", "who", "role", "claim", "delay_seasons", "label"}
    assert all(fields <= set(r.payload) for r in plants)
    results = [r for r in records if r.kind == "probe_result"]
    assert results and all(r.payload["t"] == r.t for r in results)
    assert any(r.payload.get("retrieved_source") in ("recall", "memory-grep") for r in results)

    memories = [r for r in records if r.kind == "memory"]
    assert memories and all(m.payload["wrote"] or m.payload["retrieved"] for m in memories)
    frames = frames_from_trace(records, hello_from_trace(records))
    seasons = [f for f in frames if f.type == "frame"]
    assert sum(1 for f in seasons if f.memory.wrote) == len(memories)
    moments = [f for f in frames if f.type == "moment" and f.kind != "plant"]
    assert any(m.retrieved for m in moments)


def test_memory_lines_and_recall_come_from_the_mock_agent() -> None:
    agent = MockAgent("sensible", seed=1)
    agent.on_birth(PERSONA, "Venice, 1340.")
    agent.act(observation(1, visitors=[plant_visitor()]))
    assert any("30 ducats" in line for line in agent.memory_lines())
    plan = agent.act(observation(101, visitors=[payoff_visitor()]))
    assert plan.recall and any("30 ducats" in line for line in plan.recall)
    assert plan.diary
    assert MockAgent("goldfish", seed=1).memory_lines() == []


class StubBlock:
    def __init__(self, name: str, payload: dict) -> None:
        self.type = "tool_use"
        self.name = name
        self.input = payload
        self.id = f"tu_{name}"


class StubUsage:
    input_tokens = 1200
    output_tokens = 300
    cache_read_input_tokens = 4000


class StubResponse:
    def __init__(self, blocks: list[StubBlock]) -> None:
        self.content = blocks
        self.usage = StubUsage()


class StubMessages:
    def __init__(self, script: list[StubResponse]) -> None:
        self.script = script
        self.calls: list[dict] = []

    def create(self, **kwargs) -> StubResponse:
        self.calls.append(kwargs)
        return self.script[min(len(self.calls) - 1, len(self.script) - 1)]


class StubClient:
    def __init__(self, script: list[StubResponse]) -> None:
        self.messages = StubMessages(script)


def test_api_loop_updates_notes_then_acts_and_prices_the_turn() -> None:
    from vitabench.adapters.api_loop import ApiLoopAgent

    client = StubClient([
        StubResponse([StubBlock("update_notes", {"text": "1346 Tomas lent me 30 ducats"})]),
        StubResponse([StubBlock("act", {"main": "work", "work": {"job": "ropemaker", "weeks": 10},
                                        "eat": "plain", "diary": "worked"})]),
    ])
    agent = ApiLoopAgent(model="claude-sonnet-5", harness=get_harness("notes"), client=client)
    agent.on_birth(PERSONA, "Venice, 1340.")
    plan = agent.act(observation(2))
    assert plan.main == "work" and plan.work.weeks == 10
    assert [t["name"] for t in client.messages.calls[0]["tools"]] == ["act", "update_notes"]
    assert "30 ducats" in agent.harness.notes
    assert agent.memory()["wrote"] == ["1346 Tomas lent me 30 ducats"]
    assert agent.last_usage.input_tokens == 2400
    assert agent.last_usage.cost_usd == round((2400 + 8000 * 0.1) * 3 / 1e6 + 600 * 15 / 1e6, 6)


def test_api_loop_falls_back_to_rest_on_an_invalid_plan() -> None:
    from vitabench.adapters.api_loop import ApiLoopAgent

    client = StubClient([StubResponse([StubBlock("act", {"main": "sail_to_crete"})])])
    agent = ApiLoopAgent(model="claude-haiku-4-5", harness=get_harness("none"), client=client)
    plan = agent.act(observation(3))
    assert plan.main == "rest"
    assert agent.last_error
