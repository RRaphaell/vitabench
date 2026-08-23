from __future__ import annotations

from collections.abc import Iterable, Sequence
from pathlib import Path

MEMORY_FILE = "memory.md"
RECALL_JOIN = " · "
GREP_SOURCE = "memory-grep"
GREP_MAX = 2
KEY_MIN = 4
STOPWORDS = frozenset({"the", "and", "for", "from", "san", "del", "della", "your", "said", "says"})


def clean_line(raw: str) -> str:
    return raw.strip().lstrip("-*#> ").strip()


def name_keys(who: str, npc_id: str) -> set[str]:
    words = who.replace(",", " ").replace("'", " ").split()
    words += npc_id.replace("_", " ").split()
    keys = {word.strip(".:;()").lower() for word in words}
    return {key for key in keys if len(key) >= KEY_MIN and key not in STOPWORDS and not key.isdigit()}


def grep_memory(lines: Sequence[str], who: str, npc_id: str, limit: int = GREP_MAX) -> list[str]:
    keys = name_keys(who, npc_id)
    if not keys:
        return []
    hits: list[str] = []
    for line in lines:
        text = clean_line(str(line))
        low = text.lower()
        if text and text not in hits and any(key in low for key in keys):
            hits.append(text)
    return hits[-limit:]


def memory_file_lines(home: str | Path | None) -> list[str]:
    if not home:
        return []
    path = Path(home).expanduser() / MEMORY_FILE
    if not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    return [line for line in (clean_line(raw) for raw in text.splitlines()) if len(line) >= KEY_MIN]


class MemoryLog:
    def __init__(self, extra: Iterable[str] = ()) -> None:
        self.recall: dict[int, list[str]] = {}
        self.wrote: list[tuple[int, str]] = []
        self.extra = [clean_line(str(line)) for line in extra if clean_line(str(line))]

    def add(self, t: int, wrote: Iterable[str], retrieved: Iterable[str]) -> None:
        lines = [str(line).strip() for line in retrieved if str(line).strip()]
        if lines:
            self.recall.setdefault(int(t), []).extend(lines)
        self.wrote.extend((int(t), str(line).strip()) for line in wrote if str(line).strip())

    def known_at(self, t: int) -> list[str]:
        return [line for when, line in self.wrote if when <= int(t)] + self.extra

    def resolve(self, t: int, who: str, npc_id: str) -> tuple[str | None, str | None]:
        recalled = self.recall.get(int(t)) or []
        if recalled:
            return RECALL_JOIN.join(recalled), "recall"
        hits = grep_memory(self.known_at(t), who, npc_id)
        if hits:
            return RECALL_JOIN.join(hits), GREP_SOURCE
        return None, None
