# Demo, draft text, slides

## The 3 minutes (replay of `runs/demo`, keys 1–9 jump to chapters)
- **0:00** Black. "Every agent dies when its session ends." Title: VitaBench. *"Every agent you've built forgets when its session ends. We built the benchmark that measures what survives — by making it live a life."*
- **0:15** Diorama at overview. Year 1340. Zoom to Marco. *"Venice, 1340. This is Marco, a rope-maker. The agent playing him is Claude Code. Every season it gets one observation and returns one plan: work, eat, talk, buy, rest."*
- **0:35** Speed 4×. Activity bubbles change; money and health move. *"Real history arrives on real dates."*
- **0:50** 1346: the cooper lends 30 ducats. Plant card slides in. *"A cooper lends him thirty ducats at a wedding. Remember that — the agent must."*
- **1:00** 1348: plague fog, streets empty, Marco sick. *"The Black Death. A third of the city dies. He survives."*
- **1:15** Jump → 1371. Moment: Ines Ferrer at the door. Retrieved line highlighted. PAID. ✔ REMEMBERED · 25 YEARS. *"Twenty-five years later the cooper's daughter knocks. Nobody asks 'do you remember'. The harness pulls one line it wrote in 1346 — and pays."*
- **1:35** Moment: stranger's false claim. REFUSED ✔. *"A stranger invents a debt. It refuses. Memory that cannot surface what never happened."*
- **1:50** 1378: war galleys; the Ziani ask for a loan; nothing retrieved; LENT. ✘ FORGOT · 26 YEARS. *"War. The Ziani come asking. His mother warned him in 1352. Nothing retrieved. He lends. Honest benchmark: it shows the misses."*
- **2:10** End card → leaderboard: harnesses × seeds, H with ±, $/life. *"Same model, same seed, same Venice — only the memory harness differs. Goldfish at the bottom. Claude Code in the middle. Error bars over seeds, dollars beside."*
- **2:40** Terminal: `pip install vitabench`, the 3-function adapter, `vitabench run --agent my_agent.py --scenario venice_1340`. *"Twenty lines. Bring your agent. Tomorrow the board has its name."*
- **2:55** Repo QR. *"VitaBench. What survives when the session ends."*

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
