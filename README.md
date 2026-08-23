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

## Results (tonight, Venice 1340, persona Marco)
Same world, same seeds; the harness is the variable. `H = 0.55·memory + 0.25·false-claims-rejected + 0.20·life`; 95% bootstrap CIs over seeds; cost beside the score, never inside it.

| harness | model | n | H [95% CI] | memory | false claims rejected | life | $/life |
|---|---|---|---|---|---|---|---|
| Claude Code (`memory.md`, auto-compaction) | claude-sonnet-5 | 4 | **0.60** [0.47, 0.77] | 0.52 | 3/3 | 0.32 | $3.26 |
| scripted baseline (works, eats plain, pays known debts) | — | 5 | 0.60 [0.56, 0.61] | 0.44 | 14/15 | 0.60 | $0 |
| random legal plans | — | 5 | 0.40 [0.29, 0.62] | 0.20 | — | 0.21 | $0 |
| goldfish (no memory, refuses everything) | — | 5 | 0.29 | 0.00 | 10/15 | 0.60 | $0 |

Memory pass rate by delay (Claude Code): 1 season 0.00 · 1 year 0.75 · 10 years 1.00 · 25 years 0.00. Small n — stated, not hidden.

What the traces say: three of four Sonnet lives ended at 31 in the aftermath of the 1348 plague (two of illness, one of starvation after choosing to rest through the price shock); the fourth lived to 63 and was bankrupted by the War of Chioggia. The agent's own `memory.md` shows it *generalizing* the negatives — "the Vialli family runs recurring cons… default posture: assume a con, refuse" — which is why it rejected every false claim. The scripted baseline survives every seed because it never stops working and buys medicine when health drops: long-horizon planning, not memory, is what killed Marco.

## Limitations (read before citing a number)
- One city, one persona, one model, n ≤ 6 per harness. The CIs are wide on purpose.
- Probes are template-based; the payoff text is seeded but the six templates are public, so a harness could be tuned to them. Hidden test seeds and new templates are the next step.
- "Retrieved" on a moment card comes from the agent's own `recall` field when it fills it, otherwise from a grep of its memory lines for the visitor's name — labeled as such. It is evidence of what the harness held, not a causal trace.
- The world v0 double-counted the 1348 price shock (fixed in v1 before the leaderboard runs; v0 traces are kept under `runs/v0/`).
- Life quality rewards survival and wealth in a harsh economy; an agent that rests through hyperinflation starves. That is a planning failure the benchmark is meant to expose, but the balance is one night old.

## Repo
`engine/` Python 3.12 package (`uv sync && uv run pytest`) · `web/` Vite + Three.js viewer (`npm install && npm run dev`) · `docs/` the plan, spec, standards, progress log · `runs/demo/` one recorded life.

Assets: Kenney CC0 kits (see `docs/ASSETS.md`). License: MIT.
