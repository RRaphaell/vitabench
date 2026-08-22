# Architecture

```
scenarios/venice_1340/*.yaml ──► engine (Python: world · npcs · director · probes · scoring · trace)
                                      │ step_season(plan) → Observation          ▲ plan
                                      ▼                                           │
                               server (FastAPI) ── /mcp tool act ──► Claude Code (adapter)
                                      │            └─ ApiLoopAgent / MockAgent (in-process)
                                      │ FrameV1 over /ws/{run}  ·  trace.jsonl on disk
                                      ▼
                               viewer (Vite + Three.js) ── live or replay from trace
```

## Components and boundaries
| Component | Owns | Never does |
|---|---|---|
| `engine/vitabench/schema.py` | every pydantic model (Persona, Scenario, Observation, Plan, Probe, TraceRecord, Frame) | logic |
| `engine/vitabench/world.py` | state + `step_season(plan)`; needs, jobs, prices, movement | LLM calls, I/O |
| `engine/vitabench/npcs.py` | NPC roster from cast, routines, trust, templated replies | rendering |
| `engine/vitabench/director.py` | the 40-year script: history events + seeded shocks; runs once at world creation | per-turn decisions |
| `engine/vitabench/probes.py` | planting, payoff scheduling, checking, negatives | scoring math |
| `engine/vitabench/dialogue.py` | optional LLM phrasing of NPC replies (templated fallback); never changes state | state |
| `engine/vitabench/scoring.py` | metrics + bootstrap + leaderboard.json | reading live state |
| `engine/vitabench/trace.py` | JSONL writer/reader; `frames_from_trace()` | business logic |
| `engine/vitabench/frames.py` | `Frame` builders from world state (hello/frame/moment/end) | |
| `engine/vitabench/server/` | FastAPI app, MCP tool `act`, WS broadcast, run registry | world logic |
| `engine/vitabench/adapters/` | `base.Agent` (on_birth/act/on_death), `MockAgent`, `ClaudeCodeAgent`, `ApiLoopAgent` | world logic |
| `engine/vitabench/harnesses/` | memory policies for `ApiLoopAgent`: `none`, `notes` | |
| `engine/vitabench/runner/` | `run_life()`, `batch()` | |
| `engine/vitabench/cli.py` | `vitabench run|batch|score|replay|serve|scenario validate|director` | |
| `web/src/state/` | `FrameV1` types, store, WS transport, replayer | rendering |
| `web/src/world/` | diorama: island, water, buildings from kit, props, lighting | UI |
| `web/src/actors/` | people (characters + animation), hero, camera (isometric orbit) | |
| `web/src/ui/` | HUD, bubble, moments, timeline, inspector, leaderboard | 3D |

## Data flow per season
1. `World.observe()` → `Observation` (structured + rendered `text`).
2. Agent returns `Plan` (via in-process call, or via MCP tool `act` for Claude Code; the tool call blocks until the plan is applied and returns the next observation).
3. `World.step_season(plan)`: 13 weekly ticks — events due, hazards, NPC routines, needs, execute plan items, probes plant/payoff, death check.
4. Trace records appended; `Frame` built and broadcast; scoring reads traces only.

## Time
Tick = 1 week. Season = 13 ticks = 1 agent turn. Life ≤ 160 seasons. Viewer speed is independent of engine speed: the viewer interpolates between frames and can replay at any rate.

## Determinism
`numpy.random.default_rng([crc32(scenario_id), seed, stream])` with streams `events`, `npc`, `probes`, `hazard`, `dialogue`. NPC decisions are rule-based; LLM output (dialogue text) never feeds back into state. Same seed + same plans ⇒ identical trace.

## Claude Code as an agent
The server hosts MCP (streamable HTTP) at `/mcp/{run_id}` exposing one tool `act(plan)`. `ClaudeCodeAgent` spawns `claude -p <birth prompt> --session-id <life uuid> --mcp-config <json> --strict-mcp-config --allowedTools mcp__vitabench__act,Read,Write,Edit --permission-mode dontAsk --output-format stream-json --max-turns 400 --model <model>` with `cwd` = a fresh `git init`ed home dir per life (Claude Code keys its memory by git root). The agent loop is: the tool result of `act` *is* the next observation, so the model keeps calling `act` until death. If the process exits early, the runner resumes with `--resume <uuid>`. Usage/cost is read from the final `result` event into the trace.

## Repo layout
```
vitabench/
  CLAUDE.md  README.md  LICENSE  docs/  scripts/  runs/demo/
  engine/   pyproject.toml  vitabench/  scenarios/venice_1340/  tests/
  web/      package.json  vite.config.ts  index.html  src/  public/assets/ (downloaded, gitignored)
```
