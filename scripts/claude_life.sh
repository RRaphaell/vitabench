#!/usr/bin/env bash
# Runs one full Claude Code life against a running engine server and saves the trace + frames.
# usage: scripts/claude_life.sh <seed> <model> <out_name>   (env: SERVER, default http://127.0.0.1:8700)
set -euo pipefail
SEED="${1:-1}"; MODEL="${2:-sonnet}"; NAME="${3:-claude_s$SEED}"
SERVER="${SERVER:-http://127.0.0.1:8700}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT/engine"
for _ in $(seq 1 30); do curl -sf "$SERVER/runs" >/dev/null && break; sleep 1; done
exec uv run vitabench claude --seed "$SEED" --model "$MODEL" --out "$ROOT/runs/$NAME" --server "$SERVER"
