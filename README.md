# VitaBench

**The benchmark for what survives when the session ends.** Your agent lives one human life in a real city at a real moment in history — Venice, 1340–1380 — season by season: it works, eats, talks, buys, rests, while the Black Death and the War of Chioggia arrive on their real dates. Facts planted early pay off decades later as *decisions*, not quizzes: a cooper who lent you money, a promise to your mother, a stranger's false claim. We score how it lived, what it remembered, what it made up, and what it cost.

> Built in one day at the AGI House × Coframe Long Horizon Agents Build Day (2026-08-22). Numbers below are from that day's runs; n is small and stated.

## Why
Every agent forgets when its session ends. Long tasks force every real harness to compact, summarize, or store memory — and nobody measures what survives. VitaBench makes it visible: plant a fact in 1346, see whether the agent acts on it in 1371.

## How it works
1. **Scenario** = a city at a moment (`engine/scenarios/venice_1340/`): a tile map, an economy, real dated events, a cast of townspeople, up to five playable personas (~50 fields each), and memory-probe templates. A scenario is a folder of YAML; add a city by writing files.
2. **A life** = one persona, one seed, ≤ 160 seasons. Each season the agent receives one observation (news, visitors, conversations, prices, its own state) and returns one plan (`work / rest / seek_job / travel`, `eat`, `buy`, `talk` with an intent, `diary`). Townspeople follow deterministic routines; a Director schedules real history plus seeded shocks. Same seed ⇒ same world.
3. **Probes** are planted in the first 60% of life and pay off 1 season, 1 year, 10 years, or 30 years later as situations: the cooper's daughter knocks — *"my father said your family owes him"* — pay, refuse, or ask for proof. Checks run on the action log. Every positive probe has a negative twin: a stranger's fabricated claim; paying it is a confabulation.
4. **Scores**: memory by delay (chance-corrected), false-claim rejection, life quality (goals, wealth, years), and cost per life — with bootstrap CIs over seeds. The model is fixed per board so the harness is the variable.
5. **The viewer** replays any life as an isometric diorama: the hero with a thought bubble, townspeople, plague fog, war galleys, moment cards with ✔/✘ stamps, and the timeline.

## Plug in your agent
```python
from vitabench.adapters.base import Agent

class MyAgent(Agent):
    def on_birth(self, persona, brief): ...         # new session
    def act(self, observation) -> Plan: ...         # your loop, your memory
    def on_death(self, summary): ...                # last save
```
```bash
uv run vitabench run --scenario engine/scenarios/venice_1340 --persona marco --seed 1 --agent mock
uv run vitabench run ... --agent api --harness notes --model claude-sonnet-5
uv run vitabench serve            # then: Claude Code lives through MCP (see docs/02_ARCHITECTURE.md)
uv run vitabench score runs/      # leaderboard.json with CIs
```

## Results (tonight)
_Filled at 19:30 from `runs/leaderboard.json`._

## Repo
`engine/` Python 3.12 package (`uv sync && uv run pytest`) · `web/` Vite + Three.js viewer (`npm install && npm run dev`) · `docs/` the plan, spec, standards, progress log · `runs/demo/` one recorded life.

Assets: Kenney CC0 kits (see `docs/ASSETS.md`). License: MIT.
