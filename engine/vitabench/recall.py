from __future__ import annotations

from collections.abc import Iterable, Sequence
from pathlib import Path

MEMORY_FILE = "memory.md"
RECALL_JOIN = " · "
GREP_SOURCE = "memory-grep"
GREP_MAX = 1
KEY_MIN = 4
STOPWORDS = frozenset({"the", "and", "for", "from", "san", "del", "della", "your", "said", "says", "marco", "criers", "again"})


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
    surname = who.split()[-1].strip(".:;()").lower() if who.split() else ""
    scored: dict[str, tuple[int, int]] = {}
    for index, line in enumerate(lines):
        text = clean_line(str(line))
        matched = sum(2 if key == surname else 1 for key in keys if key in text.lower())
        if text and matched:
            scored[text] = (matched, index)
    ranked = sorted(scored, key=lambda text: scored[text], reverse=True)
    return ranked[:limit]


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
        return [line for when, line in self.wrote if when <= int(t)]

    def resolve(self, t: int, who: str, npc_id: str) -> tuple[str | None, str | None]:
        recalled = self.recall.get(int(t)) or []
        relevant = grep_memory(recalled, who, npc_id)
        if relevant:
            return RECALL_JOIN.join(relevant), "recall"
        hits = grep_memory(self.known_at(t), who, npc_id)
        if hits:
            return RECALL_JOIN.join(hits), GREP_SOURCE
        if recalled:
            return RECALL_JOIN.join(recalled), "recall"
        return None, None
