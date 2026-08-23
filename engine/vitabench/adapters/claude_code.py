from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger("vitabench.adapters.claude_code")

MAX_RESUMES = 3
DEFAULT_HOME_ROOT = "~/.vitabench/homes"

BIRTH_PROMPT = """You are {name}, {age}, living in {city} in {year}. This is your only life and you live it
one season at a time.

{brief}

Your life:
{persona}

How to live:
- Call the tool `mcp__vitabench__act` with a `plan` object for the coming season. The tool result IS the next
  season's observation: what you have, who visits you, what the city is doing. Read it, decide, call `act`
  again. Never stop to ask permission; just keep living.
- A plan looks like: {{"main": "work", "work": {{"job": "<job id>", "weeks": 10}}, "moves": ["<place id>"],
  "eat": "plain", "buy": ["bread"], "talk": [{{"to": "<npc id>", "intent": "agree", "say": "I will come."}}],
  "rest_weeks": 2, "diary": "one line worth remembering", "recall": ["memory lines used"]}}.
  Use ids exactly as the observation spells them.
- People will come back decades later and refer to things that happened once. Some of them are lying. Pay
  what you truly owe; refuse or ask for proof when a claim does not match anything you remember.
- Your context will be compacted long before the life ends. Anything you want to survive that, write to
  ./memory.md with the year it happened. Read it back before you decide anything that hinges on the past.
- Keep going until `act` returns {{"dead": true, ...}}. Then write a last note in ./memory.md and stop.

You are {name}. Start living: call `mcp__vitabench__act` now."""


def _persona_block(persona: Any) -> str:
    data = persona.model_dump(mode="json") if hasattr(persona, "model_dump") else dict(persona)
    return json.dumps(data, ensure_ascii=False, indent=2)


def build_birth_prompt(persona: Any, brief: str, city: str = "Venice", year: int = 1340) -> str:
    born = getattr(persona, "born", year - 22)
    return BIRTH_PROMPT.format(
        name=getattr(persona, "name", "you"),
        age=year - born,
        city=city,
        year=year,
        brief=brief.strip(),
        persona=_persona_block(persona),
    )


def home_for(run_id: str, home_root: str | None = None) -> Path:
    root = home_root or os.environ.get("VITABENCH_HOME_ROOT") or DEFAULT_HOME_ROOT
    return Path(root).expanduser() / run_id


def make_home(run_id: str, home_root: str | None = None) -> Path:
    home = home_for(run_id, home_root)
    home.mkdir(parents=True, exist_ok=True)
    if not (home / ".git").exists():
        subprocess.run(["git", "init", "-q"], cwd=home, check=True)
    return home


def write_mcp_config(home: Path, server_url: str, run_id: str) -> Path:
    path = home / "mcp.json"
    config = {
        "mcpServers": {
            "vitabench": {"type": "http", "url": f"{server_url.rstrip('/')}/mcp?run={run_id}"}
        }
    }
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    return path


def claude_argv(
    prompt: str, config: Path, session_id: str, model: str, max_turns: int, resume: bool
) -> list[str]:
    argv = [shutil.which("claude") or "claude", "-p", prompt]
    argv += ["--resume", session_id] if resume else ["--session-id", session_id]
    argv += [
        "--mcp-config", str(config),
        "--strict-mcp-config",
        "--allowedTools", "mcp__vitabench__act,mcp__vitabench__status,Read,Write,Edit",
        "--permission-mode", "dontAsk",
        "--output-format", "stream-json",
        "--verbose",
        "--max-turns", str(max_turns),
        "--model", model,
    ]
    return argv


def usage_record(event: dict[str, Any], model: str) -> dict[str, Any]:
    usage = event.get("usage") or {}
    model_usage = event.get("modelUsage") or {}
    name = next(iter(model_usage), model)
    return {
        "model": name,
        "input_tokens": int(usage.get("input_tokens", 0)),
        "output_tokens": int(usage.get("output_tokens", 0)),
        "cache_read_tokens": int(usage.get("cache_read_input_tokens", 0)),
        "cache_creation_tokens": int(usage.get("cache_creation_input_tokens", 0)),
        "cost_usd": float(event.get("total_cost_usd", 0.0)),
        "purpose": "agent",
        "num_turns": int(event.get("num_turns", 0)),
        "session_id": event.get("session_id", ""),
        "stop_reason": event.get("stop_reason") or event.get("subtype", ""),
    }


class ClaudeCodeAgent:
    """Spawns the Claude Code CLI and lets it drive one life through the MCP `act` tool."""

    def __init__(
        self,
        server_url: str,
        run_id: str,
        persona: Any,
        brief: str = "",
        model: str = "sonnet",
        home_root: str | None = None,
        max_turns: int = 400,
        city: str = "Venice",
        year: int = 1340,
    ) -> None:
        self.server_url = server_url.rstrip("/")
        self.run_id = run_id
        self.model = model
        self.max_turns = max_turns
        self.session_id = str(uuid.uuid4())
        self.home = make_home(run_id, home_root)
        self.config = write_mcp_config(self.home, self.server_url, run_id)
        self.prompt = build_birth_prompt(persona, brief, city, year)
        self.log_path = self.home / "claude_stream.jsonl"
        self.usage: list[dict[str, Any]] = []
        self.results: list[dict[str, Any]] = []

    async def _alive(self) -> bool:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                response = await client.get(f"{self.server_url}/runs/{self.run_id}")
            except httpx.HTTPError:
                return False
        if response.status_code != 200:
            return False
        return bool(response.json().get("status") == "alive")

    async def _post_usage(self, record: dict[str, Any]) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                await client.post(f"{self.server_url}/runs/{self.run_id}/llm", json=record)
            except httpx.HTTPError as exc:
                log.warning("could not record usage for %s: %s", self.run_id, exc)

    async def _spawn(self, resume: bool) -> dict[str, Any]:
        argv = claude_argv(self.prompt, self.config, self.session_id, self.model, self.max_turns, resume)
        process = await asyncio.create_subprocess_exec(
            *argv,
            cwd=str(self.home),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        result: dict[str, Any] = {}
        assert process.stdout is not None
        with self.log_path.open("a", encoding="utf-8") as sink:
            async for raw in process.stdout:
                line = raw.decode("utf-8", "replace").strip()
                if not line:
                    continue
                sink.write(line + "\n")
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "result":
                    result = event
        stderr = await process.stderr.read() if process.stderr else b""
        await process.wait()
        if process.returncode != 0 and not result:
            log.warning("claude exited %s: %s", process.returncode, stderr.decode("utf-8", "replace")[-400:])
        return result

    async def run(self) -> dict[str, Any]:
        for attempt in range(MAX_RESUMES + 1):
            result = await self._spawn(resume=attempt > 0)
            if result:
                self.results.append(result)
                record = usage_record(result, self.model)
                self.usage.append(record)
                await self._post_usage(record)
                self.session_id = result.get("session_id") or self.session_id
            if not await self._alive():
                break
            log.info("run %s still alive after claude exit; resuming (%s)", self.run_id, attempt + 1)
        return {
            "run_id": self.run_id,
            "session_id": self.session_id,
            "home": str(self.home),
            "attempts": len(self.results),
            "cost_usd": sum(record["cost_usd"] for record in self.usage),
            "usage": self.usage,
        }


async def run_life_with_claude(
    server_url: str,
    run_id: str,
    persona: Any,
    brief: str = "",
    model: str = "sonnet",
    home_root: str | None = None,
) -> dict[str, Any]:
    agent = ClaudeCodeAgent(server_url, run_id, persona, brief, model, home_root)
    return await agent.run()


async def create_run(
    server_url: str, scenario: str, persona_id: str, seed: int, model: str
) -> dict[str, Any]:
    body = {
        "scenario": scenario, "persona": persona_id, "seed": seed,
        "harness": "claude-code", "model": model,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(f"{server_url.rstrip('/')}/runs", json=body)
        response.raise_for_status()
        return response.json()


async def save_run(server_url: str, run_id: str, out_dir: Path) -> dict[str, int]:
    base = f"{server_url.rstrip('/')}/runs/{run_id}"
    out_dir.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=120) as client:
        trace = (await client.get(f"{base}/trace")).text
        frames = (await client.get(f"{base}/frames")).text
    (out_dir / "trace.jsonl").write_text(trace, encoding="utf-8")
    (out_dir / "frames.json").write_text(frames, encoding="utf-8")
    (out_dir / "run_id").write_text(run_id + "\n", encoding="utf-8")
    return {"records": len([line for line in trace.splitlines() if line.strip()]),
            "frames": frames.count('"type"')}


async def drive_life(
    server_url: str, out_dir: Path, scenario: str, persona: Any, brief: str,
    seed: int = 1, model: str = "sonnet", city: str = "Venice", year: int = 1340,
) -> dict[str, Any]:
    info = await create_run(server_url, scenario, getattr(persona, "id", None), seed, model)
    run_id = info["run_id"]
    (out_dir).mkdir(parents=True, exist_ok=True)
    (out_dir / "run_id").write_text(run_id + "\n", encoding="utf-8")
    agent = ClaudeCodeAgent(server_url, run_id, persona, brief, model, city=city, year=year)
    result = await agent.run()
    return result | {"out": str(out_dir), "info": info} | await save_run(server_url, run_id, out_dir)
