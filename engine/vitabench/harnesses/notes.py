from __future__ import annotations

from typing import Any

from vitabench.harnesses.base import Harness

NOTES_LIMIT = 6000
UPDATE_NOTES_TOOL = {
    "name": "update_notes",
    "description": (
        "Rewrite your private notes. They are the only thing you carry between seasons: everything else "
        "is forgotten. Keep names, amounts, dates and promises. Call before act when something matters."
    ),
    "input_schema": {
        "type": "object",
        "properties": {"text": {"type": "string", "description": "The full new notes, replacing the old."}},
        "required": ["text"],
    },
}


class NotesHarness(Harness):
    name = "notes"

    def __init__(self) -> None:
        self.notes = ""
        self._wrote: list[str] = []
        self._retrieved: list[str] = []

    def prefix(self) -> str:
        if not self.notes:
            return "Your notes are empty. Use update_notes to start them."
        self._retrieved = [line for line in self.notes.splitlines() if line.strip()][-6:]
        return f"Your notes (all you remember of earlier seasons):\n{self.notes}"

    def extra_tools(self) -> list[dict[str, Any]]:
        return [UPDATE_NOTES_TOOL]

    def on_tool(self, name: str, payload: dict[str, Any]) -> str:
        if name != "update_notes":
            return super().on_tool(name, payload)
        text = str(payload.get("text", ""))[:NOTES_LIMIT]
        old = {line.strip() for line in self.notes.splitlines()}
        self._wrote = [line.strip() for line in text.splitlines() if line.strip() and line.strip() not in old]
        self.notes = text
        return f"Notes saved ({len(text)} chars)."

    def drain_memory(self) -> dict[str, list[str]]:
        memory = {"wrote": self._wrote, "retrieved": self._retrieved}
        self._wrote, self._retrieved = [], []
        return memory

    def reset(self) -> None:
        self.notes = ""
        self._wrote, self._retrieved = [], []
