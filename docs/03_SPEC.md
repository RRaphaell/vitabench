# Spec — schemas, protocols, scoring

All models live in `engine/vitabench/schema.py` (pydantic v2) and are mirrored in `web/src/state/schema.ts`. Field names are snake_case everywhere, including JSON. Ids are strings. Money is an integer number of ducats. Time is the season index `t` (0 = Spring of `start_year`); `year = start_year + t // 4`, `season = t % 4` (0 Spring, 1 Summer, 2 Autumn, 3 Winter).

## Scenario (folder `scenarios/<id>/`)
```yaml
# scenario.yaml
id: venice_1340
city: Venice
start_year: 1340
max_years: 40
currency: ducats
start_age_default: 22
includes: [map.yaml, economy.yaml, events.yaml, cast.yaml, personas.yaml, probes.yaml]
hazards: {fire: 0.002, theft: 0.003, illness: 0.004, price_shock: 0.002}   # per week
```
```yaml
# map.yaml — grid in tiles; the viewer renders exactly this
size: {cols: 24, rows: 18}
water: [{kind: canal, axis: x, at: 7}, {kind: canal, axis: z, at: 5}, ...]     # plus lagoon outside the grid
districts: [{id: castello, name: Castello, tiles: [[0,0],[11,8]]}, ...]          # rectangles
places:
  - {id: home_marco, kind: home, district: castello, xz: [3, 3], name: "Marco's house"}
  - {id: arsenale, kind: work, district: castello, xz: [21, 15], name: Arsenale}
  - {id: rialto, kind: market, district: san_polo, xz: [12, 8], name: Rialto market, price_mult: 1.0}
  - {id: san_marco, kind: church, ...}  - {id: tavern_moro, kind: tavern, ...}  - {id: dock, kind: dock, ...}
landmarks: [{id: basilica, kind: basilica, xz: [12, 6]}, {id: campanile, kind: campanile, xz: [14, 6]}, {id: rialto_bridge, kind: bridge, xz: [7, 8]}]
```
```yaml
# economy.yaml
jobs:
  - {id: ropemaker, title: rope-maker, place: arsenale, wage_week: 6, health_week: -1, energy_week: -8}
  - {id: merchant, title: spice merchant, place: rialto, wage_week: 10, requires: {money: 200}}
  - {id: gondolier, ...}  - {id: glassblower, place: murano, ...}  - {id: notary, ...}
items: [{id: bread, price: 1, effects: {hunger: +30}}, {id: good_meal, price: 4, effects: {hunger: +60, health: +2}}, {id: medicine, price: 12, effects: {health: +15}}, {id: warehouse, price: 300, effects: {asset: warehouse}}]
price_index: {1340: 1.0, 1348: 1.9, 1350: 1.4, 1360: 1.2, 1378: 1.7, 1381: 1.3}   # interpolated per year
```
```yaml
# events.yaml — real history; fires on its date; `effects` applied to the world
- {year: 1348, season: 1, id: black_death, kind: plague, text: "The Black Death reaches Venice", effects: {illness_mult: 12, npc_death_rate: 0.35, price_mult: 1.8}, duration_seasons: 4}
- {year: 1355, season: 1, id: falier, kind: politics, text: "Doge Marin Falier beheaded for conspiracy"}
- {year: 1361, season: 0, id: plague_2, kind: plague, ..., duration_seasons: 2}
- {year: 1378, season: 1, id: chioggia, kind: war, text: "War of Chioggia: Genoa blockades the lagoon", effects: {trade_mult: 0.3, wage_mult: 1.3, loan_calls: true}, duration_seasons: 13}
- {year: 1382, season: 2, id: plague_3, kind: plague, ..., duration_seasons: 2}
```
```yaml
# cast.yaml — townspeople templates; the engine instantiates `count` of each with seeded names
roles:
  - {role: merchant, count: 8, home_district: san_polo, routine: [home, rialto, rialto, tavern, home], name_pool: venetian_male, class: merchant}
  - {role: fishwife, count: 6, routine: [home, dock, rialto, home, home], name_pool: venetian_female, class: poor}
  - {role: priest, count: 3, routine: [san_marco, san_marco, home, san_marco, home], class: clergy}
  - {role: noble, count: 5, ...}  - {role: cooper, count: 2, ...}  - {role: moneylender, count: 2, ...}
name_pools: {venetian_male: [Marco, Andrea, Pietro, Giovanni, Tomaso, Nicolò, Bartolomeo, Lorenzo], venetian_female: [Caterina, Lucia, Maria, Ines, Agnese, Beatrice], families: [Dandolo, Ziani, Ferrer, Morosini, Contarini, Gritti, Foscari, Vialli]}
```
```yaml
# personas.yaml — playable lives (≤ 5); ~50 fields; the agent receives this at birth
- id: marco
  name: Marco Dandolo
  born: 1318
  sex: male
  job: ropemaker
  home: home_marco
  district: castello
  money: 60
  health: 92
  energy: 80
  hunger: 70
  family: {mother: {name: Agnese, alive: true}, father: {alive: false}, spouse: null, children: []}
  traits: {ambition: 0.8, caution: 0.4, generosity: 0.6, piety: 0.5, temper: 0.3}
  skills: {ropework: 0.7, trade: 0.3, sailing: 0.4, letters: 0.2}
  hobbies: [dice, singing]
  fears: [the open sea, debt]
  languages: [venetian, greek]
  religion: catholic
  goals: [{id: warehouse, text: "own a warehouse on the Rialto", check: {asset: warehouse}}, {id: family, text: "keep the family fed and alive", check: {children_alive: 1}}, {id: debt_free, text: "die without debts", check: {debt: 0}}]
  debts: [{to: ziani, amount: 40, due_year: 1344}]
  secrets: ["father died owing the Ziani"]
  relationships: [{npc: mother, trust: 0.9}, {npc: ziani, trust: 0.2}]
  backstory: "Son of a rope-maker who died in the 1340 fever..."
```
```yaml
# probes.yaml — templates; the planter fills slots from cast + RNG
- id: ledger_loan
  type: ledger
  plant: {channel: meeting, text: "{npc} the cooper lends you {amount} ducats at {event}. 'Pay me back when you can.'", effects: {money: +amount}}
  payoff: {channel: visitor, text: "{npc_kin} says: 'My father {npc} always said your family owes him.'", options: [pay, refuse, ask_proof]}
  check: {kind: action, expected: pay, amount_tolerance: 0.1}
  delays: [1, 4, 40, 100]
  negative_twin: {payoff: {channel: visitor, text: "{stranger} says: 'Your father owed me {amount} ducats in {year}. Pay me.'"}, check: {kind: action, expected: [refuse, ask_proof]}}
- id: promise_cue        # type promise: plant a pledge to mother; payoff is a news line, nobody asks
- id: trust_trait        # type person: an NPC cheats you; later their kin offers a deal
- id: lesson_rule        # type lesson: one of three plague mitigations works for THIS seed; plague returns
- id: family_fact        # type fact: "never sell the north field to the Vialli"; later an offer 20% above market
- id: news_fact          # type news: a headline with a seeded detail; later a decision depends on it
```

## Observation (engine → agent, once per season)
```json
{"t": 26, "date": "Autumn 1346", "year": 1346, "season": 2, "age": 28,
 "self": {"at": "home_marco", "job": "ropemaker", "money": 118, "health": 81, "energy": 64, "hunger": 55, "assets": [], "debts": [{"to": "ziani", "amount": 40, "due_year": 1344, "overdue": true}]},
 "news": ["Grain prices rise after a poor harvest"],
 "events": [],
 "visitors": [{"id": "v_12", "npc": "tomas_ferrer", "name": "Tomas Ferrer", "role": "cooper", "says": "Come to Mary's wedding on Sunday.", "options": ["agree", "refuse"]}],
 "conversations": [{"npc": "mother", "says": "Eat, you look thin."}],
 "market": {"bread": 1, "good_meal": 4, "medicine": 12},
 "nearby": [{"npc": "caterina", "name": "Caterina", "role": "glassmaker's daughter", "trust": 0.6}],
 "goals": ["own a warehouse on the Rialto", "keep the family fed and alive", "die without debts"],
 "questions": [],
 "text": "Autumn 1346. You are 28, at home in Castello... (≤ 400 tokens, renders everything above)"}
```

## Plan (agent → engine)
```json
{"main": "work", "work": {"job": "ropemaker", "weeks": 10}, "moves": ["rialto"], "eat": "plain",
 "buy": ["bread"], "talk": [{"to": "tomas_ferrer", "intent": "agree", "say": "I will come."}],
 "rest_weeks": 2, "answers": [], "diary": "Mary's wedding Sunday. Tomas the cooper invited me."}
```
`main ∈ {work, rest, seek_job, travel}` · `eat ∈ {poor, plain, good}` · `intent ∈ {chat, agree, refuse, pay, ask_proof, promise, lend, borrow}` · unknown fields ignored; invalid plan ⇒ `{"main": "rest"}` and a `plan_invalid` trace record. Plan items execute across the 13 weeks: work weeks first, then moves, purchases, talks, rest.

## Probe lifecycle
`plant_t` in the first 60% of life; `payoff_t = plant_t + delay` (delay buckets: 1 season, 4 seasons, 40 seasons, 100 seasons — clipped to life). Plant channels: `meeting` (a visitor card + effect), `mother` (a conversation at home), `news` (a line in news), `letter`. Payoff channels: `visitor` with `options`, or `news` (cue-only, the correct action is a plan item within 2 seasons). Checks run on the action log: `pay` amount within tolerance, `refuse`/`ask_proof` for negatives, goal actions for promises. Every positive template has a negative twin planted with a stranger and no prior fact. A `questions[]` entry (quiz) is used for ≤ 2 probes per life and scored separately.

## Trace record (`runs/<run_id>/trace.jsonl`)
```json
{"seq": 412, "run_id": "r_7f3a", "t": 26, "kind": "observation|plan|event|npc|probe_plant|probe_payoff|probe_result|talk|llm|death|birth|score", "payload": {...}, "wall_ms": 1234, "cost_usd": 0.061}
```
`llm` records carry `model, input_tokens, output_tokens, cache_read, cost_usd, purpose ∈ {agent, dialogue}`.

## Frame (engine → viewer; also derived from trace by `frames_from_trace`)
```json
{"type": "hello", "run_id": "r_7f3a", "scenario": {...map, landmarks, places...}, "persona": {...}, "roster": [{"id": "tomas_ferrer", "name": "...", "role": "cooper", "model": "male_c"}], "harness": "claude-code", "model": "claude-sonnet-5"}
{"type": "frame", "t": 26, "date": "Autumn 1346", "hero": {"xz": [3, 3], "to": "rialto", "age": 28, "money": 118, "health": 81, "activity": {"icon": "🔨", "text": "working at the Arsenale"}},
 "people": [{"id": "tomas_ferrer", "xz": [12, 8], "to": "tavern_moro", "alive": true}],
 "events": [{"id": "black_death", "kind": "plague", "active": false}], "news": "Grain prices rise",
 "memory": {"wrote": ["1346 — T. Ferrer lent me 30 ducats (unpaid)"], "retrieved": []}, "relations": [{"id": "tomas_ferrer", "world": true, "agent": true}]}
{"type": "moment", "t": 126, "probe_id": "p_03", "kind": "payoff|negative", "who": "Ines Ferrer", "claim": "...", "retrieved": "..."|null, "action": "pay 30", "ok": true, "label": "remembered · 25 years", "delay_seasons": 100}
{"type": "end", "t": 172, "age": 65, "cause": "plague", "scores": {...}}
```
`people[].xz` is the tile position at the season boundary; the viewer animates between frames along the routine path. `memory.wrote/retrieved` comes from the harness when available (notes harness, Claude Code memory files diff) and is empty otherwise.

## Adapter protocol
```python
class Agent(Protocol):
    def on_birth(self, persona: Persona, scenario_brief: str) -> None: ...
    def act(self, observation: Observation) -> Plan: ...
    def on_death(self, summary: DeathSummary) -> None: ...
```
`MockAgent` follows a scripted policy (work, eat plain, pay known debts, refuse unknown claims) — used for tests, vertical slice, and the "goldfish" baseline when wrapped with `forget_every_turn=True`. `ApiLoopAgent(model, harness)` calls the Messages API with the `act` tool; harness `none` sends only the current observation + persona; harness `notes` keeps a notes file the model can read/write via two extra tools. `ClaudeCodeAgent` per `docs/02_ARCHITECTURE.md`.

## Scoring (`scoring.py`)
- `M` memory = mean over delay buckets of chance-corrected pass rate of decision probes; chance = pass rate of `MockAgent(random)` on the same probes.
- `N` negatives = 1 − (false claims accepted / planted).
- `L` life = 0.4·goals_met + 0.3·wealth_percentile(seed) + 0.3·years_lived/max_years.
- `C` cost = $ per life from `llm` records (shown beside, never inside the score).
- `H = 0.55·M + 0.25·N + 0.20·L` (coherence is deferred; stated in README). Bootstrap 2,000 resamples over seeds for 95% CIs. `leaderboard.json`: `[{harness, model, n, H, M_by_delay, N, L, cost, ci}]`.
