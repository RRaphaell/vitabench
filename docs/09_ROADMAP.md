# Roadmap — from tonight's demo to a benchmark people use

## Viewer: a city that changes over 40 years
- Buildings react to history: boarded-up houses after 1348 that are rebuilt over the next decade; smoke and damage during the War of Chioggia; flood water over the campi in 1369.
- The agent's life leaves marks: the warehouse appears at the Rialto the season it is bought; a boat at the dock; the family home grows or decays with money.
- Population and trade are visible: crowd density follows roster deaths and recoveries; stalls and ships scale with the trade multiplier.
- A bigger world: Murano with its furnaces, the Lido, the Giudecca, lagoon traffic, more props per block; a history strip that shows the real events ahead.
- Atmosphere: birds, banners in wind, chimney smoke, bells on events, gondola wakes, rain in autumn, snow dust in winter.
- Judge's view: an on-demand raw panel with the observation the agent saw and the plan it returned, season by season.

## Benchmark
- Hidden test seeds rotated quarterly; public dev seeds with published traces.
- Pooled per-probe scoring (done) → per-template and per-delay reporting with CIs; chance measured from a random policy with enough resolved probes.
- More probe templates (coordination with townspeople, multi-step promises, contradictory news) and a quiz track scored separately.
- Second and third cities (San Francisco 1900–1940, London 1900–1950) as YAML scenario packs; five personas per city.
- Generations mode: session wiped at death, the heir continues with only what the harness saved.
- An evaluation server: submitters expose `act()`; hidden state never leaves the server; two boards (harness with model pinned, model with harness pinned).

## Harnesses to add
- API-loop harnesses (`none`, `notes`) on Sonnet/Opus/Haiku; Letta, Mem0, Stash adapters; Claude Code with and without auto-memory.
- A cost-matched comparison: same $ budget per life, different memory designs.

## Engineering
- Live runs capped at the scenario horizon (done); per-turn wall-clock budget and resume for long API stalls.
- `vitabench claude` writes `llm` cost records live for every turn (today: at the end of the life).
- Asset pipeline: kits downloaded by `scripts/setup_assets.sh`; consider a single packed GLB per kit.
