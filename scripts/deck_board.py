"""Rewrites the leaderboard rows in docs/slides/vitabench_deck.html from runs/leaderboard.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LABELS = {"claude-code": "claude code", "claude-code/caterina": "claude code · caterina", "mock:sensible": "scripted baseline", "mock:random": "random plans", "mock:goldfish": "goldfish · no memory"}
MODELS = {"claude-sonnet-5": "sonnet 5", "claude-opus-5": "opus 5"}


def row(entry: dict) -> str:
    h = entry.get("H") or 0.0
    ci = entry.get("ci") or {}
    h_ci = ci.get("H") if isinstance(ci, dict) else ci
    ci_txt = f" [{h_ci[0]:.2f}, {h_ci[1]:.2f}]" if isinstance(h_ci, (list, tuple)) and len(h_ci) == 2 else ""
    cost = entry.get("cost_usd") or entry.get("cost") or 0.0
    label = LABELS.get(entry.get("harness", ""), entry.get("harness", ""))
    model = MODELS.get(entry.get("model", ""))
    label = f"{label} · {model}" if model else label
    return (f'      <div class="row"><span>{label}</span><span>{entry.get("n", 0)}</span>'
            f'<span>{h:.2f}{ci_txt} <i class="bar" style="width:{h * 10:.1f}vw"></i></span><span>${cost:.2f}</span></div>')


def main() -> None:
    board = json.loads((ROOT / "runs/leaderboard.json").read_text())
    board = sorted(board, key=lambda e: -(e.get("H") or 0.0))
    deck = ROOT / "docs/slides/vitabench_deck.html"
    html = deck.read_text()
    rows = "\n".join(row(e) for e in board)
    html = re.sub(r'(<div class="row h">.*?</div>\n)(.*?)(\n    </div>)', lambda m: m.group(1) + rows + m.group(3), html, count=1, flags=re.S)
    deck.write_text(html)
    print(f"deck board updated with {len(board)} rows")


if __name__ == "__main__":
    main()
