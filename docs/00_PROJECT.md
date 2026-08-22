# VitaBench — project brief

**One line:** a benchmark where your agent lives one human life in a real city at a real moment in history — 40 years in minutes — while we measure how well it runs that life, what it remembers, and what it costs.

**Why it matters:** every agent dies when its session ends. Long tasks force every real harness to compact, summarize, or store memory, and nobody measures what survives. VitaBench makes that visible: plant a fact in 1346, see whether the agent acts on it in 1371.

## Where we are
- Built at the **AGI House × Coframe Long Horizon Agents Build Day**, Sat 2026-08-22, Hillsborough. Draft due 19:00 PT (finalists are picked from the draft text), final submit 20:00, **3-minute demos**, $5k/$3k/$2k. Must be open source and built today.
- Repo: `github.com/RRaphaell/vitabench` (MIT). Package name `vitabench`.
- Builder: Raphael Kalandadze (CTO Wandero; context-compaction researcher). He directs; agents build; the orchestrator (Claude) manages, verifies, commits.

## Who judges, what they reward
Speakers/cohosts: Josh Payne (Coframe — environments, metrics that go up, repos that trend), Neil Movva (Sail — many cheap agents living long, $ per agent-hour), Spandan Madan + Gabriel Kreiman (Engramme — real memory: episodic, time-ordered, forgetting as policy, not "markdown summaries"; error bars), Sam Liu (Stash — decisions not quiz recall; traces as data), Div Garg (crisp demos), Roland (autoresearch, meltdowns), Di Jin (code matches claim). AGI House historically rewards harness-level contributions, evidence over demos, honest failure modes, reusability, and a repo people star.

## What the room must feel in 3 minutes
1. A beautiful isometric Venice (Simile-style diorama) with a recognizable little person living a life: working, eating, talking, getting sick in 1348, trading after.
2. **The memory moment:** a face from 25 years ago knocks on the door; the harness either retrieves the memory and pays, or says "I know of no such debt". One stamp: ✔ or ✘. Then a false claim: pays a debt that never existed = ✘ confabulated.
3. A leaderboard with real numbers and error bars, dollars beside them, and `pip install vitabench — bring your agent`.

## Definition of done (tonight)
- D1 One scenario (`venice_1340`), two personas, a 40-year life runs end to end with a mock agent in < 60 s and with Claude Code as the agent (one recorded life).
- D2 Planted-fact probes (≥ 8 per life incl. ≥ 3 negatives) checked by code; scores + cost computed from the trace; `vitabench score` prints a table with bootstrap CIs over seeds.
- D3 Viewer replays any trace: isometric diorama, hero with thought bubble, townspeople, events (plague, war), moment cards with stamps, timeline, minimal HUD, speed control, rotate/zoom, click a person.
- D4 One recorded demo life (`runs/demo/`) checked into the repo and a backup screen recording.
- D5 README with the finding, the adapter snippet, and honest n.
- D6 Draft text saved at 18:45; final at 19:45; 5 brand-aligned slides.

## Timeline (PT)
16:30 docs + skeleton committed → 16:45 swarm wave 1 (engine, scenario, viewer, adapters in parallel) → 17:30 vertical slice: mock life → trace → viewer replay → 18:00 Claude Code life recorded; probes scored; viewer with assets → 18:30 wave 2 polish + review + screenshots → 18:45 **draft** → 19:30 batch numbers, README, slides → 19:45 **final**. After that: keep polishing for the public repo.

## Non-goals tonight
Generations/heirs (future mode), second city, HTTP adapter generality, Stash/Letta harnesses, LLM-judged coherence, human baselines, a hosted evaluation server.
