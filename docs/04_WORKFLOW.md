# Workflow — how we build (agents and orchestrator)

## Roles
- **Orchestrator (Claude, main session):** owns the plan, launches agents, integrates, commits, verifies with Playwright, updates `docs/06_PROGRESS.md`, talks to Raphael.
- **Developers:** one workstream each; build only inside the directories they own; run the verification commands before reporting.
- **Reviewers:** read diffs and screenshots against `docs/01_REQUIREMENTS.md`; report concrete defects with file:line; never rewrite wholesale.
- **Raphael:** directs; does not review every step; reachable via Slack if the orchestrator is stuck.

## Rules for every agent
1. Read `CLAUDE.md`, `docs/00–03`, `docs/05`, and the section of `docs/06_PROGRESS.md` for your workstream before writing code.
2. Stay inside your owned paths. If you need a change elsewhere, write the exact request into your progress section; the orchestrator makes it.
3. **Do not run `git commit` or `git push`.** The orchestrator commits after each wave. (Parallel agents share one working tree.)
4. Frozen interfaces: `engine/vitabench/schema.py` and `web/src/state/schema.ts`. Propose changes in progress notes; do not edit unless your workstream owns them.
5. Verify before you report: run the commands listed for your workstream; paste the last lines of output into your progress section.
6. Report in `docs/06_PROGRESS.md` under your workstream: what is done (with requirement IDs), what is not, what you need, and the commands to reproduce.
7. No placeholder data in committed paths except `runs/demo/` (recorded real run) and `web/src/dev/fixtures/` (clearly named).

## Ownership (wave 1)
| Workstream | Paths | Verify |
|---|---|---|
| W1 engine core | `engine/vitabench/{schema,world,clock,npcs,director,dialogue}.py`, `engine/tests/test_world*.py` | `cd engine && uv run pytest -q && uv run vitabench run --agent mock --seed 1` |
| W2 scenario + probes | `engine/scenarios/venice_1340/*`, `engine/vitabench/{scenario,probes}.py`, `engine/tests/test_probes.py` | `uv run vitabench scenario validate scenarios/venice_1340 && uv run pytest -q tests/test_probes.py` |
| W3 adapters + runner + trace + scoring | `engine/vitabench/{adapters,harnesses,runner}/`, `{trace,scoring,frames,cli}.py`, `engine/tests/test_scoring.py` | `uv run vitabench run --agent mock --seed 1 && uv run vitabench score runs/` |
| W4 server | `engine/vitabench/server/*` | `uv run vitabench serve` then `curl localhost:8700/runs` |
| W5 viewer world | `web/src/world/*`, `web/public/assets` via `scripts/setup_assets.sh`, `web/src/dev/*` | `cd web && npm run build && node scripts/screenshot.mjs` |
| W6 viewer actors + camera | `web/src/actors/*` | same |
| W7 viewer UI | `web/src/ui/*`, `web/src/main.ts`, `web/src/state/*` | same |
| W8 docs/demo/README | `README.md`, `docs/07_DEMO.md`, `runs/demo/` | — |

## Verification loop (orchestrator, after every wave)
1. `cd engine && uv run ruff check . && uv run pytest -q`
2. `uv run vitabench run --agent mock --seed 1 --out runs/smoke` → trace exists, `score` prints.
3. `cd web && npm run build` → `node scripts/screenshot.mjs runs/smoke` → screenshots in `runs/smoke/screens/`; orchestrator views them and grades against `docs/08_VIEWER_DESIGN.md` (J1, J2, J3).
4. Reviewer agent reads the diff + screenshots → defects → fix wave.
5. Commit: `type(scope): summary` (feat/fix/docs/chore), one commit per wave or meaningful step, push immediately.

## Milestones
| Time | Gate |
|---|---|
| 17:30 | Vertical slice: mock life → trace → viewer replay with boxes; screenshots reviewed |
| 18:00 | Claude Code life recorded; probes scored; kit assets in the viewer |
| 18:30 | Polish wave; moment cards; timeline; leaderboard n≥3 |
| 18:45 | Draft text saved on the AGI House form |
| 19:30 | Batch numbers; README; slides |
| 19:45 | Final submit |

## If stuck
Orchestrator DMs Raphael on Slack with: what is blocked, what was tried, the decision needed.
