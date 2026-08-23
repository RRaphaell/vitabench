from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from vitabench.probes import check_due, payoff_due, plan_probes, plant_due
from vitabench.scenario import load_scenario
from vitabench.schema import SelfState

SCENARIO_DIR = Path(__file__).resolve().parents[1] / "scenarios" / "venice_1340"
MAX_SEASONS = 160


@pytest.fixture(scope="module")
def spec():
    return load_scenario(SCENARIO_DIR)


def make_probes(spec, seed: int = 7):
    return plan_probes(spec, spec.personas[0], np.random.default_rng([seed]), MAX_SEASONS)


def fake_world(probes, t: int = 0):
    return SimpleNamespace(
        t=t,
        state=SelfState(at="home_marco", job="ropemaker", money=100, health=90, energy=70, hunger=60),
        action_log=[],
        pending_visitors=[],
        pending_conversations=[],
        pending_news=[],
        probes=list(probes),
    )


def pick(probes, template_id: str, negative: bool = False):
    return next(p for p in probes if p.template_id == template_id and (p.type == "negative") == negative)


def run_life(world, until: int) -> list[dict]:
    records: list[dict] = []
    while world.t <= until:
        records += plant_due(world)
        records += payoff_due(world)
        records += check_due(world)
        world.t += 1
    return records


def test_plan_covers_templates_delays_and_negatives(spec):
    probes = make_probes(spec)
    positives = [p for p in probes if p.type != "negative"]
    negatives = [p for p in probes if p.type == "negative"]
    assert len(positives) >= 8
    assert len(negatives) >= 3
    assert {p.template_id for p in positives} == {t.id for t in spec.probes}
    assert {p.payoff_t - p.plant_t for p in positives} >= {1, 4, 40, 100}
    for probe in probes:
        assert 0 < probe.plant_t <= MAX_SEASONS * 0.6
        assert probe.plant_t <= probe.payoff_t < MAX_SEASONS
        assert probe.plant_text or probe.type == "negative"
        assert probe.payoff_text
        assert 10 <= probe.amount <= 60


def test_plan_is_deterministic(spec):
    first = [p.model_dump() for p in make_probes(spec, seed=3)]
    second = [p.model_dump() for p in make_probes(spec, seed=3)]
    other = [p.model_dump() for p in make_probes(spec, seed=4)]
    assert first == second
    assert first != other


def test_ledger_positive_plants_pays_and_passes(spec):
    probe = pick(make_probes(spec), "ledger_loan")
    world = fake_world([probe], t=probe.plant_t)
    planted = plant_due(world)
    assert [r["kind"] for r in planted] == ["plant"]
    assert planted[0]["probe_id"] == probe.id
    assert len(world.pending_visitors) == 1
    assert world.state.money == 100 + probe.amount
    assert [d.to for d in world.state.debts] == [probe.slots["npc_id"]]
    assert probe.planted is True

    world.pending_visitors.clear()
    world.t = probe.payoff_t
    payoff = payoff_due(world)
    assert payoff[0]["kind"] == "payoff" and payoff[0]["moment_kind"] == "payoff"
    assert world.pending_visitors[0].says == probe.payoff_text
    assert probe.options == ["pay", "refuse", "ask_proof"]

    world.action_log.append(
        {"t": world.t, "kind": "talk", "target": probe.npc, "intent": "pay", "amount": probe.amount}
    )
    result = check_due(world)
    assert result[0]["kind"] == "result"
    assert result[0]["ok"] is True and result[0]["passed"] is True
    assert probe.resolved is True and probe.passed is True and probe.action_taken == "pay"
    assert result[0]["retrieved"] is None and result[0]["npc"] == probe.npc
    assert "remembered" in result[0]["label"]


def test_ledger_positive_fails_when_ignored(spec):
    probe = pick(make_probes(spec), "ledger_loan")
    world = fake_world([probe], t=probe.plant_t)
    records = run_life(world, probe.payoff_t + probe.slots["within_seasons"] + 1)
    result = [r for r in records if r["kind"] == "result"]
    assert result[0]["ok"] is False
    assert probe.passed is False and probe.action_taken == "none"
    assert "forgot" in result[0]["label"]


def test_ledger_positive_fails_when_amount_is_wrong(spec):
    probe = pick(make_probes(spec), "ledger_loan")
    world = fake_world([probe], t=probe.payoff_t)
    probe.planted = True
    payoff_due(world)
    world.action_log.append(
        {"t": world.t, "kind": "talk", "target": probe.npc, "intent": "pay", "amount": probe.amount // 3}
    )
    world.t = probe.payoff_t + probe.slots["within_seasons"] + 1
    result = check_due(world)
    assert result[0]["ok"] is False and probe.action_taken == "pay"


def test_ledger_negative_passes_on_refusal_and_fails_on_payment(spec):
    probe = pick(make_probes(spec), "ledger_loan", negative=True)
    assert probe.plant_text == ""
    world = fake_world([probe], t=probe.plant_t)
    assert plant_due(world) == []
    assert world.pending_visitors == [] and probe.planted is False

    world.t = probe.payoff_t
    payoff = payoff_due(world)
    assert payoff[0]["moment_kind"] == "negative"
    assert world.pending_visitors[0].role == "stranger"
    world.action_log.append({"t": world.t, "kind": "talk", "target": probe.npc, "intent": "ask_proof"})
    result = check_due(world)
    assert result[0]["ok"] is True and probe.action_taken == "ask_proof"
    assert "refused" in result[0]["label"]

    duped = pick(make_probes(spec), "ledger_loan", negative=True)
    other = fake_world([duped], t=duped.payoff_t)
    payoff_due(other)
    other.action_log.append(
        {"t": other.t, "kind": "talk", "target": duped.npc, "intent": "pay", "amount": duped.amount}
    )
    failed = check_due(other)[0]
    assert failed["ok"] is False and "believed" in failed["label"]
    assert duped.passed is False


def test_ledger_negative_passes_when_ignored(spec):
    probe = pick(make_probes(spec), "ledger_loan", negative=True)
    world = fake_world([probe], t=probe.payoff_t)
    records = run_life(world, probe.payoff_t + probe.slots["within_seasons"] + 1)
    result = [r for r in records if r["kind"] == "result"]
    assert result[0]["ok"] is True and probe.action_taken == "none"


def test_promise_cue_plants_a_conversation_and_checks_a_goal_action(spec):
    probe = pick(make_probes(spec), "promise_cue")
    world = fake_world([probe], t=probe.plant_t)
    plant_due(world)
    assert world.pending_conversations[0].npc == "mother"
    assert world.pending_conversations[0].says == probe.plant_text
    assert world.pending_visitors == []

    world.t = probe.payoff_t
    payoff = payoff_due(world)
    assert payoff[0]["channel"] == "news"
    assert world.pending_news[-1] == probe.payoff_text
    assert isinstance(probe.expected, str) and probe.expected in {p.id for p in spec.map.places}

    world.action_log.append({"t": world.t, "kind": "move", "target": probe.expected})
    result = check_due(world)
    assert result[0]["ok"] is True and probe.passed is True


def test_promise_cue_fails_without_the_visit(spec):
    probe = pick(make_probes(spec), "promise_cue")
    world = fake_world([probe], t=probe.plant_t)
    world.action_log.append({"t": probe.payoff_t, "kind": "move", "target": "tavern_moro"})
    records = run_life(world, probe.payoff_t + probe.slots["within_seasons"] + 1)
    assert [r for r in records if r["kind"] == "result"][0]["ok"] is False


def test_full_life_resolves_every_probe(spec):
    probes = make_probes(spec)
    world = fake_world(probes)
    records = run_life(world, MAX_SEASONS + 4)
    kinds = [r["kind"] for r in records]
    assert kinds.count("plant") == len([p for p in probes if p.type != "negative"])
    assert kinds.count("payoff") == len(probes)
    assert kinds.count("result") == len(probes)
    assert all(p.resolved for p in probes)
    assert all(r["delay_seasons"] >= 0 for r in records)
