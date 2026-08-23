from __future__ import annotations

import asyncio
import json
import shutil
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from starlette.testclient import TestClient

from vitabench.adapters.mock import MockAgent
from vitabench.schema import Plan
from vitabench.server.app import create_app
from vitabench.server.harvest import HomeMemory, fill_retrieved, season_memory
from vitabench.server.live import REGISTRY

BASE = "http://engine.test"
SCENARIO = "venice_1340"


@pytest.fixture
def runs_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("VITABENCH_RUNS", str(tmp_path))
    REGISTRY.lives.clear()
    return tmp_path


def drive(body: Callable[[httpx.AsyncClient], Awaitable[Any]]) -> Any:
    async def go() -> Any:
        transport = httpx.ASGITransport(app=create_app())
        async with httpx.AsyncClient(transport=transport, base_url=BASE) as client:
            return await body(client)

    return asyncio.run(go())


async def _mock_life(client: httpx.AsyncClient, turns: int = 10) -> tuple[str, list[dict[str, Any]]]:
    response = await client.post(
        "/runs",
        json={"scenario": SCENARIO, "persona": "marco", "seed": 1,
              "harness": "mock", "model": "mock", "start": False},
    )
    assert response.status_code == 200, response.text
    run_id = response.json()["run_id"]
    life = REGISTRY.get(run_id)
    assert life is not None
    await life.start_mock(MockAgent(policy="sensible", seed=1), max_turns=turns)
    frames = (await client.get(f"/runs/{run_id}/frames")).json()
    return run_id, frames


def test_mock_run_frames_and_memory(runs_dir: Path) -> None:
    async def body(client: httpx.AsyncClient) -> None:
        run_id, frames = await _mock_life(client)
        assert frames[0]["type"] == "hello"
        seasons = [f for f in frames if f["type"] == "frame"]
        assert len(seasons) >= 5
        assert seasons[0]["date"].startswith("Spring")
        assert any(f["memory"]["wrote"] for f in seasons)

        trace = (await client.get(f"/runs/{run_id}/trace")).text
        records = [json.loads(line) for line in trace.splitlines() if line.strip()]
        kinds = [record["kind"] for record in records]
        assert kinds[0] == "birth" and "observation" in kinds and "plan" in kinds
        memory = [record for record in records if record["kind"] == "memory"]
        assert memory and memory[0]["payload"]["source"] in {"diary", "claude-home", "recall"}
        assert memory[0]["payload"]["wrote"]

        info = (await client.get(f"/runs/{run_id}")).json()
        assert info["status"] in {"alive", "dead"} and info["run_dir"].startswith(str(runs_dir))

    drive(body)


def test_static_run_directories(runs_dir: Path) -> None:
    async def body(client: httpx.AsyncClient) -> None:
        run_id, frames = await _mock_life(client, turns=4)
        shutil.copytree(runs_dir / run_id, runs_dir / "on_disk")
        REGISTRY.lives.clear()

        recorded = (await client.get("/runs/on_disk/frames")).json()
        assert recorded[0]["type"] == "hello"
        assert (await client.get("/runs/on_disk/trace")).text.count("\n") > 5

        cached = runs_dir / "cached"
        cached.mkdir()
        (cached / "frames.json").write_text(json.dumps(frames), encoding="utf-8")
        assert (await client.get("/runs/cached/frames")).json()[0]["type"] == "hello"

        (runs_dir / "leaderboard.json").write_text('[{"harness": "mock", "H": 0.5}]', encoding="utf-8")
        assert (await client.get("/runs/leaderboard.json")).json()[0]["harness"] == "mock"
        assert (await client.get("/runs/nope/frames")).status_code == 404

    drive(body)


def test_cors_and_websocket_hello(runs_dir: Path) -> None:
    client = TestClient(create_app(), base_url=BASE)
    created = client.post(
        "/runs",
        json={"scenario": SCENARIO, "persona": "marco", "seed": 2, "harness": "mock", "model": "mock"},
    )
    assert created.status_code == 200
    run_id = created.json()["run_id"]
    assert created.json()["ws_url"] == f"/ws/{run_id}"

    preflight = client.options(
        f"/runs/{run_id}",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:5173"

    with client.websocket_connect(f"/ws/{run_id}") as socket:
        socket.send_json({"cmd": "ping"})
        hello = socket.receive_json()
        assert hello["type"] == "hello" and hello["run_id"] == run_id
        seen = []
        while len(seen) < 4:
            seen.append(socket.receive_json())
            if seen[-1]["type"] == "pong":
                break
        assert seen[0]["type"] == "frame" and seen[-1] == {"type": "pong", "alive": True}


def test_claude_home_memory(runs_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VITABENCH_HOME_ROOT", str(tmp_path / "homes"))

    async def body(client: httpx.AsyncClient) -> None:
        info = (await client.post(
            "/runs",
            json={"scenario": SCENARIO, "persona": "marco", "seed": 3,
                  "harness": "claude-code", "model": "sonnet"},
        )).json()
        run_id = info["run_id"]
        home = Path(info["home"])
        assert home.name == run_id
        home.mkdir(parents=True, exist_ok=True)
        (home / "memory.md").write_text("1340: mother said the Ziani debt is real\n", encoding="utf-8")

        life = REGISTRY.get(run_id)
        assert life is not None
        await life.act({
            "main": "work", "work": {"job": "ropemaker", "weeks": 10}, "eat": "plain",
            "diary": "worked the ropewalk", "recall": ["1340: mother said the Ziani debt is real"],
        })

        seasons = [f for f in (await client.get(f"/runs/{run_id}/frames")).json() if f["type"] == "frame"]
        assert seasons[-1]["memory"]["wrote"] == [
            "1340: mother said the Ziani debt is real", "worked the ropewalk"
        ]
        assert seasons[-1]["memory"]["retrieved"] == ["1340: mother said the Ziani debt is real"]

        trace = (await client.get(f"/runs/{run_id}/trace")).text
        memory = [json.loads(line) for line in trace.splitlines() if line.strip()]
        record = [r for r in memory if r["kind"] == "memory"][-1]
        assert record["payload"]["source"] == "claude-home" and record["t"] == 1
        assert json.loads((runs_dir / run_id / "meta.json").read_text())["home"] == str(home)

    drive(body)


def test_fill_retrieved_prefers_recall_then_greps_memory(tmp_path: Path) -> None:
    home = tmp_path / "r_live"
    home.mkdir()
    (home / "memory.md").write_text("- 1341: Tomas Ferrer lent me 30 ducats\n", encoding="utf-8")
    payload = {"who": "Ines Ferrer", "npc": "tomas_ferrer"}

    grepped = fill_retrieved(payload, [], ["1342: bought bread"], home)
    assert grepped["retrieved"] == "1341: Tomas Ferrer lent me 30 ducats"
    assert grepped["retrieved_source"] == "memory-grep"
    assert fill_retrieved(payload, ["her father lent me 30"], [], home)["retrieved_source"] == "recall"
    assert "retrieved" not in fill_retrieved({"who": "Zorzi", "npc": "zorzi"}, [], [], home)


def test_home_memory_diff(tmp_path: Path) -> None:
    home = tmp_path / "r_test"
    home.mkdir()
    memory = home / "memory.md"
    memory.write_text("- 1341: Ziani lent me 40 ducats\n\n# notes\n", encoding="utf-8")
    harvester = HomeMemory(home)
    assert harvester.harvest() == ["1341: Ziani lent me 40 ducats", "notes"]
    assert harvester.harvest() == []

    memory.write_text(memory.read_text() + "1349: the plague took mother\n", encoding="utf-8")
    season = season_memory(harvester, Plan(diary="paid Ziani", recall=["1341: Ziani lent me 40 ducats"]))
    assert season["wrote"] == ["1349: the plague took mother", "paid Ziani"]
    assert season["retrieved"] == ["1341: Ziani lent me 40 ducats"]
    assert season["source"] == "claude-home"
