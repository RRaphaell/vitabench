from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel
from starlette.staticfiles import StaticFiles

from vitabench.server.live import ALIVE, REGISTRY, LiveUnavailable, frames_for, runs_root
from vitabench.server.mcp import mcp_routes, mcp_server

log = logging.getLogger("vitabench.server")

WEB_DIST = Path(__file__).resolve().parents[3] / "web" / "dist"


class RunRequest(BaseModel):
    scenario: str = "venice_1340"
    persona: str | None = None
    seed: int = 1
    harness: str = "claude-code"
    model: str = "sonnet"
    run_id: str | None = None
    start: bool = True


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    async with mcp_server.session_manager.run():
        yield


def _run_dir(run_id: str) -> Path:
    life = REGISTRY.get(run_id)
    if life is not None:
        return life.run_dir
    path = runs_root() / run_id
    if not (path / "trace.jsonl").exists():
        raise HTTPException(404, f"no trace for run {run_id}")
    return path


def create_app() -> FastAPI:
    app = FastAPI(title="vitabench", version="0.1.0", lifespan=_lifespan)

    @app.post("/runs")
    async def create_run(body: RunRequest) -> dict[str, Any]:
        try:
            life = REGISTRY.create(
                scenario=body.scenario,
                persona=body.persona,
                seed=body.seed,
                harness=body.harness,
                model=body.model,
                run_id=body.run_id,
            )
            if body.start:
                await life.start()
        except LiveUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        info = life.info()
        info["mcp_url"] = f"/mcp?run={life.run_id}"
        info["ws_url"] = f"/ws/{life.run_id}"
        return info

    @app.get("/runs")
    def list_runs() -> list[dict[str, Any]]:
        return REGISTRY.listing()

    @app.get("/runs/leaderboard.json")
    def leaderboard() -> Any:
        path = runs_root() / "leaderboard.json"
        if not path.exists():
            raise HTTPException(404, "no leaderboard.json yet")
        return JSONResponse(json.loads(path.read_text(encoding="utf-8")))

    @app.get("/runs/{run_id}")
    def run_info(run_id: str) -> dict[str, Any]:
        life = REGISTRY.get(run_id)
        if life is not None:
            return life.info()
        for row in REGISTRY.listing():
            if row["run_id"] == run_id:
                return row
        raise HTTPException(404, f"no such run {run_id}")

    @app.post("/runs/{run_id}/llm")
    def record_llm(run_id: str, record: dict[str, Any]) -> dict[str, Any]:
        life = REGISTRY.get(run_id)
        if life is None:
            raise HTTPException(404, f"run {run_id} is not live")
        life.trace.write("llm", life.t, record, cost_usd=float(record.get("cost_usd") or 0.0))
        return {"run_id": run_id, "cost_usd": round(life.trace.cost_usd, 6)}

    @app.get("/runs/{run_id}/trace", response_class=PlainTextResponse)
    def run_trace(run_id: str) -> str:
        return (_run_dir(run_id) / "trace.jsonl").read_text(encoding="utf-8")

    @app.get("/runs/{run_id}/frames")
    def run_frames(run_id: str) -> list[dict[str, Any]]:
        life = REGISTRY.get(run_id)
        if life is not None and life.frames:
            return life.frames
        return frames_for(_run_dir(run_id))

    @app.websocket("/ws/{run_id}")
    async def ws(socket: WebSocket, run_id: str) -> None:
        await socket.accept()
        life = REGISTRY.get(run_id)
        if life is None:
            try:
                frames = frames_for(runs_root() / run_id)
            except (FileNotFoundError, ValueError):
                await socket.send_json({"type": "error", "message": f"no such run {run_id}"})
                await socket.close()
                return
            for frame in frames:
                await socket.send_json(frame)
            await _ws_idle(socket)
            return
        queue = life.subscribe()
        getter = asyncio.create_task(queue.get())
        reader = asyncio.create_task(socket.receive_text())
        try:
            for frame in list(life.frames):
                await socket.send_json(frame)
            while True:
                done, _ = await asyncio.wait({getter, reader}, return_when=asyncio.FIRST_COMPLETED)
                if getter in done:
                    await socket.send_json(getter.result())
                    getter = asyncio.create_task(queue.get())
                if reader in done:
                    await _handle_command(socket, reader.result(), life.status == ALIVE)
                    reader = asyncio.create_task(socket.receive_text())
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            getter.cancel()
            reader.cancel()
            life.subscribers.discard(queue)

    if WEB_DIST.is_dir():
        app.mount("/", StaticFiles(directory=str(WEB_DIST), html=True), name="web")

    for route in mcp_routes():
        app.router.routes.insert(0, route)
    return app


async def _handle_command(socket: WebSocket, raw: str, alive: bool) -> None:
    try:
        message = json.loads(raw)
    except json.JSONDecodeError:
        return
    if message.get("cmd") == "ping":
        await socket.send_json({"type": "pong", "alive": alive})


async def _ws_idle(socket: WebSocket) -> None:
    try:
        while True:
            await _handle_command(socket, await socket.receive_text(), False)
    except (WebSocketDisconnect, RuntimeError):
        return


app = create_app()


def serve(port: int = 8700, host: str = "127.0.0.1", log_level: str = "info") -> None:
    import uvicorn

    uvicorn.run(app, host=host, port=port, log_level=log_level)
