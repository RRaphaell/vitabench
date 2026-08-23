from __future__ import annotations

from typing import Any


class Harness:
    name = "base"

    def prefix(self) -> str:
        return ""

    def extra_tools(self) -> list[dict[str, Any]]:
        return []

    def on_tool(self, name: str, payload: dict[str, Any]) -> str:
        raise KeyError(f"{self.name} harness has no tool {name!r}")

    def drain_memory(self) -> dict[str, list[str]]:
        return {"wrote": [], "retrieved": []}

    def reset(self) -> None:
        return None


def get_harness(name: str) -> Harness:
    from vitabench.harnesses.none import NoneHarness
    from vitabench.harnesses.notes import NotesHarness

    harnesses = {h.name: h for h in (NoneHarness, NotesHarness)}
    if name not in harnesses:
        raise ValueError(f"unknown harness {name!r}, expected one of {sorted(harnesses)}")
    return harnesses[name]()
