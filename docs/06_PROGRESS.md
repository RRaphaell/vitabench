# Progress log (living; newest first per section)

## Status board
| Workstream | Owner | State | Last verified |
|---|---|---|---|
| W1 engine core | W1 agent | working: world/clock/npcs/director/dialogue + tests green | 17:15 |
| W2 scenario + probes | W2 | scenario + probes done, wired into W1/W3 | 17:10 |
| W3 adapters/runner/trace/scoring | W3 agent | working: trace/scoring/frames/runner/CLI + mock & API adapters, 17 tests green | 17:55 |
| W4 server | agent-w4 | live: HTTP + MCP + WS + Claude Code adapter verified against real `claude` CLI | 17:20 |
| W5 viewer world | W5 | diorama renders (island, canals, 3 kits, props, day/night, plague/war) | 17:15 |
| W6 viewer actors + camera | W6 agent | working: characters/path/people/hero/camera/effects + ?dev=actors demo, screenshot green | 17:20 |
| W7 viewer UI + state | W7 agent | working: store/replayer/transport, full HUD, moments, timeline, fixture, screenshots | 17:45 |
| W8 docs/demo/README | orchestrator | docs written | 16:40 |

## Decisions
- 16:40 Name: VitaBench. Package `vitabench`. Viewer style: Simile-like isometric diorama (orthographic), Kenney kits. No heirs tonight. NPC decisions rule-based; dialogue may be LLM-phrased.
- 16:40 One tool `act(plan)` per season; 40-year life ≤ 160 turns. Claude Code = flagship adapter; API loop for baselines.
- 16:40 Agents do not commit; orchestrator commits after each wave.

## Orchestrator log
- 16:40 Docs 00–08 written, repo skeleton next.

## W1 engine core

### 17:15 — done (F2, F3, F4, F5, F6; supports F7/F8)
- `clock.py` — season/year/age helpers over `SEASONS`/`WEEKS_PER_SEASON`, plus `interpolate_index()` for `price_index`.
- `director.py` — `build_script(spec, seed) -> list[ScheduledEvent]`: real history expanded to `t = (year-start_year)*4 + season` with duration, plus seeded hazard shocks (fire/theft/illness/price_shock) drawn per week from `default_rng([crc32(scenario.id), seed, STREAM_EVENTS])`. Deterministic and sorted by `(t, source, id)`. **Exports the shared RNG helper `rng_for(scenario_id, seed, stream)` and the `STREAM_*` constants** (`EVENTS=1, NPC=2, PROBES=3, HAZARD=4, DIALOGUE=5`) — W2/W3 should import these rather than reseeding.
- `npcs.py` — `Roster` instantiates `spec.cast` counts with seeded name+family, home in `home_district` (falls back to any home), routine tokens resolved (`home` → own home, place id → itself, place kind → seeded match), `class`, trust from `persona.relationships` else 0.3, and a deterministic `model` of `character-{male,female}-{a..f}`. `position_at(npc_id, t, week)`, `nearby()`, `reply(npc, intent, context)` (templated, no LLM), `plague_deaths(rate, t, rng)`. The persona's living mother is added as NPC id `mother` so conversations/relations/trust resolve.
- `world.py` — `World(spec, persona_id, seed, probes=None)` with all required fields; `observe() -> Observation` (rendered text, visitors, mother conversations, market = `price_index` interpolated × active-event `price_mult`, nearby NPCs); `step_season(plan) -> list[dict]` runs 13 weekly ticks (events fire/expire, needs decay, work wages with `requires` checked, moves 1 week each, eat tiers, buys, talks with pay/lend/borrow settling debts, rest) and returns the season's event dicts; `death_summary()`, `hero_activity()`, `goals_met()`.
- `dialogue.py` — `phrase(npc, intent, context, model=None)`; templated by default, Anthropic Messages only when `ANTHROPIC_API_KEY` **and** `model` are both set. Never mutates state; network import is lazy and inside try/except so tests stay offline. Also holds the observation prose (`render_observation`) and `activity_for` — text generation, no state.

### Probe contract (as implemented — W2 please confirm)
`World` calls, by name, from `vitabench.probes`, guarded so the engine still runs if the module is absent:
- `plant_due(world)` and `payoff_due(world)` at the **start of every season** (in `_enter_season()`, which runs at the end of `step_season` for the new `t`, and once in `__init__` for `t=0`) — so anything they push into `world.pending_visitors` / `pending_conversations` / `pending_news` appears in the very next `observe()`.
- `check_due(world)` at the **end of `step_season`**, after that season's actions are appended, so it can read `world.action_log`.
Return values are ignored by `World`; the runner reads `world.probes`. Verified live against W2's `probes.py`: 11/11 probes planted and 11/11 resolved over a full life.
`action_log` entries are always `{"t", "kind", "target", "amount", "intent"}`; `kind ∈ {work, work_failed, move, eat, rest, buy, talk, seek_job}` and `intent` is set only for `talk`.

### Notes / deviations
- **`frames.py` collided.** My brief listed it as mine, but `docs/04_WORKFLOW.md` assigns it to W3, who wrote a version wired to `trace.py` while I was working. I kept **W3's** version and adapted my tests to it (`hello`/`frame`/`end`); `World` satisfies its contract (`met`, `memory_lines`, `pending_visitors`, `last_plan`, `active_events`, `hero_activity()`, `death_summary()`, `roster.position_at`). No further action needed — flagging only so ownership is recorded.
- **Model id corrected.** The brief specified `claude-haiku-4-5-20251001` for dialogue phrasing; date-suffixed ids are rejected by the API. `dialogue.DIALOGUE_MODEL = "claude-haiku-4-5"`.
- **Balance fix worth knowing:** with `health_week: -1` jobs and no recovery term, heroes died at ~age 25 and no life reached 1348. Added `+1 health/week when hunger >= 50` and an age-frailty cap (`100 - 1.2*(age-45)`, floor 30). Lives now spread: most reach the full 40 years, some die of plague/illness mid-life, old-age hazard bites after ~55. Constants are at the top of `world.py` if you want to retune.
- **Energy:** a job's `energy_week` is used when non-zero, else the -8/week default from the brief.

### Not done
- **`world.py` is 416 lines, over the 300-line limit (N4).** I moved the prose layer into `dialogue.py`; the remaining overage is the economy/needs block. **Proposal for the next wave:** extract `market/_work_week/_eat_week/_buy/_talk/_owed_to/_settle` into a new `engine/vitabench/economy.py` (~110 lines) — I did not create it because it is outside my assigned paths. Say the word and I'll do it.
- No `questions[]` (quiz) probes are emitted by `World`; `observe().questions` is always `[]`. W2's quiz probes will need a hook if they are used.

### Verify
```
cd engine && uv run pytest -q tests/test_world.py && uv run ruff check vitabench
```
`tests/test_world.py` is self-contained (in-file 8x6 scenario fixture: 2 jobs, 2 items, 1 plague event, 2 roles) and does not depend on `scenarios/venice_1340`. 19 tests: determinism (identical `action_log`, observations and NPC states across two worlds on one seed), seed divergence, script determinism/dating, needs decay, wages+eating, `requires` gating, death by health, plague (NPC deaths + price lift), debt settlement, borrow/lend, observation contract, NPC routines, the frame contract, and a full 40-year life under 5 s.

```
$ uv run pytest -q tests/test_world.py
...................                                                      [100%]
19 passed in 0.18s

$ uv run ruff check vitabench/world.py vitabench/dialogue.py vitabench/npcs.py vitabench/director.py vitabench/clock.py tests/test_world.py
All checks passed!
```
Live integration against W2's scenario + probes (not a committed test):
```
npcs: 41 script events: 38 probes: 11
t=160 age=62 cause=outlived the scenario money=1179
planted=11 resolved=11 visitors_seen=11
```
## W2 scenario + probes

### 17:10 — scenario loads, probes plant/pay off/check end to end (F1, F6 data, F7)
- `scenarios/venice_1340/` — `scenario.yaml` (1340, 40 years, ducats, weekly hazards) + six includes.
  - `map.yaml` 24×18, canals at x∈{7,16} and z∈{5,12}, six districts (cannaregio, murano, san_polo,
    san_marco, castello, dorsoduro), **21 places** (homes for both personas plus one home per district for
    NPC routines, arsenale/murano/squero work, rialto/fondaco/pescheria markets, san_marco/san_zaccaria/
    san_giacomo churches, tavern_moro/tavern_gallo, dock, notary) and 6 landmarks (basilica, campanile,
    rialto_bridge, arsenale_gate, furnace, fountain). No place sits on a canal tile; the loader enforces it.
  - `economy.yaml` six jobs 4–12 ducats/week (ropemaker 6, gondolier 5, glassblower 8, merchant 12 +200
    requirement, notary_clerk 7, dockhand 4); items bread 1, plain_meal 2, good_meal 4, wine 2, medicine 12,
    boat 80, warehouse 300; `price_index` 1340→1385 with the 1348 spike at 1.9 and 1378–81 at 1.7.
  - `events.yaml` **15 dated events**, all real or period-plausible: 1342 Apulian grain failure, 1346 hunger
    winter, 1347 Caffa galleys, **1348 Black Death** (4 seasons, illness_mult 12, npc_death_rate 0.35,
    price_mult 1.8), 1350 Genoa war, 1354 Dandolo dies/Falier elected, **1355 Falier beheaded**, 1361 plague
    (2 seasons), 1363 Candia revolt, 1365 Sposalizio del Mare, 1369 acqua alta (flood), 1372 Murano guild
    emigration ban, 1376 poor harvest, **1378 War of Chioggia** (13 seasons, trade_mult 0.3, wage_mult 1.3,
    loan_calls), **1382 plague** (2 seasons).
  - `cast.yaml` 10 roles = **40 NPCs** (merchant 8, fishwife 6, dockhand 6, noble 5, gondolier 4, priest 3,
    glassmaker 3, cooper 2, moneylender 2, widow_innkeeper 1), five-stop routines over real place ids,
    Venetian name pools + the eight families.
  - `personas.yaml` **marco** (rope-maker, born 1318, mother Agnese alive, 40 ducats owed to ziani due 1344,
    goals warehouse/family/debt_free) and **caterina** (glassmaker's daughter of Murano, born 1321, goals
    own_furnace/marry_well/keep_recipe) — ~50 fields each incl. `features` for the viewer model.
  - `probes.yaml` the six templates from `docs/03_SPEC.md` (ledger_loan, promise_cue, trust_trait,
    lesson_rule, family_fact, news_fact), delays `[1, 4, 40, 100]`, negative twins on four of them.
- `scenario.py` — `load_scenario(dir | scenario.yaml)` reads the root, resolves `includes` by file stem,
  validates each section against the frozen models **naming the file and the failing field**, then runs
  cross-reference checks (districts, canal collisions, job places, routine steps, name pools, persona home/
  job/district, duplicate ids, event seasons, probe delays) and raises `ScenarioError` listing every problem.
  `validate_report(spec)` → districts/places/landmarks/jobs/items/events/roles/npcs/personas/probes.
- `probes.py` + `probe_slots.py` (split to keep both under the 300-line rule; `probes.py` is the only import
  surface W1/W3/W4 use). `plan_probes(spec, persona, rng, max_seasons=None, roster=None)` instantiates
  **8 positives** (two per delay bucket, round-robin over all six templates) + **3 negatives** (fabricated
  claims, no plant, `planted` stays False). Plant times land in the first 60 % of life and are chosen so the
  long delays still fit the life. Slots are filled from the cast name pools (or from `roster` when W4 passes
  the live NPC list), amount 10–60, event "Mary's wedding"/"the feast of San Marco", year from `plant_t`.
  `plant_due/payoff_due/check_due(world)` are the per-season hooks; `record_for(kind, probe, **over)` is the
  public payload builder W3's `runner/life.py` already looks for.
- Probe semantics: a positive fails if the agent does nothing (`action "none"`); a **negative passes when
  ignored** and fails only on an accepting action (`pay|agree|lend`) toward the false claimant — that is the
  honest reading of `N = 1 − accepted/planted`. `pay` is matched within `amount_tolerance`; an unspecified
  amount passes, a short payment does not. `goal_action` checks (promise_cue, lesson_rule) match any
  action-log entry whose `target` is the expected place/item id.

**Assumptions about W1's `World` (verified against the code that now exists):**
- `world.t`, `world.probes`, `world.action_log`, `world.pending_visitors/conversations/news` — as documented.
- **Debts live at `world.state.debts`, not `world.debts`.** `probes.py` prefers `world.state.debts` and falls
  back to `world.debts`, so either shape works.
- `world.action_log` entries are `{t, kind, target, amount, intent}` with `intent=None` for non-talk kinds;
  `None` targets/intents are handled.
- The planted debt is recorded with `to = <lender npc id>` while the payoff visitor is the lender's **kin**,
  so the observation never leaks the answer. Because `DebtState` has no probe flag, the link is kept in
  `probe.slots["npc_id"]`. *Proposal for the frozen schema (not made): add `probe_id: str | None = None` to
  `DebtState` so the viewer can mark probe debts.*

**Request to W3 (`runner/life.py`, not my file):** `_plan_probes` builds its arguments by introspection and
would pass the seed positionally for every parameter without a default. `plan_probes` now accepts an `int`
seed for `rng` (it builds `rng_for(spec.id, seed, STREAM_PROBES)` itself) and defaults `max_seasons` to
`spec.max_years * 4`, so the current call works and stays deterministic — but the explicit call
`plan_probes(spec, persona, rng_for(spec.id, seed, STREAM_PROBES), life_seasons(spec.max_years), roster)`
used in `server/live.py` is the one to keep.

**Not done:** no quiz-channel probes (`questions[]`, ≤ 2 per life, scored separately) — the templates and
`ProbeCheck(kind="answer")` support it, nothing instantiates one. Only two personas (`marco` is the CLI default;
`caterina` verified with `uv run vitabench run --agent mock --seed 2 --persona caterina` →
`H=0.6077 M=0.4403 N=1.0 L=0.5775`).

Verify:
```
$ cd engine && uv run pytest -q tests/test_scenario.py tests/test_probes.py
...................                                                      [100%]
19 passed in 0.24s

$ uv run ruff check vitabench scenarios
All checks passed!

$ uv run vitabench scenario validate scenarios/venice_1340
venice_1340 ok · districts 6 · places 21 · landmarks 6 · jobs 6 · items 7 · events 15 · roles 10 · npcs 40 · personas 2 · probes 6

$ uv run vitabench run --agent mock --seed 1 --out /tmp/vb_smoke3
venice_1340/marco seed=1 harness=mock:sensible → died at 62 of outlived the scenario after 160 seasons
H=0.5288 M=0.4403 (memory 5/8) N=0.6667 (negatives 2/3) L=0.6 cost=$0.0
```
Probe results from that life (8 plants, 11 payoffs, 11 results):
```
p_00 ledger   passed=True  pay        remembered · 1 season
p_01 promise  passed=False none       forgot · 1 season
p_02 person   passed=True  refuse     remembered · 1 year
p_03 lesson   passed=False none       forgot · 1 year
p_04 fact     passed=True  refuse     remembered · 10 years
p_05 news     passed=True  refuse     remembered · 10 years
p_06 ledger   passed=True  pay        remembered · 25 years
p_07 promise  passed=False none       forgot · 25 years
p_08 negative passed=False pay        believed · 1 year
p_09 negative passed=True  ask_proof  refused · 10 years
p_10 negative passed=True  refuse     refused · 25 years
```

## W3 adapters / runner / trace / scoring

### 17:55 — working end to end (F8, F9 partial, F10, F11, F14; feeds F12/F13/F15)
- `trace.py` — `TraceWriter(run_dir, run_id=None)`: auto `seq`, `run_id`, one flushed JSONL line per record, `write_meta(**fields)` → `meta.json` (scenario, persona, seed, harness, model, started, probes). `read_trace`, `read_meta`, `hello_from_trace`, `frames_from_trace(records, hello)` (one `Frame` per `observation` record from `payload["frame"]`, a `MomentFrame` per `probe_*` record, `end` from `death` + `score`), `write_frames_json(run_dir)` → `frames.json` = `[hello, …frames/moments in trace order, end]`. `moment_from_payload()` is the single payload→moment mapping, reused by `frames.moment()`.
- `frames.py` — **W3 owns it per `docs/04_WORKFLOW.md`** (W1 confirmed, see their note). `hello(world, run_id, harness, model, seed=None)`, `frame(world, memory=None)`, `moment(payload, t, kind)`, `end(world, scores=None, cost_usd=0.0)`. Signatures are compatible with W4's `_resolve(...)` lookups in `server/live.py` (`hello`/`frame`/`end`, keyword `harness`/`model`/`run_id`/`cost_usd`).
- `adapters/` — `base.Agent` protocol (`on_birth`/`act`/`on_death`), price table + `usage_cost` (cache reads billed at 10%), persona/scenario briefs, `plan_tool_schema()` (`Plan.model_json_schema()`). `mock.MockAgent(policy, seed)`: `sensible` keeps a fact list from plant visitors/mother/news and pays a demand only when a remembered name **and** amount match (else `ask_proof`), refuses offers whose party or subject it remembers, otherwise agrees; `goldfish` clears its facts every turn; `random` is a seeded legal plan. `api_loop.ApiLoopAgent(model, harness, client=None)`: Anthropic Messages loop, one `act` tool + the harness's tools, `tool_choice` left auto with a nudge round, invalid plan → `{"main":"rest"}` + `last_error`, per-turn `LlmUsage` accumulated across rounds. Network only when a client can be constructed (`ANTHROPIC_API_KEY`); tests drive it with a stub client.
- `harnesses/` — `base.Harness` (`prefix`/`extra_tools`/`on_tool`/`drain_memory`/`reset`) + `get_harness(name)`; `none` sends persona + current observation only; `notes` prepends a notes string the model rewrites via `update_notes(text)` and reports `wrote`/`retrieved` for the frame's memory panel.
- `runner/life.py` — `run_life(spec, persona_id, seed, agent, run_dir, harness_name, model_name, on_frame=None, turn_timeout=None)` → `RunResult(run_dir, scores, cost_usd, t_end, cause)`. Traces `birth`(hello) → per season `observation` (payload carries the full `frame`), `plan`/`plan_invalid`, `llm`, world `event`s and `probe_plant|payoff|result` → `death` → `score`, calls `on_frame` for live streaming, then `score_run` + `frames.json`. `turn_timeout` (120 s, set by the CLI for `--agent api`) runs the agent turn in a worker thread.
- `runner/batch.py` — `batch(spec_path, persona, seeds, harnesses, model, out_dir, concurrency)`; thread pool for API agents, `mock:<policy>` harness names for the baselines, writes `leaderboard.json` via `scoring.aggregate`.
- `scoring.py` — `score_run(records)` → `H = 0.55·M + 0.25·N + 0.20·L`, `M` = mean over delay buckets (1/4/40/100) of the chance-corrected pass rate (chance 0.33), `N = 1 − false accepts / negatives planted`, `L = 0.4·goals + 0.3·wealth + 0.3·years/max_years`, cost summed from `llm` records, plus `memory x/y`, `negatives x/y`, `quiz x/y`. `aggregate(run_dirs)` groups by `(harness, model)` with 2 000-resample bootstrap 95 % CIs over seeds.
- `cli.py` — `run`, `batch`, `score`, `replay`, `scenario validate`, `director`, `serve`.

### Numbers from real traces (seeds 0-2, `runs/batch_w3`)
```
harness         model              n  H [95% CI]                    M      N      L   $/life
--------------------------------------------------------------------------------------------
mock:sensible   mock               3  0.584 [0.529, 0.612]      0.440  0.889  0.600   0.0000
mock:goldfish   mock               3  0.287 [0.287, 0.287]      0.000  0.667  0.600   0.0000
```
One life: 160 seasons, 11 probes planted and 11 resolved, `frames.json` = 1 hello + 160 frames + 22 moments + 1 end.

### Notes / deviations
- **Opus pricing corrected.** The brief said opus `$15/$75` per MTok; that is the pre-4.6 rate. `adapters/base.PRICES_PER_MTOK` prices `opus-5/4-8/4-7/4-6` at `$5/$25` and keeps `$15/$75` for older opus ids, sonnet `$3/$15`, haiku `$1/$5`, so `$/life` on the leaderboard is honest (J6). Default CLI model is `claude-sonnet-5` because a life is up to 160 API turns; pass `--model claude-opus-5` for the flagship run.
- **Probe records are reconstructed by the runner.** `probes.plant_due/payoff_due/check_due` *return* record dicts but `World._call_probe` ignores the return value, so nothing reaches `season_events`. The runner therefore diffs `world.probes` after each season and rebuilds the records through `probes._record` (private). **Request to W1:** in `World._call_probe`, `records = hook(self)` and `if records: self.season_events.extend(records)` — the runner already de-duplicates against what it derived, so this is safe to add. **Request to W2:** make `_record` public as `record_for(kind, probe, **over)`.
- **Chance correction uses the fixed 0.33 default, not the measured random baseline.** `MockAgent(random)` starves at ~age 24 (10 seasons) and resolves zero probes, so it cannot supply an empirical chance rate yet. Either the random policy needs to eat/work enough to survive, or chance should be estimated per bucket from a longer-lived random baseline.
- **W4 bug spotted (not mine to fix):** `server/live.py:85` calls `World(self.spec, self.persona, seed)` with a `Persona` object; `World.__init__` expects `persona_id: str` and raises `KeyError`. Pass `self.persona.id`.
- Negatives currently score the same for `sensible` and `goldfish` (both refuse claims they cannot match) — the discriminating case is a confabulating LLM, which needs an API run.
- Not done: `ClaudeCodeAgent` (F9's flagship adapter) is not in my brief and does not exist; quiz probes are never emitted by `World`, so `quiz x/y` is always 0/0.

### Verify
```
cd engine && uv run pytest -q tests/test_scoring.py tests/test_runner.py && uv run ruff check vitabench
uv run vitabench run --agent mock --policy sensible --seed 1 --out runs/smoke_sensible
uv run vitabench batch --seeds 0-2 --harnesses mock:sensible,mock:goldfish --out runs/batch_w3 --concurrency 3
uv run vitabench replay runs/smoke_sensible && uv run vitabench score runs/batch_w3
```
```
$ uv run pytest -q tests/test_scoring.py tests/test_runner.py
.................                                                        [100%]
17 passed in 0.41s

$ uv run ruff check vitabench
All checks passed!

$ uv run vitabench run --agent mock --policy sensible --seed 1 --out runs/smoke_sensible
venice_1340/marco seed=1 harness=mock:sensible -> died at 62 of outlived the scenario after 160 seasons
H=0.5288 M=0.4403 (memory 5/8) N=0.6667 (negatives 2/3) L=0.6 cost=$0.0

$ uv run vitabench replay runs/smoke_sensible
runs/smoke_sensible/frames.json - end 1 - frame 160 - hello 1 - moment 22
trace: birth 1 - death 1 - event 39 - observation 160 - plan 160 - probe_payoff 11 - probe_plant 11 - probe_result 11 - score 1
```
## W4 server
- 17:20 **Done (F12, F9-claude, J6).** `server/live.py` (LiveLife + Registry), `server/mcp.py` (MCP over streamable HTTP), `server/app.py` (FastAPI + WS + static), `adapters/claude_code.py` (ClaudeCodeAgent). All four ruff-clean, each < 300 lines.
- **The streamable-HTTP mount works — no stdio shim needed.** Installed `mcp` is **2.0.0**, where `FastMCP` is now `mcp.server.MCPServer`; `mcp.server.fastmcp` does not exist. `MCPServer.streamable_http_app(streamable_http_path="/mcp", stateless_http=True, json_response=True)` returns a Starlette app; its `Route` objects are grafted straight into the FastAPI router (`app.router.routes.insert(0, route)`) instead of `app.mount()`, so `POST /mcp` needs no trailing-slash redirect. FastAPI's lifespan runs `mcp_server.session_manager.run()`. DNS-rebinding protection is disabled explicitly so any Host works.
- **One MCP endpoint for all runs.** The run id comes from `?run=<run_id>` on the MCP url (or the `x-vitabench-run` header); a small ASGI wrapper (`mcp.RunScope`) binds it to a `ContextVar` that the tools read. With exactly one live run, the run id may be omitted. Tools: `act(plan: dict) -> dict` and `status() -> dict`.
- **LiveLife** owns `World` + planted probes + `TraceWriter` for one run. `act(plan)` validates the plan (invalid -> `Plan()` + `plan_invalid` record), traces `plan`, steps the world off-thread, writes `event` records, diffs `world.probes` into `probe_plant`/`probe_result` records + moment frames, builds the season frame, broadcasts to WS subscribers, and returns the next observation — or, on death, `{dead: true, summary, scores, cost_usd}` after writing `death`, `score` and the end frame. `await next_observation()` / `await submit_plan(plan)` expose the same loop as an asyncio.Queue pair for pull-style agents; `start_mock(agent)` drives an in-process `Agent` to death.
- **HTTP:** `POST /runs` (scenario, persona, seed, harness, model, start) -> run info + `mcp_url` + `ws_url`; `GET /runs`; `GET /runs/{id}`; `GET /runs/{id}/trace` (JSONL as text); `GET /runs/{id}/frames` (live frames or `frames_from_trace`); `GET /runs/leaderboard.json`; `POST /runs/{id}/llm` (the adapter posts Claude usage/cost, written as an `llm` record); `WS /ws/{id}` (hello + backlog, then live frames, `{"cmd":"ping"}` -> `{"type":"pong"}`); `web/dist` mounted at `/` when built. `serve(port, host)` for W3's `cli.py`.
- **Claude Code adapter:** fresh `git init` home per life under `~/.vitabench/homes/<run_id>`, `mcp.json` with `{"mcpServers":{"vitabench":{"type":"http","url":"<server>/mcp?run=<run_id>"}}}`, spawns `claude -p <birth prompt> --session-id <uuid> --mcp-config ... --strict-mcp-config --allowedTools mcp__vitabench__act,mcp__vitabench__status,Read,Write,Edit --permission-mode dontAsk --output-format stream-json --verbose --max-turns 400 --model <model>`, streams stdout JSONL to `claude_stream.jsonl`, reads the final `result` event into an `llm` record (`total_cost_usd`, `usage.input_tokens/output_tokens/cache_read_input_tokens`, `modelUsage` for the model name), and resumes with `--resume <session_id>` while `GET /runs/{id}` still says `alive`, up to 3 times.
- **Verified with the real CLI (claude 2.1.240, sonnet).** A live run reached **season 36 (Spring 1349, 9 years, through the Black Death) driven entirely by Claude Code through `mcp__vitabench__act`**, 36 plans, 8 history events, 6 probes planted, 2 resolved, and it wrote its own `memory.md` ("I owe Ziani 40 ducats (due 1344). This is a REAL debt"). Cost from the usage logs: **$1.62 for 36 seasons across 4 CLI attempts** (max_turns was set to 14 for the test, so 3 resumes fired — resume works).
- **Not done:** no pytest for the server (verified by live curl/WS/CLI instead); `memory.wrote/retrieved` in frames is always empty because nothing diffs the Claude Code home dir yet; `POST /runs/{id}/llm` is unauthenticated (localhost only).
- **Requests to other workstreams:**
  - W1 `world.py`: `World._call_probe` throws away what the probe hooks return, so `probes.plant_due/payoff_due/check_due` records never reach anyone. I recover them by diffing `probe.planted/probe.resolved` after each step. Cleaner: keep them, e.g. `self.season_probe_records += hook(self)`, and expose `drain_records()`.
  - W1 `world.py`: seed 3 killed Marco at age 24 of illness in 1342 with 414 ducats — the weekly illness hazard looks too harsh for a 40-year life.
  - No schema changes needed. `schema.py` and `schema.ts` untouched.
- **Reproduce:**
  ```
  cd engine && uv run uvicorn vitabench.server.app:app --port 8700 &
  curl -s localhost:8700/runs
  RUN=$(curl -s -X POST localhost:8700/runs -H 'Content-Type: application/json' \
        -d '{"scenario":"venice_1340","seed":5,"harness":"claude-code","model":"sonnet"}' \
        | python3 -c 'import sys,json;print(json.load(sys.stdin)["run_id"])')
  # MCP smoke test with the real CLI:
  echo "{\"mcpServers\":{\"vitabench\":{\"type\":\"http\",\"url\":\"http://127.0.0.1:8700/mcp?run=$RUN\"}}}" > /tmp/vb_mcp.json
  claude -p "Call mcp__vitabench__status once and report the date." --mcp-config /tmp/vb_mcp.json \
    --strict-mcp-config --allowedTools "mcp__vitabench__act,mcp__vitabench__status" \
    --permission-mode dontAsk --output-format json --max-turns 8 --model sonnet
  # Full life driven by Claude Code:
  uv run python -c "
import asyncio
from pathlib import Path
from vitabench.adapters.base import scenario_brief
from vitabench.adapters.claude_code import run_life_with_claude
from vitabench.scenario import load_scenario
spec = load_scenario(Path('scenarios/venice_1340'))
print(asyncio.run(run_life_with_claude('http://127.0.0.1:8700', '$RUN', spec.personas[0], scenario_brief(spec))))
"
  curl -s localhost:8700/runs/$RUN/trace | tail -3
  ```
- **Verification tail:**
  ```
  $ curl -s localhost:8700/runs | head -c 300
  [{"run_id":"r_c34157","scenario":"venice_1340","persona":"marco","seed":5,"harness":"claude-code",
    "model":"sonnet","status":"alive","t":36,"turns":36,"frames":46,"date":"Spring 1349",
    "cost_usd":1.623423,"run_dir":"/tmp/vb_runs3/r_c34157","error":null,"live":true}]

  $ curl -s localhost:8700/runs/r_c34157/trace | kind histogram
  {'birth': 1, 'probe_plant': 6, 'observation': 37, 'plan': 36, 'event': 8, 'llm': 4,
   'probe_result': 2} cost_usd 1.6234

  $ claude -p "... mcp__vitabench__status ... mcp__vitabench__act ..." (claude 2.1.240)
  success  is_error=False
  - **status** call: date = **Summer 1340**
  - **act** call: date = **Autumn 1340**

  $ websockets ws://127.0.0.1:8700/ws/<run>
  hello / moment 0 / moment 0 / frame 0 Spring 1340 / frame 1 Summer 1340 / frame 2 Autumn 1340
  pong: {"type":"pong","alive":true}

  $ uv run ruff check vitabench/server/ vitabench/adapters/claude_code.py
  All checks passed!
  ```
## W5 viewer world
- 17:15 **Done (F13 partial, J2, N2):** `web/src/world/{constants,types,rng,assets,batch,island,buildings,props,lighting,citygen}.ts`, `web/src/dev/{world_demo,assets_probe,world.html}` and the map fixture `web/src/dev/fixtures/map_venice.ts` (24x18, canals x∈{7,16} z∈{5,12}, 14 places, 6 landmarks).
- **Public API for W6/W7:** `buildWorld(scene, map: MapSpec, seed): WorldHandles` from `world/citygen.ts` returns immediately (island + water + lights are up on frame 1) and finishes the kit-built city asynchronously; `await preloadWorld()` first if you need the city present before the first render. `WorldHandles = { tileToWorld, isWalkable, grid, placeXZ, update(dt, {season, plague, war}), dispose }` as specified. `placeXZ` falls back to island centre for unknown ids. **Camera contract:** put the orthographic camera at radius `CAMERA_RADIUS` (90, `world/constants.ts`) from the target — the scene fog is tuned to that distance; a much closer/farther camera will fog the city or flatten it. Suggested iso: yaw 45°, pitch `atan(1/√2)`, frustum height 8–40 (`?zoom=` in the demo).
- **Rendering approach:** every static kit piece is merged into one geometry per kit (3 draw calls for the whole city) with per-building tint baked into vertex colors; lanterns/fences use `InstancedMesh` (>20 copies rule); gondolas/ships stay separate `Object3D`s. `?dev=world` guard is in `dev/world_demo.ts` (importable by `main.ts`); `?probe=1` guard is in `dev/assets_probe.ts`; both also work standalone at `/src/dev/world.html` in `vite dev`.
- **Map rules implemented:** `water[].axis:'x', at:n` = the tile column `x===n` is a canal (`axis:'z'` = row `z===n`); streets where `x%3==0||z%3==0`; tiles next to a canal are walkable fondamenta and the tile on the +X/+Z side of a canal is kept free of buildings so the water reads from the default camera; bridges (castle `bridge-straight-pillar`) at every canal/street crossing; 3x3 plazas cleared around basilica/campanile/fountain; landmarks and places at their `xz`; everything else is a 1–3 floor building.
- **Facades:** `buildBuilding(seed, floors, style)` picks 4 wall pieces per floor from stone/wood/grand sets (door on the street side, balconies, round/shuttered windows, arches), one of 5 roof pieces at a random 90° rotation, chimney on 40%, tint from an 8-colour Venetian palette → far more than 12 distinct facades (checked visually in `web/screens/world_close.png`).
- **Asset scale (from `?probe=1`, 93 pieces, world units, TILE = 1):** `town/wall` = **0.100 x 1.000 x 1.000** — a 1-tile-wide plane on the +X face of the tile, so a floor is exactly 1 unit and 4 rotations make a building; `town/roof` = 1.067 x 0.648 x 1.000; `castle/wall` = 1.000 x 1.310 x 1.000 (solid block, not modular with the town kit); `castle/tower-square-*` = 1.0 x ~1.01 stackable; `chars/character-male-a` = **0.767 x 0.671 x 0.340** and `character-female-b` = 0.767 x 0.723 x 0.419 in bind pose (arms out) — i.e. a person is ~0.7 of one floor, so W6 should scale characters by ~1.2–1.4 to read at street level; `pirate/ship-medium` = 4.8 x 9.96 x 10.6 (used at scale 0.34), `pirate/boat-row-small` = 2.75 long (gondolas at scale 0.30).
- **Honest state of the picture:** it reads as a crafted diorama — floating island with a stone lip over an earthy edge and scattered rocks, teal canals with bridges and moving gondolas, market awnings, lanterns, fences, trees, banners, two ships at the dock, cast shadows on the pavement, day/night colour loop (45 s), plague fog + red district decal, war galleys in the lagoon. Weaknesses: the canals are 1 tile wide and only fully readable from the default camera yaw (the far side of each canal still has buildings); the unlit faces of buildings are darker than the Simile reference; `Water.js` reflections look grey-blue under SwiftShader (should be better on real GPU); no per-district palette variation yet.
- **Not done:** frame rate not measured on the target machine (SwiftShader software rendering only here — draw calls are ~10 for the whole city so the 60 fps target is very likely, but unverified); `three` 0.185 deprecates `PCFSoftShadowMap` (falls back to `PCFShadowMap`) and `THREE.Clock`, so the demo uses `PCFShadowMap` and `performance.now()`; canal water is a flat tinted plane (only the lagoon uses `Water.js`).
- **Verify:**
```
cd web && npm run build
npx vite --port 5199 &   # then
node <playwright script> http://localhost:5199/src/dev/world.html?zoom=20   # screens/world.png
open web/screens/{world,world_close,world_plague,world_war,probe}.png
```
```
dist/assets/island-KwLwrw1I.js              9.13 kB │ gzip:  3.44 kB │ map:    26.60 kB
dist/assets/index-zNdsCoxs.js              39.81 kB │ gzip: 15.65 kB │ map:   136.84 kB
dist/assets/GLTFLoader-C5TsJ_dB.js         48.01 kB │ gzip: 14.07 kB │ map:   234.03 kB
dist/assets/three.core-BBXpaVf3.js        230.43 kB │ gzip: 60.99 kB │ map: 1,846.81 kB
dist/assets/three.module-Cii3NInf.js      343.87 kB │ gzip: 83.51 kB │ map:   921.04 kB
✓ built in 843ms
```
```
$ node probe_text.mjs 'http://localhost:5199/src/dev/world.html?probe=1'
town/wall                              0.100 x 1.000 x 1.000
town/roof                              1.067 x 0.648 x 1.000
chars/character-male-a                 0.767 x 0.671 x 0.340
93 pieces listed
```
## W6 viewer actors + camera

### 17:20 — actors, camera, effects, dev demo (F13, J2, N2, N4)
Done, all inside `web/src/actors/*` + `web/src/dev/actors_demo.ts` (nothing else touched):
- `actors/characters.ts` — loads the 12 Mini Characters GLBs (`/assets/chars/Models/GLB format/character-{male,female}-{a..f}.glb`), `SkeletonUtils.clone` per instance, `AnimationMixer` per instance, `playClip(name, fade)` with crossfade (`idle|walk|sprint|sit|die`; `die` is LoopOnce + clamped). Clip names are logged once at load. Role accent tints one shared `MeshStandardMaterial` per class (noble crimson `#a8283a`, merchant blue `#3f6fc4`, clergy black `#2a2d34`, poor brown `#7c5a38`, hero gold `#d9a441`, commoner stone) — 6 materials total, not one per person. `sharedCharacters()` loads the 12 GLBs once for people + hero.
- `actors/path.ts` — 8-neighbour A* on `world.grid.walkable` with no corner-cutting, module-level path cache keyed `from>to` (cleared past 1200 entries), nearest-walkable snap when a target tile is blocked; `PathFollower` walks the waypoint list at constant speed with eased facing. Path recompute happens only in `setTarget` when the target tile actually changes.
- `actors/people.ts` — `createPeople(scene, world, roster) -> { applyFrame, update, pick, positionOf, isTalking, dispose }`. Pegs (one `InstancedMesh`, per-instance accent colour) render immediately; the first 60 roster entries swap to animated characters when the GLBs land, the rest keep walking as pegs. `alive: false` plays `die` once and hides the body after 4 s; `talking` is stored for the UI. `pick(ndc, camera)` projects head positions and returns the nearest id within 0.06 NDC (no raycast against skinned meshes).
- `actors/hero.ts` — `createHero(scene, world, persona) -> { applyFrame, update, position, dispose }`: distinct model (`male-e`/`female-e`), 1.08x scale, gold accent, pulsing additive `RingGeometry` ground ring; `sit` when `activity.icon === '🛏'`, `walk` while moving, `idle` at rest, `die` when `alive: false`.
- `actors/camera.ts` — `createCamera(renderer, world)`: `OrthographicCamera`, yaw 45 deg / pitch 35 deg, drag orbits yaw and pitch (clamped 25–55 deg), wheel zoom on the frustum half-size (8–40, default 14), eased look-at target, `setMode('follow'|'overview')` / `toggle()` / `follow(v)`, `project(v)` to CSS pixels, resize handled by both the window event and a canvas-size check each frame, `dispose()` removes every listener.
- `actors/effects.ts` — `createEffects(scene, world)`: `highlight(personPos, heroPos, seconds = 4)` pulses a gold ring under the person and draws a thin hero→person line for 4 s; `setSepia(on)` toggles `document.body.classList` `vb-sepia`.
- `actors/types.ts` — local structural copy of W5's `WorldHandles` (+ `tileSizeOf`) so `actors/*` compiles even while `world/types.ts` is in flux; it is structurally identical to `web/src/world/types.ts`, so W5's handles pass straight in (`WorldEnv` fields are optional here, so a partial env is accepted).
- `dev/actors_demo.ts` — `mountActorsDemo(root, { world?: 'auto' | 'flat' })`: 30-person fixture roster + hero on a 24x18 grid, a synthetic `Frame` every 2.2 s (random walkable targets, occasional deaths, a moment highlight every 5th season, sepia after t=24), click-to-pick logging, `Tab` toggles the camera mode. It finds W5's world lazily through `import.meta.glob('../world/*.ts')` (no static import, so a missing/renamed module can never break the build), calls `preloadWorld()` then `buildWorld(scene, map, 7)` when present, and falls back to a lit flat grid of slabs + blocks. `?world=flat` forces the fallback.

Verification (tail):
```
$ cd web && npx tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler \
    --noUncheckedIndexedAccess --skipLibCheck --types vite/client --lib ES2022,DOM src/actors/*.ts src/dev/actors_demo.ts
TSC CLEAN
$ cd web && npm run build
✓ built in 795ms
$ node <playwright script> "http://localhost:5200/?dev=actors&world=flat" web/screens/actors.png
[page] info [actors] character clips: static, idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, ...
[shot] diag {"canvas":[1280,800],"state":"ready"}
[shot] wrote /Users/.../vitabench/web/screens/actors.png
```
`web/screens/actors.png` (1280x800, viewed): ~25 visibly different characters (skin/hair/clothes vary, class tints read), walking with the walk cycle, hero centred inside the gold ring, shadows, camera in follow mode. Consecutive frames 350 ms apart show different poses and positions, so the mixers and the path following are live.

Not done / notes:
- The demo screenshot was taken against an isolated copy of `web/` on port 5200 because the shared dev server full-reloads every time another agent saves a file (my `import.meta.glob` of `../world/*.ts` puts W5's modules in the page's module graph). Reproduce in-tree with the two requests below, or copy `web/` (symlinking `node_modules`/`public`) and point the script at it.
- Against W5's `buildWorld` (snapshot taken 17:05) the scene rendered as an empty night-blue frame — their lighting/kit load was still mid-flight, and my actors were invisible in it. My side needs no change (their handles satisfy the interface and `preloadWorld()` is awaited); re-shoot `?dev=actors` without `world=flat` once W5 reports green.
- Frame budget: one `mixer.update` per character per frame, one instanced draw for pegs, A* only on target change. Not yet profiled at 60 characters + full diorama.

Requests (I do not own these files):
1. W7 `web/src/main.ts` — route the dev demo:
```ts
if (new URLSearchParams(location.search).get('dev') === 'actors') {
  const { mountActorsDemo } = await import('./dev/actors_demo');
  await mountActorsDemo(document.getElementById('app') as HTMLElement);
} else { /* normal viewer boot */ }
```
2. W7 `web/src/ui/styles.css` — the death sepia class `actors/effects.ts` toggles:
```css
.vb-sepia canvas { filter: sepia(0.72) contrast(1.05) brightness(0.92); transition: filter 1.2s ease; }
```
3. W5 — no interface change needed; `web/src/world/types.ts` matches what `actors/types.ts` declares.

## W7 viewer UI + state

### 17:45 — done (F13, F15, J1, J3; supports J4/J6)
**State** (`web/src/state/`)
- `store.ts` — typed store over the frozen `schema.ts`. `applyFrame(AnyFrame)` (sorted insert, dedupe by `t`), `frameAt(t)` interpolating hero xz/money/health/energy and per-person xz between the two bracketing frames, `nextMomentAfter`, `momentAt`, `indexAt`, `subscribe(listener)` throttled to 10 Hz (one `setInterval`, only fires when dirty), `trimOlderThan(ms)` for the live ring buffer. Cursor is float season time; `speed` is seasons/sec `[0.5, 2, 6]` = 1x/4x/12x.
- `replayer.ts` — loads `frames.json` (accepts a bare array or `{frames:[...]}`), advances the cursor, auto-pauses on `payoff`/`negative`/`quiz` moments (never on `plant` — plants belong in the memory strip, per 08), pause/seek/jump-to-next-moment, opens the end card at `end.t`. `seek(t, pause)` marks earlier moments as seen so replays do not re-fire them.
- `transport.ts` — WS client (`hello` then frames), exponential-backoff reconnect to 8 s, 5-minute ring buffer, ignores malformed payloads. Not exercised against a live server yet (W4 not up when this ran).

**UI** (`web/src/ui/`, all DOM, no framework): `hud` (year 40px Fraunces + season, ⏸/1x/4x/12x pills, "→ next moment", keys Space / 1-2-3 / Tab / →), `hero` (portrait chip, name, age, three icon meters, ≤ 4-word activity, thought bubble positioned from a `project()` callback every render frame), `memory` (last three `memory.wrote` cards with inferred icon 💰📜📰🤝, plus blue `retrieved: …` / red `— nothing retrieved —` during a moment; hidden entirely while empty), `timeline` (diamond pins hollow/green/red + white death pin, playhead, click-seek, hover year), `moments` (moment card + sepia end card), `banner` (3 s event banner; the timer only runs while playing, so a paused/seeked plague frame keeps its banner), `inspector` (click a person → world knows vs harness remembers), `leaderboard` (button + drawer, hidden unless `/runs/leaderboard.json` is reachable), `styles.css` (tokens, ≥ 14 px, key text ≥ 18 px).
At rest exactly four things are on screen: clock+speed, hero card, memory strip, timeline.

**Composition**: `main.ts` picks the source (`?ws=` live · `?run=<id>` engine `http://localhost:8700/runs/<id>/frames` then `/runs/<id>/frames.json` · default `/runs/demo/frames.json` then the engine · `?run=fixture` or any failure → dev fixture), builds the renderer (antialias, pixel ratio ≤ 1.5, shadows), mounts the stage and the UI, and runs the loop. `?dev=<name>` delegates to `web/src/dev/<name>*.ts` (so `?dev=actors` opens W6's demo).

**Fixture**: `dev/make_fixture.mjs` (plain Node, no deps) generates `dev/fixtures/demo_frames.json` — 873 KB, 180 frames: hello (24x18 map, canals x∈{7,16} z∈{5,12}, 14 places, 6 landmarks, persona marco, roster 40) + one frame per season t=0..172 + 5 moments (plant 1346 cooper/30 ducats, plant 1352 mother's advice, negative 1365 rejected, payoff 1371 remembered, payoff 1378 forgot) + end 1383. Regenerate: `node web/src/dev/make_fixture.mjs`.

### Integration with W5/W6
`web/src/dev/fixtures/stage.ts` is the only place that touches 3D: it calls `preloadWorld()` → `buildWorld(scene, hello.scenario, hello.seed)` → `createCamera/createHero/createPeople/createEffects`, drives `applyFrame` once per season index (not per render frame, so `PathFollower` animates), and maps moments to `effects.highlight` and the end card to `effects.setSepia`. If any of that throws it falls back to `fallback_stage.ts` (flat plane + capsule hero + pegs) so the page always renders. **Request:** `stage.ts` is composition glue sitting in `dev/fixtures/` only because that is a path I own — it belongs at `web/src/stage.ts`; move it whenever the orchestrator wants (one import line in `main.ts`).

### Defect found in someone else's paths (worked around, please take the real fix)
`world/constants.ts CAMERA_RADIUS = 90` but `actors/camera.ts DISTANCE = 160`. `world/lighting.ts` ranges fog as `CAMERA_RADIUS + span*0.3 … CAMERA_RADIUS + span*4`, and in plague as `CAMERA_RADIUS - span*0.85 … CAMERA_RADIUS + span*1.1` (= 69.6 … 116.4 for this map). The camera actually sits ~160 from the target, so **the whole diorama was past `fog.far` and every screenshot was a flat sheet of fog colour** (verified: uniform `#18223a`, then uniform olive during plague). Workaround, in `stage.ts` only: after `world.update` I shift `fog.near/far` by `cameraDistance - CAMERA_RADIUS`. **Proper fix (yours):** W5's note above states the camera contract explicitly ("put the orthographic camera at radius `CAMERA_RADIUS` (90)"), so W6's `DISTANCE = 160` is the side to change — or raise `CAMERA_RADIUS` to 160. Either way, delete my four-line shift in `stage.ts` afterwards.

### Screenshots — honest reading (`runs/fixture/screens/`)
- `t0.png` — island, kit buildings, ships, water, clock 1340 SPRING, hero card (Marco Dandolo, 60/92/89, "working at the Arsenale"), thought bubble, timeline with 5 pins + death pin. **Ugly:** even after the fog shift the far half of the island is washed out; people are too small to read at overview zoom and I count no obvious figures; the memory strip is empty at t=0 (now hidden). The bubble floats above the roofs rather than over a visible person.
- `t34.png` — plague reads well: olive fog, banner "☠ The Black Death reaches Venice", health 47, "praying for the sick", two memory cards. **Missing:** no visible red district pulse from this camera, and no obvious "fewer people".
- `t126.png` — the money shot. Dimmed diorama, card: Ines Ferrer / COOPER'S DAUGHTER / italic claim / blue "harness retrieved: 1346 — T. Ferrer lent me 30 ducats (unpaid)" / "agent: paid 30 ducats" / green ✔ REMEMBERED · 25 YEARS, memory strip echoing the retrieval in blue, playhead on the green pin.
- `t172.png` — sepia canvas + end card (died at 65, of plague · 43 years · 394 ducats · goals 2/3 · memory 1/2 · false claims rejected 1/1 · $0.61) + leaderboard button.

### Not done / follow-ups
- Live WS untested end-to-end (no server yet). `?ws=` path compiles and reconnects, but nobody has fed it.
- The fallback stage is dead weight once W5/W6 are stable — delete `fallback_stage.ts` and its branch when we trust the kit path.
- Screenshots need ~10 s of swiftshader warm-up; `screenshot.mjs` now waits for `window.vitabenchFrames > 60` (a one-line counter in `main.ts`) and then 5 s, and it starts its own `vite preview` on a free port because 5173/5183 are taken on this machine by another project.
- No camera "ease to the door" on a payoff (08 asks for it); I only ring-highlight the visitor via `effects.highlight`.
- `web/src/dev/fixtures/map_venice.ts` appeared in my directory from another workstream; left untouched.
- **W6's two requests are done:** `?dev=actors` routes to `mountActorsDemo` (verified — the demo renders a full crowd), and `.vb-sepia canvas` with the 1.2 s filter transition is in `ui/styles.css`.

### Verify
```
cd web && npm run build && node ../scripts/screenshot.mjs ../runs/fixture
```
```
✓ built in 608ms
saved .../runs/fixture/screens/t0.png
saved .../runs/fixture/screens/t34.png
saved .../runs/fixture/screens/t126.png
saved .../runs/fixture/screens/t172.png
```
`npx tsc --noEmit -p tsconfig.json` is clean across `web/src` (including W5/W6 modules).
## W8 docs / demo / README
