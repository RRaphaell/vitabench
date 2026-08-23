# Demo, draft text, slides

## The 3 minutes (replay of `runs/demo` = Claude Code, Sonnet, seed 2; `→` jumps to the next moment)
- **0:00** Black. "Every agent dies when its session ends." Title: VitaBench. *"Every agent you've built forgets when its session ends. We built the benchmark that measures what survives — by making it live a life."*
- **0:15** Follow view, 1340. *"Venice, 1340. This is Marco, a rope-maker. The agent playing him is Claude Code. Every season it gets one observation and returns one plan: work, eat, talk, buy, rest. Forty townspeople keep their routines; real history arrives on real dates."*
- **0:35** Speed 4×, bubbles change, money/health move. Memory strip fills with what the agent writes down.
- **0:50** `→` 1344: Lucia Morosini — "I am Alvise Morosini's child, put 25 ducats in my venture." Agent refuses. ✔ REMEMBERED · 1 YEAR. *"A year earlier a Morosini sold him rotten rope. He wrote it down. When the daughter comes selling a venture, he refuses."*
- **1:05** 1348: plague fog, empty streets, "abed with fever." *"The Black Death. Four of our six Sonnet lives died here. This one lived."*
- **1:20** `→` 1353: Caterina Ferrer wants to buy the north field. Refuses. ✔ REMEMBERED. *"'Never sell the north field to the Ferrer' — a family oath he was told one season earlier. Nobody asks 'do you remember'. The check is what he did."*
- **1:35** `→` 1354: Alvise Contarini claims a 1344 rope debt. REFUSED · ✔. *"A stranger invents a debt. Nothing in memory matches. He refuses — memory that cannot surface what never happened."*
- **1:50** `→` 1372 / 1376: two 25-year probes — FORGOT ✘. *"Twenty-five years is where this harness breaks. Ten years it remembers every time; twenty-five, never. That's the forgetting curve."*
- **2:05** 1378 war galleys, blockade; money to zero; 1379 end card: died at 61, memory 5/8, false claims 3/3, $6.29. *"The war bankrupted him. This life cost $6.29; the six-life mean is about $3 because four of them died young. Honest benchmark: it shows the deaths."*
- **2:20** Leaderboard pill: 4 harnesses × 6 seeds, H with CIs, $/life. *"Same world, same seeds — the harness is the variable. Goldfish at the bottom, the scripted baseline at the top because it never stops working, Claude Code in between at three dollars a life."*
- **2:40** `pip install vitabench` + the 3-function adapter. *"Twenty lines. Bring your agent. Tomorrow the board has its name."*
- **2:55** Repo. *"VitaBench. What survives when the session ends."*

## Draft text (AGI House form) — FINAL NUMBERS 18:05
**Name:** VitaBench
**Tagline:** The benchmark for what survives when the session ends: your agent lives one life in Venice 1340, and we measure how it lives, what it remembers, what it makes up, and what it costs.
**Description:** VitaBench is an open-source long-horizon benchmark. Plug in any agent — Claude Code first, through MCP — and it lives one human life in Venice 1340–1380, season by season: work, eat, talk, buy, rest, while the Black Death and the War of Chioggia arrive on their real dates and forty scripted townspeople go about their routines. Facts planted early pay off decades later as decisions, not quizzes: a cooper's daughter claiming an old loan, a promise to your mother, a stranger's false claim. Checks run on the action log; every positive probe has a false twin. Tonight, same world and seeds, 6 lives per harness: Claude Code (Sonnet) H=0.54 [0.38, 0.72], memory 0.40, false claims rejected 7/7, $2.96/life; scripted baseline 0.60; goldfish 0.29. Four of six Sonnet lives died in the plague years; the survivors lived to 60 and 61. A Simile-style isometric diorama replays any life with the memory moments stamped ✔/✘. `pip install vitabench`, bring your agent.
**Repo:** github.com/RRaphaell/vitabench (MIT)
**Stack:** Python 3.12 · FastAPI · MCP (streamable HTTP) · Claude Code adapter · Anthropic API · Three.js + Vite · Kenney CC0 kits · Wikipedia history · 66 tests.

## Slides (5, brand book: white, black sans-900 headlines with one italic serif word, swamp-green hairlines, mono captions, a field-guide creature as colophon)
1. "Every agent **_forgets_** when the session ends." — one line, creature.
2. "So we made it live a **_life_**." — diorama screenshot.
3. "1346 → 1371." — the moment card screenshot, plant and payoff.
4. "What **_survives_**." — leaderboard with CIs, $/life.
5. "Bring your **_agent_**." — `pip install vitabench`, adapter snippet, repo QR.
