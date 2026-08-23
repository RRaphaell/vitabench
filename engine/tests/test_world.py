from __future__ import annotations

import time

import pytest

from vitabench.director import build_script
from vitabench.frames import end, frame, hello
from vitabench.schema import Main, Plan, ScenarioSpec, TalkItem
from vitabench.world import World

SPEC_DATA = {
    "id": "testville_1340",
    "city": "Testville",
    "start_year": 1340,
    "max_years": 40,
    "currency": "ducats",
    "start_age_default": 22,
    "hazards": {"fire": 0.002, "theft": 0.003, "illness": 0.004, "price_shock": 0.002},
    "map": {
        "size": {"cols": 8, "rows": 6},
        "water": [{"kind": "canal", "axis": "x", "at": 3}],
        "districts": [
            {"id": "north", "name": "North", "tiles": [[0, 0], [7, 2]]},
            {"id": "south", "name": "South", "tiles": [[0, 3], [7, 5]]},
        ],
        "places": [
            {"id": "home_hero", "kind": "home", "district": "north", "xz": [1, 1], "name": "Hero's house"},
            {"id": "home_common", "kind": "home", "district": "south", "xz": [6, 4], "name": "Row house"},
            {"id": "yard", "kind": "work", "district": "north", "xz": [5, 1], "name": "Rope yard"},
            {"id": "market", "kind": "market", "district": "south", "xz": [4, 4], "name": "Market"},
            {"id": "tavern", "kind": "tavern", "district": "south", "xz": [2, 5], "name": "The Moor"},
        ],
        "landmarks": [{"id": "campanile", "kind": "campanile", "xz": [4, 2]}],
    },
    "economy": {
        "jobs": [
            {
                "id": "ropemaker",
                "title": "rope-maker",
                "place": "yard",
                "wage_week": 6,
                "health_week": -1,
                "energy_week": -8,
            },
            {
                "id": "merchant",
                "title": "spice merchant",
                "place": "market",
                "wage_week": 14,
                "requires": {"money": 200},
            },
        ],
        "items": [
            {"id": "bread", "price": 1, "effects": {"hunger": 30}},
            {"id": "warehouse", "price": 300, "effects": {"asset": "warehouse"}},
        ],
        "price_index": {1340: 1.0, 1348: 1.9, 1360: 1.2},
    },
    "events": [
        {
            "year": 1348,
            "season": 1,
            "id": "black_death",
            "kind": "plague",
            "text": "The Black Death reaches Testville",
            "effects": {"illness_mult": 12, "npc_death_rate": 0.35, "price_mult": 1.8},
            "duration_seasons": 4,
        }
    ],
    "cast": {
        "roles": [
            {
                "role": "merchant",
                "count": 4,
                "routine": ["home", "market", "market", "tavern", "home"],
                "name_pool": "venetian_male",
                "class": "merchant",
                "home_district": "south",
            },
            {
                "role": "fishwife",
                "count": 3,
                "routine": ["home", "market", "home", "home", "tavern"],
                "name_pool": "venetian_female",
                "class": "poor",
            },
        ],
        "name_pools": {
            "venetian_male": ["Marco", "Andrea", "Pietro", "Giovanni"],
            "venetian_female": ["Caterina", "Lucia", "Maria"],
            "families": ["Dandolo", "Ziani", "Ferrer", "Morosini"],
        },
    },
    "personas": [
        {
            "id": "marco",
            "name": "Marco Dandolo",
            "born": 1318,
            "sex": "male",
            "job": "ropemaker",
            "home": "home_hero",
            "district": "north",
            "money": 60,
            "health": 92,
            "energy": 80,
            "hunger": 70,
            "family": {"mother": {"name": "Agnese", "alive": True}},
            "goals": [
                {"id": "warehouse", "text": "own a warehouse", "check": {"asset": "warehouse"}},
                {"id": "debt_free", "text": "die without debts", "check": {"debt": 0}},
            ],
            "debts": [{"to": "ziani", "amount": 40, "due_year": 1344}],
            "relationships": [{"npc": "mother", "trust": 0.9}],
            "backstory": "Son of a rope-maker.",
        }
    ],
    "probes": [],
}


def make_spec(**overrides) -> ScenarioSpec:
    data = {**SPEC_DATA, **overrides}
    return ScenarioSpec.model_validate(data)


def make_world(seed: int = 7, **overrides) -> World:
    return World(make_spec(**overrides), "marco", seed)


def scripted_plan(t: int) -> Plan:
    if t % 5 == 4:
        return Plan(main=Main.rest, eat="good", rest_weeks=6, moves=["market"], buy=["bread"])
    if t % 7 == 3:
        return Plan(
            main=Main.work,
            work={"job": "ropemaker", "weeks": 9},
            eat="plain",
            talk=[TalkItem(to="mother", intent="chat", say="I am well")],
        )
    return Plan(main=Main.work, work={"job": "ropemaker", "weeks": 12}, eat="plain")


def run_seasons(world: World, n: int) -> list[str]:
    texts = []
    for _ in range(n):
        if not world.alive:
            break
        texts.append(world.observe().text)
        world.step_season(scripted_plan(world.t))
    return texts


def test_determinism_same_seed_same_plans():
    a, b = make_world(3), make_world(3)
    texts_a, texts_b = run_seasons(a, 24), run_seasons(b, 24)
    assert texts_a == texts_b
    assert a.action_log == b.action_log
    assert [n.alive for n in a.roster.npcs] == [n.alive for n in b.roster.npcs]
    assert a.state.model_dump() == b.state.model_dump()


def test_different_seed_diverges():
    a, b = make_world(3), make_world(4)
    run_seasons(a, 24)
    run_seasons(b, 24)
    assert [e.id for e in a.script] != [e.id for e in b.script]


def test_script_is_deterministic_and_dated():
    spec = make_spec()
    first = build_script(spec, 11)
    assert [e.model_dump() for e in first] == [e.model_dump() for e in build_script(spec, 11)]
    plague = next(e for e in first if e.id == "black_death")
    assert plague.t == (1348 - 1340) * 4 + 1
    assert all(e.t < spec.max_years * 4 for e in first)
    assert any(e.source == "hazard" for e in first)


def test_needs_decay_without_food_or_work():
    world = make_world(5)
    world.state.money = 0
    world.state.hunger = 40
    before = world.state.health
    world.step_season(Plan(main=Main.rest, eat="plain", rest_weeks=0))
    assert world.state.hunger == 0
    assert world.state.health < before


def test_work_pays_and_eating_restores():
    world = make_world(5)
    world.state.hunger = 30
    money_before = world.state.money
    world.step_season(Plan(main=Main.work, work={"job": "ropemaker", "weeks": 13}, eat="good"))
    assert world.state.money > money_before
    assert world.state.hunger > 30
    kinds = {a["kind"] for a in world.action_log}
    assert {"work", "eat"} <= kinds


def test_job_requirements_block_work():
    world = make_world(5)
    world.state.money = 10
    world.step_season(Plan(main=Main.work, work={"job": "merchant", "weeks": 13}, eat="poor"))
    assert any(a["kind"] == "work_failed" for a in world.action_log)
    assert not any(a["kind"] == "work" for a in world.action_log)


def test_death_by_health():
    world = make_world(9)
    world.state.money = 0
    world.state.health = 6
    world.state.hunger = 0
    world.step_season(Plan(main=Main.rest, eat="plain"))
    assert not world.alive
    summary = world.death_summary()
    assert summary.cause in ("starvation", "illness")
    assert summary.age >= 22
    assert world.step_season(Plan(main=Main.rest)) == []


def test_plague_kills_npcs_and_lifts_prices():
    world = make_world(7)
    plague_t = (1348 - 1340) * 4 + 1
    living_before = None
    while world.t < plague_t and world.alive:
        if world.t == plague_t - 1:
            living_before = len(world.roster.alive_npcs())
        world.step_season(scripted_plan(world.t))
    assert world.alive, "hero should survive to the plague with this seed"
    assert any(e.kind == "plague" for e in world.active_events)
    assert world.in_plague()
    assert len(world.roster.alive_npcs()) < living_before
    assert world.market()["bread"] > make_world(7).market()["bread"]
    assert any(ev["kind"] == "plague" for ev in world.season_events)


def test_talk_pay_settles_debt():
    world = make_world(5)
    world.state.money = 100
    world.step_season(
        Plan(main=Main.rest, eat="plain", talk=[TalkItem(to="ziani", intent="pay", amount=40)])
    )
    assert not any(d.to == "ziani" for d in world.state.debts)
    entry = next(a for a in world.action_log if a["intent"] == "pay")
    assert entry["target"] == "ziani" and entry["amount"] == 40


def test_borrow_creates_debt_and_lend_costs_money():
    world = make_world(5)
    start = world.state.money
    world.step_season(
        Plan(main=Main.rest, eat="poor", talk=[TalkItem(to="market_man", intent="borrow", amount=30)])
    )
    assert any(d.to == "market_man" and d.amount == 30 for d in world.state.debts)
    assert world.state.money > start


def test_observation_contract():
    world = make_world(2)
    obs = world.observe()
    assert obs.date == "Spring 1340"
    assert obs.age == 22
    assert obs.market["bread"] >= 1
    assert obs.goals and obs.text
    assert len(obs.text.split()) < 300
    assert any(c.npc == "mother" for c in obs.conversations)


def test_npc_routines_move_over_time():
    world = make_world(2)
    npc = world.roster.npcs[0]
    seen = {world.roster.position_at(npc.id, t, 0) for t in range(6)}
    assert len(seen) > 1
    assert world.roster.reply(npc, "chat")


def test_world_satisfies_the_frame_contract():
    world = make_world(2)
    greeting = hello(world, "r_test", "none", "mock", 2)
    assert greeting.scenario_id == "testville_1340"
    assert len(greeting.roster) == len(world.roster.npcs)
    assert all(r.model.startswith("character-") for r in greeting.roster)
    run_seasons(world, 6)
    f = frame(world)
    assert f.hero.xz == tuple(world.places[world.state.at].xz)
    assert len(f.people) == len(world.roster.npcs)
    assert f.hero.activity.icon and len(f.hero.activity.text.split()) <= 4
    first = world.roster.npcs[0]
    world.met.add(first.id)
    world.memory_lines = [f"1341 — {first.name} lent me 30 ducats"]
    assert any(r.agent for r in frame(world).relations)
    assert end(world, {"H": 0.5}, 0.12).cost_usd == 0.12


def test_full_forty_year_life_is_fast():
    start = time.perf_counter()
    world = make_world(1)
    seasons = 0
    while world.alive and world.t < world.max_t:
        world.observe()
        world.step_season(scripted_plan(world.t))
        seasons += 1
    elapsed = time.perf_counter() - start
    assert elapsed < 5.0, f"life took {elapsed:.2f}s"
    assert seasons > 40
    summary = world.death_summary()
    assert summary.years_lived >= 10
    assert isinstance(world.goals_met(), list)


@pytest.mark.parametrize("seed", [0, 1, 2, 3, 4])
def test_lives_end_with_a_cause(seed: int):
    world = make_world(seed)
    while world.alive and world.t < world.max_t:
        world.step_season(scripted_plan(world.t))
    assert world.death_summary().cause
