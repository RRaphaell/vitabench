from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from vitabench.scenario import ScenarioError, load_scenario, validate_report

SCENARIO_DIR = Path(__file__).resolve().parents[1] / "scenarios" / "venice_1340"


@pytest.fixture(scope="module")
def spec():
    return load_scenario(SCENARIO_DIR)


def test_loads_from_folder_and_from_file(spec):
    assert spec.id == "venice_1340"
    assert spec.city == "Venice"
    assert spec.start_year == 1340
    assert spec.max_years == 40
    assert load_scenario(SCENARIO_DIR / "scenario.yaml").id == spec.id


def test_validate_report_counts(spec):
    report = validate_report(spec)
    assert report["places"] >= 14
    assert report["jobs"] == 6
    assert report["events"] >= 13
    assert report["roles"] == 10
    assert report["npcs"] >= 40
    assert report["personas"] == 2
    assert report["probes"] == 6
    assert report["districts"] == 6
    assert report["landmarks"] == 6


def test_map_grid_and_canals(spec):
    assert spec.map.size == {"cols": 24, "rows": 18}
    assert {w.at for w in spec.map.water if w.axis == "x"} == {7, 16}
    assert {w.at for w in spec.map.water if w.axis == "z"} == {5, 12}
    place_ids = {p.id for p in spec.map.places}
    required = {
        "home_marco", "home_caterina", "arsenale", "rialto", "san_marco",
        "san_zaccaria", "tavern_moro", "tavern_gallo", "dock", "murano", "notary",
    }
    assert required <= place_ids
    assert {lm.id for lm in spec.map.landmarks} >= {"basilica", "campanile", "rialto_bridge", "furnace"}


def test_economy_wages_and_prices(spec):
    wages = {job.id: job.wage_week for job in spec.economy.jobs}
    assert set(wages) == {"ropemaker", "gondolier", "glassblower", "merchant", "notary_clerk", "dockhand"}
    assert all(4 <= wage <= 12 for wage in wages.values())
    prices = {item.id: item.price for item in spec.economy.items}
    assert prices["bread"] == 1 and prices["good_meal"] == 4 and prices["medicine"] == 12
    assert prices["warehouse"] == 300 and prices["boat"] == 80
    assert spec.economy.price_index[1348] == pytest.approx(1.9)
    assert spec.economy.price_index[1378] == pytest.approx(1.7)


def test_history_events(spec):
    by_id = {event.id: event for event in spec.events}
    plague = by_id["black_death"]
    assert plague.year == 1348 and plague.kind == "plague" and plague.duration_seasons == 4
    assert plague.effects["illness_mult"] == 12
    assert plague.effects["npc_death_rate"] == pytest.approx(0.35)
    war = by_id["chioggia"]
    assert war.year == 1378 and war.kind == "war" and war.duration_seasons == 13
    assert war.effects["trade_mult"] == pytest.approx(0.3) and war.effects["loan_calls"] is True
    assert by_id["falier"].year == 1355 and by_id["plague_2"].year == 1361
    assert by_id["acqua_alta"].kind == "flood" and by_id["plague_3"].year == 1382
    assert len(spec.events) >= 13


def test_cast_roster_and_personas(spec):
    counts = {role.role: role.count for role in spec.cast.roles}
    assert counts["merchant"] == 8 and counts["fishwife"] == 6 and counts["noble"] == 5
    assert counts["widow_innkeeper"] == 1
    assert sum(counts.values()) >= 40
    families = set(spec.cast.name_pools["families"])
    assert {"Dandolo", "Ziani", "Ferrer", "Morosini"} <= families
    assert {"Contarini", "Gritti", "Foscari", "Vialli"} <= families
    personas = {p.id: p for p in spec.personas}
    assert set(personas) == {"marco", "caterina"}
    marco = personas["marco"]
    assert marco.job == "ropemaker" and marco.born == 1318
    assert marco.family["mother"]["alive"] is True
    assert [d.model_dump() for d in marco.debts] == [{"to": "ziani", "amount": 40, "due_year": 1344}]
    assert {g.id for g in marco.goals} == {"warehouse", "family", "debt_free"}
    caterina = personas["caterina"]
    assert caterina.born == 1321 and caterina.district == "murano"
    assert {g.id for g in caterina.goals} == {"own_furnace", "marry_well", "keep_recipe"}


def test_probe_templates(spec):
    by_id = {template.id: template for template in spec.probes}
    assert set(by_id) == {
        "ledger_loan", "promise_cue", "trust_trait", "lesson_rule", "family_fact", "news_fact",
    }
    for template in spec.probes:
        assert template.delays == [1, 4, 40, 100]
        assert template.plant.text and template.payoff.text
        assert template.check.kind in {"action", "goal_action", "answer"}
    assert sum(1 for t in spec.probes if t.negative_twin) >= 3


def _copy_scenario(tmp_path: Path) -> None:
    for source in SCENARIO_DIR.glob("*.yaml"):
        (tmp_path / source.name).write_text(source.read_text())


def test_missing_include_is_reported(tmp_path):
    _copy_scenario(tmp_path)
    root = yaml.safe_load((tmp_path / "scenario.yaml").read_text())
    root["includes"] = [name for name in root["includes"] if name != "cast.yaml"]
    (tmp_path / "scenario.yaml").write_text(yaml.safe_dump(root))
    with pytest.raises(ScenarioError) as err:
        load_scenario(tmp_path)
    assert "cast" in str(err.value)


def test_bad_reference_names_the_file(tmp_path):
    _copy_scenario(tmp_path)
    raw = yaml.safe_load((tmp_path / "economy.yaml").read_text())
    raw["jobs"][0]["place"] = "atlantis"
    (tmp_path / "economy.yaml").write_text(yaml.safe_dump(raw))
    with pytest.raises(ScenarioError) as err:
        load_scenario(tmp_path)
    assert "economy.yaml" in str(err.value) and "atlantis" in str(err.value)
