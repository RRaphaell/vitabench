"""Rewrites the results table in README.md from runs/leaderboard.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LABEL = {
    "claude-code": "**Claude Code** (`memory.md` + auto-compaction, `recall` field)",
    "mock:sensible": "scripted baseline (works, eats plain, pays known debts)",
    "mock:random": "random legal plans",
    "mock:goldfish": "goldfish (no memory, refuses everything)",
}
MODEL = {"mock": "—"}


def fmt_ci(row: dict, key: str) -> str:
    ci = (row.get("ci") or {}).get(key)
    return f" [{ci[0]:.2f}, {ci[1]:.2f}]" if ci and ci[0] != ci[1] else ""


def line(row: dict) -> str:
    neg = row["negatives"]
    n_txt = f"{neg['x']}/{neg['y']}" if neg["y"] else "—"
    cost = row.get("cost_usd") or 0.0
    return (f"| {LABEL.get(row['harness'], row['harness'])} | {MODEL.get(row['model'], row['model'])} | {row['n']} | "
            f"{row['H']:.2f}{fmt_ci(row, 'H')} | {row['M']:.2f} | {n_txt} | {row['L']:.2f} | ${cost:.2f} |")


def main() -> None:
    rows = json.loads((ROOT / "runs/leaderboard.json").read_text())
    table = ["| harness | model | n | H [95% CI] | memory | false claims rejected | life | $/life |", "|---|---|---|---|---|---|---|---|"]
    table += [line(r) for r in sorted(rows, key=lambda r: -r["H"])]
    readme = ROOT / "README.md"
    text = readme.read_text()
    text = re.sub(r"\| harness \| model \| n \|.*?\n(?=\n)", "\n".join(table) + "\n", text, count=1, flags=re.S)
    claude = next((r for r in rows if r["harness"] == "claude-code" and r["model"].startswith("claude-sonnet")), None)
    if claude:  # delay sentence
        raw = claude.get("M_raw_by_delay") or {}
        sentence = ("Claude Code memory pass rate by delay (raw, pooled): "
                    f"1 season {raw.get('1', 0):.2f} · 1 year {raw.get('4', 0):.2f} · 10 years {raw.get('40', 0):.2f} · 25 years {raw.get('100', 0):.2f}.")
        text = re.sub(r"Claude Code memory pass rate by delay \(raw[^.]*\)[^\n]*\.", sentence, text, count=1)
    readme.write_text(text)
    print(f"README table refreshed ({len(rows)} rows)")


if __name__ == "__main__":
    main()
