#!/usr/bin/env bash
# Runs one full Claude Code life against a running engine server and saves the trace + frames.
# usage: scripts/claude_life.sh <seed> <model> <out_name>
set -euo pipefail
SEED="${1:-1}"; MODEL="${2:-sonnet}"; NAME="${3:-claude_s$SEED}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT/engine"
for i in $(seq 1 30); do curl -sf localhost:8700/runs >/dev/null && break; sleep 1; done
RUN=$(curl -s -X POST localhost:8700/runs -H 'Content-Type: application/json' \
  -d "{\"scenario\":\"venice_1340\",\"persona\":\"marco\",\"seed\":$SEED,\"harness\":\"claude-code\",\"model\":\"$MODEL\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["run_id"])')
mkdir -p "$ROOT/runs/$NAME"; echo "$RUN" > "$ROOT/runs/$NAME/run_id"
echo "run_id=$RUN"
uv run python - "$RUN" "$MODEL" <<'PY'
import asyncio, sys
from pathlib import Path
from vitabench.scenario import load_scenario
from vitabench.adapters.base import scenario_brief
from vitabench.adapters.claude_code import run_life_with_claude
run_id, model = sys.argv[1], sys.argv[2]
spec = load_scenario(Path("scenarios/venice_1340"))
persona = next(p for p in spec.personas if p.id == "marco")
print(asyncio.run(run_life_with_claude("http://127.0.0.1:8700", run_id, persona, scenario_brief(spec), model=model)))
PY
curl -s "localhost:8700/runs/$RUN/trace" > "$ROOT/runs/$NAME/trace.jsonl"
curl -s "localhost:8700/runs/$RUN/frames" > "$ROOT/runs/$NAME/frames.json"
echo "saved runs/$NAME ($(wc -l < "$ROOT/runs/$NAME/trace.jsonl") trace records)"
