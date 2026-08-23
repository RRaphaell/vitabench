#!/usr/bin/env bash
# Assembles runs/board/ from the mock batch and the Claude Code lives, scores it, publishes the leaderboard.
# usage: bash scripts/board.sh          (re-runnable; each source run is copied over its board entry)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNS="$ROOT/runs"
BOARD="$RUNS/board"
CLAUDE_MODEL="claude-sonnet-5"
mkdir -p "$BOARD"

trace_dir() {
  local src="$1" linked
  if [ -f "$src/trace.jsonl" ]; then echo "$src"; return 0; fi
  if [ -f "$src/run_id" ]; then
    linked="$RUNS/$(cat "$src/run_id")"
    if [ -f "$linked/trace.jsonl" ]; then echo "$linked"; return 0; fi
  fi
  return 1
}

claude_meta() {
  python3 - "$@" <<'PY'
import json
import sys
from pathlib import Path

dest, source, seed, model = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
meta = json.loads(source.read_text(encoding="utf-8")) if source.is_file() else {}
meta.update({"harness": "claude-code", "model": model, "seed": seed})
Path(dest).write_text(json.dumps(meta, indent=2), encoding="utf-8")
PY
}

copy_run() {
  local src="$1" name="$2" claude="${3:-}" dest="$BOARD/$2" from
  from="$(trace_dir "$src")" || { echo "skip $name (no trace yet)"; return 0; }
  grep -q '"kind": "death"' "$from/trace.jsonl" || { echo "skip $name (still alive)"; return 0; }
  mkdir -p "$dest"
  cp -f "$from/trace.jsonl" "$dest/trace.jsonl"
  if [ -n "$claude" ]; then
    claude_meta "$dest/meta.json" "$from/meta.json" "${name##*_s}" "$CLAUDE_MODEL"
  elif [ -f "$from/meta.json" ]; then
    cp -f "$from/meta.json" "$dest/meta.json"
  fi
  echo "$name <- ${from#"$ROOT"/} ($(wc -l < "$dest/trace.jsonl" | tr -d ' ') records)"
}

for src in "$RUNS"/batch_mock/*/; do
  [ -f "${src}trace.jsonl" ] || continue
  copy_run "${src%/}" "$(basename "$src")"
done

for src in "$RUNS"/claude_sonnet_s*/; do
  [ -d "$src" ] || continue
  copy_run "${src%/}" "$(basename "$src")" claude
done
CLAUDE_MODEL="claude-sonnet-5"
for src in "$RUNS"/claude_caterina_s*/; do
  [ -d "$src" ] || continue
  copy_run "${src%/}" "$(basename "$src")" claude
  python3 - "$BOARD/$(basename "$src")/meta.json" <<'PYM'
import json, sys
path = sys.argv[1]; meta = json.load(open(path)); meta.update(harness="claude-code/caterina", persona="caterina"); json.dump(meta, open(path, "w"), indent=2)
PYM
done
CLAUDE_MODEL="claude-opus-5"
for src in "$RUNS"/claude_opus_s*/; do
  [ -d "$src" ] || continue
  copy_run "${src%/}" "$(basename "$src")" claude
done

cd "$ROOT/engine"
uv run vitabench score "$BOARD"
cp -f "$BOARD/leaderboard.json" "$RUNS/leaderboard.json"
echo "$RUNS/leaderboard.json"
