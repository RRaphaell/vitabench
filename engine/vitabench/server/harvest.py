from __future__ import annotations

import os
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from vitabench.recall import GREP_SOURCE, MEMORY_FILE, RECALL_JOIN, grep_memory, memory_file_lines
from vitabench.schema import Plan

PROBE_KINDS = ("probe_plant", "probe_payoff", "probe_result")
MAX_LINES = 12
MIN_LINE = 4


def auto_memory_dirs(home: Path) -> list[Path]:
    """Where Claude Code keeps memory for a project: its own file plus the harness auto-memory dir."""
    root = Path(os.environ.get("CLAUDE_CONFIG_DIR", "~/.claude")).expanduser()
    slug = str(home).replace("/", "-")
    return [root / "projects" / slug / "memory", home / ".claude" / "memory", home / "memory"]


class HomeMemory:
    def __init__(self, home: Path) -> None:
        self.home = home
        self.seen: dict[str, set[str]] = {}

    def files(self) -> list[Path]:
        found = [self.home / MEMORY_FILE]
        for directory in auto_memory_dirs(self.home):
            if directory.is_dir():
                found.extend(sorted(directory.rglob("*.md")))
        return [path for path in found if path.is_file()]

    def harvest(self) -> list[str]:
        fresh: list[str] = []
        for path in self.files():
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            seen = self.seen.setdefault(str(path), set())
            for raw in text.splitlines():
                line = raw.strip().lstrip("-*#> ").strip()
                if len(line) < MIN_LINE or line in seen:
                    continue
                seen.add(line)
                fresh.append(line)
        return fresh[:MAX_LINES]


def season_memory(harvester: HomeMemory | None, plan: Plan) -> dict[str, Any]:
    wrote = harvester.harvest() if harvester is not None else []
    source = "claude-home" if wrote else ""
    diary = plan.diary.strip()
    if diary and diary not in wrote:
        wrote.append(diary)
        source = source or "diary"
    retrieved = [line.strip() for line in plan.recall if line and line.strip()][:MAX_LINES]
    return {"wrote": wrote, "retrieved": retrieved, "source": source or "recall"}


def fill_retrieved(
    payload: dict[str, Any], recall: Sequence[str], known: Sequence[str], home: Path | None = None
) -> dict[str, Any]:
    if payload.get("retrieved"):
        return payload
    if recall:
        return payload | {"retrieved": RECALL_JOIN.join(recall), "retrieved_source": "recall"}
    lines = list(known) + memory_file_lines(home)
    hits = grep_memory(lines, str(payload.get("who") or ""), str(payload.get("npc") or ""))
    if not hits:
        return payload
    return payload | {"retrieved": RECALL_JOIN.join(hits), "retrieved_source": GREP_SOURCE}


def frame_memory(season: dict[str, Any] | None) -> dict[str, list[str]] | None:
    if not season:
        return None
    return {"wrote": list(season.get("wrote", [])), "retrieved": list(season.get("retrieved", []))}


def _normalize(item: Any) -> tuple[str, dict[str, Any]] | None:
    if isinstance(item, (tuple, list)) and len(item) == 2 and str(item[0]) in PROBE_KINDS:
        return str(item[0]), dict(item[1])
    if hasattr(item, "model_dump"):
        item = item.model_dump(mode="json")
    if not isinstance(item, dict):
        return None
    kind = str(item.get("kind") or item.get("record") or item.get("phase") or "")
    if kind not in PROBE_KINDS:
        kind = f"probe_{kind}" if f"probe_{kind}" in PROBE_KINDS else ""
    if not kind:
        return None
    payload = item.get("payload")
    return kind, dict(payload) if isinstance(payload, dict) else {k: v for k, v in item.items()}


def drain_probe_records(world: Any) -> list[tuple[str, dict[str, Any]]]:
    raw: Any = None
    for name in ("drain_probe_records", "drain_records"):
        hook = getattr(world, name, None)
        if callable(hook):
            raw = hook()
            break
    else:
        for name in ("season_probe_records", "probe_records"):
            held = getattr(world, name, None)
            if isinstance(held, list):
                raw, held[:] = list(held), []
                break
    if not raw:
        return []
    out = [_normalize(item) for item in raw]
    return [record for record in out if record is not None]


def probe_payload(probe: Any, kind: str) -> dict[str, Any]:
    payload = probe.model_dump(mode="json")
    payload["probe_id"] = probe.id
    slot = "plant_who" if kind == "probe_plant" else "payoff_who"
    payload["who"] = probe.slots.get(slot, "")
    payload["role"] = probe.slots.get("npc_role", "")
    if probe.slots.get("negative") and kind != "probe_plant":
        payload["type"] = "negative"
    return payload


def season_probes(world: Any, state: dict[str, tuple[bool, bool]]) -> list[tuple[str, dict[str, Any]]]:
    live = drain_probe_records(world)
    if live:
        for probe in world.probes:
            state[probe.id] = (probe.planted, probe.resolved)
        return live
    out: list[tuple[str, dict[str, Any]]] = []
    for probe in world.probes:
        before = state.get(probe.id, (False, False))
        now = (probe.planted, probe.resolved)
        if now == before:
            continue
        state[probe.id] = now
        for index, kind in ((0, "probe_plant"), (1, "probe_result")):
            if now[index] and not before[index]:
                out.append((kind, probe_payload(probe, kind)))
    return out
