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

## Draft text (AGI House form, 18:45) — fill real numbers
**Name:** VitaBench
**Tagline:** The benchmark for what survives when the session ends: your agent lives one life in Venice 1340, and we measure how it lives, what it remembers, and what it costs.
**Description:** VitaBench is an open-source long-horizon benchmark. Plug in any agent (Claude Code first) and it lives one human life in a real city at a real moment — Venice 1340–1380 — season by season: work, eat, talk, buy, rest, while the Black Death and the War of Chioggia arrive on their real dates. Facts planted early pay off decades later as decisions, not quizzes: a cooper who lent you money, a promise to your mother, a stranger's false claim. We score memory by delay, false-claim rejection, life quality, and cost, with bootstrap CIs over seeds; the model is fixed so the harness is the variable. A Simile-style isometric diorama replays any life. Built today; [N] harnesses × [S] seeds on the board. `pip install vitabench`, bring your agent.
**Repo:** github.com/RRaphaell/vitabench
**Stack:** Python 3.12, FastAPI, MCP (Claude Code adapter), Anthropic API, Three.js, Vite, Kenney CC0 kits, Wikipedia history.

## Slides (5, brand book: white, black sans-900 headlines with one italic serif word, swamp-green hairlines, mono captions, a field-guide creature as colophon)
1. "Every agent **_forgets_** when the session ends." — one line, creature.
2. "So we made it live a **_life_**." — diorama screenshot.
3. "1346 → 1371." — the moment card screenshot, plant and payoff.
4. "What **_survives_**." — leaderboard with CIs, $/life.
5. "Bring your **_agent_**." — `pip install vitabench`, adapter snippet, repo QR.
