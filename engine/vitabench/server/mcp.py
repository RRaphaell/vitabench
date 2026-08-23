from __future__ import annotations

from contextvars import ContextVar
from typing import Any
from urllib.parse import parse_qs

from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.routing import Route
from starlette.types import Receive, Scope, Send

from vitabench.server.live import ALIVE, REGISTRY, LiveLife

RUN_HEADER = "x-vitabench-run"
CURRENT_RUN: ContextVar[str] = ContextVar("vitabench_run", default="")

INSTRUCTIONS = (
    "VitaBench: you are living one human life. Call act(plan) once per season; the tool result is the "
    "next observation. Keep calling until it returns dead=true."
)

ACT_DESCRIPTION = (
    "Live one season of your life. `plan` is a JSON object: "
    '{"main": "work|rest|seek_job|travel", "work": {"job": "<job id>", "weeks": 0-13}, '
    '"moves": ["<place id>"], "eat": "poor|plain|good", "buy": ["<item id>"], '
    '"talk": [{"to": "<npc id>", "intent": "chat|agree|refuse|pay|ask_proof|promise|lend|borrow", '
    '"say": "<words>", "amount": <ducats>}], "rest_weeks": 0-13, '
    '"answers": [{"question_id": "<id>", "answer": "<text>"}], "diary": "<one line worth remembering>", '
    '"recall": ["the memory lines you used to decide"]}. '
    "Returns the next observation, or {dead: true, summary: {...}} when the life ends."
)

mcp_server: MCPServer = MCPServer("vitabench", instructions=INSTRUCTIONS, version="0.1.0")


def _life() -> LiveLife:
    run_id = CURRENT_RUN.get()
    life = REGISTRY.get(run_id) if run_id else REGISTRY.only_live()
    if life is None:
        raise ValueError(
            f"no such run {run_id!r}; pass ?run=<run_id> on the MCP url or the {RUN_HEADER} header"
        )
    return life


@mcp_server.tool(name="act", description=ACT_DESCRIPTION)
async def act(plan: dict[str, Any]) -> dict[str, Any]:
    return await _life().act(plan)


@mcp_server.tool(name="status", description="Report this life's run id, season, status and cost so far.")
async def status() -> dict[str, Any]:
    run_id = CURRENT_RUN.get()
    life = REGISTRY.get(run_id) if run_id else REGISTRY.only_live()
    if life is None:
        return {"run_id": run_id, "found": False, "runs": [row["run_id"] for row in REGISTRY.listing()]}
    info = life.info()
    info["alive"] = life.status == ALIVE
    return info


class RunScope:
    """Binds the `?run=` query parameter (or the run header) to the tool call it arrived with."""

    def __init__(self, inner: Any) -> None:
        self.inner = inner

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        query = parse_qs(scope.get("query_string", b"").decode())
        run = (query.get("run") or [""])[0]
        if not run:
            for key, value in scope.get("headers", []):
                if key.decode().lower() == RUN_HEADER:
                    run = value.decode()
        token = CURRENT_RUN.set(run)
        try:
            await self.inner(scope, receive, send)
        finally:
            CURRENT_RUN.reset(token)


def mcp_routes(path: str = "/mcp") -> list[Route]:
    app = mcp_server.streamable_http_app(
        streamable_http_path=path,
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    routes: list[Route] = []
    for route in app.routes:
        if isinstance(route, Route):
            route.app = RunScope(route.app)
            routes.append(route)
    return routes


def session_manager() -> Any:
    return mcp_server.session_manager
