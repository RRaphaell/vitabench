# Requirements and acceptance criteria

Every requirement has an ID. Agents reference IDs in `docs/06_PROGRESS.md`. Reviewers check the acceptance column, not the description.

## A. Judge and audience criteria (what "good" means)
| ID | Criterion | How we prove it |
|---|---|---|
| J1 | Understandable in 10 seconds without narration | Screenshot test: a reviewer who has never seen it writes what is happening; must name the person, the year, the activity, and whether memory worked |
| J2 | Wow: the diorama looks crafted, not boxes | Varied buildings (≥ 12 distinct facades), varied people (12 character models), props (stalls, lanterns, boats, trees), water, day/night, plague fog, war ships |
| J3 | The memory moment lands | Moment card: plant → payoff → retrieval → action → stamp, ≤ 3 lines of text, auto-pause |
| J4 | Honest measurement | Every number on screen comes from a trace; n and ± shown; "goldfish" baseline included |
| J5 | Reusable | `pip install vitabench`, 3-function adapter, Claude Code adapter works, scenario = folder of YAML |
| J6 | Cheap at scale | $/life on the leaderboard; cost from usage logs, never typed |
| J7 | Code matches claim | `vitabench replay`/`score` regenerate everything from `runs/*/trace.jsonl` |

## B. Functional requirements
| ID | Requirement | Acceptance |
|---|---|---|
| F1 | Scenario loads from `scenarios/venice_1340/*.yaml` and validates | `vitabench scenario validate scenarios/venice_1340` exits 0 with counts |
| F2 | World is deterministic per seed | Two runs with the same seed and the same mock plans produce byte-identical traces (minus timestamps) |
| F3 | Clock: 1 turn = 1 season (13 weeks); life = 40 years max; death by health ≤ 0 or age hazard | Mock life ends; trace has `death` record with cause |
| F4 | Needs: money, health, energy, hunger; jobs pay; eating costs; illness and hazards change health | Unit tests on `World.step_season` |
| F5 | Townspeople: ≥ 40 NPCs with roles, homes, routines, trust toward the hero; deterministic movement; templated or LLM-phrased dialogue when the hero talks | NPC positions in frames change by season; talk returns a reply |
| F6 | Director: 40-year script = real events from `events.yaml` + seeded shocks from `hazards` | `vitabench director scenarios/venice_1340 --seed 7` prints the script |
| F7 | Probes: ≥ 6 templates; per life ≥ 8 planted incl. ≥ 3 negatives; delays 1 season / 1 year / 10 years / 30 years; payoff = decision; check on action log | `tests/test_probes.py` covers plant, payoff, check, negative |
| F8 | Observation/plan protocol per `docs/03_SPEC.md`; one tool `act(plan)` | Schema validation on every turn; invalid plan → default plan + trace record |
| F9 | Adapters: `MockAgent` (scripted), `ClaudeCodeAgent` (MCP over HTTP, one session per life), `ApiLoopAgent` (Anthropic SDK) with harnesses `none` and `notes` | Each runs a full life; Claude Code life recorded once |
| F10 | Trace: append-only JSONL, every observation, plan, event, probe, LLM usage/cost | `vitabench replay runs/<id>` drives the viewer without the engine |
| F11 | Scoring: memory by delay (chance-corrected), negatives, life quality, cost; bootstrap CIs over seeds; `leaderboard.json` | `vitabench score runs/` prints the table |
| F12 | Server: FastAPI with `/mcp` (tool `act`), `/ws/{run}` frames, `/runs` list, `/runs/{id}/trace` | Viewer connects live and in replay |
| F13 | Viewer: isometric diorama, hero, people, events, HUD, moments, timeline, speed, rotate/zoom, click person | Playwright screenshots at 4 moments match `docs/08_VIEWER_DESIGN.md` |
| F14 | Batch: `vitabench batch --seeds 0-4 --harness none,notes,claude` runs lives concurrently | Leaderboard with n = 5 |
| F15 | Demo: `runs/demo/trace.jsonl` committed; `npm run dev` replays it by default | Opens to the demo life |

## C. Non-functional
| ID | Requirement |
|---|---|
| N1 | Engine: Python 3.12, uv, pydantic v2, ruff clean, typed; tests run in < 10 s |
| N2 | Viewer: Vite + TypeScript + Three.js 0.185; 60 fps on an M2 laptop at 1920×1080 with 60 people; no React |
| N3 | No secrets in the repo; keys via env |
| N4 | Every module ≤ 300 lines; no dead code; no narrating comments |
| N5 | Everything regenerable: traces → frames → scores → charts |
