# Viewer design — "a Simile diorama of Venice you can read from across the room"

## Reference
Simile's website shows isometric pixel-art **dioramas**: a floating island tile with a thick earthy edge, densely detailed buildings, landmarks you recognize in a second, tiny people walking, props everywhere, soft shadows. We reproduce that *feel* in Three.js with the Kenney kits (CC0): orthographic isometric camera, floating island, varied facades, props, water, boats, 12 distinct character models with walk/idle animations.

## Scene
- **Camera:** `OrthographicCamera`, classic isometric (yaw 45°, pitch ~35°). Orbit by drag (yaw only, pitch clamped 25–55°), wheel zoom (frustum scale 8–40). `Tab` toggles follow (camera target eases to the hero) and overview (target = island center). Keyboard `1/2/3` speed, `Space` pause, `→` jump to next moment.
- **Island:** the map grid sits on a slab with a 2-tile earthy edge (castle `ground` + `rocks`) floating over water; lagoon water beyond. Water: `three/addons/objects/Water.js` with the normal map, tinted teal, low distortion; or a flat animated plane if perf needs it.
- **Buildings:** each non-walkable land tile gets a **recipe** from the Fantasy Town Kit: 2–3 floors of `wall-*` pieces chosen by a seeded picker (stone/wood, windows with shutters, round windows, arches, balconies on upper floors, doors on the street side), a roof from `roof-*` / `roof-high-*` with occasional `roof-window`, chimneys on 40%. Per-building tint from a Venetian palette (ochre, terracotta, rose, cream, brick) applied via vertex color multiply so kit pieces vary. At least 12 visibly distinct facades.
- **Landmarks:** basilica = kit walls + `fountain-round` domes or castle `tower-hexagon-roof`; campanile = stacked `tower-square-*` + `tower-square-roof`; Rialto bridge = castle `bridge-straight` ×2; Arsenale = `castle-wall` + `castle-gate` + `ship-medium`; Murano furnace = `watermill` chimney trick. Recognizable silhouette > accuracy.
- **Props:** market stalls (`stall-*`, `cart`) on the campo and along the Rialto, `lantern` at corners, `barrel`/`crate` at the dock, `tree`/`hedge` in courtyards, `banner-red/green` on the campo, `fence` along canals, `boat-row-small` gondolas moving on canals, `ship-small` at the dock, `ship-medium` galleys in the lagoon during war, `flag-pennant` on the campanile.
- **Lighting:** hemisphere + directional sun with soft shadow map (2048, PCFSoft) — shadows are what make a diorama read as crafted. Day/night loop decoupled from sim time (45 s real), season tints the sky and fog; winter = pale, summer = warm; plague = desaturated green fog + fewer people + a red pulse over the affected district; war = galleys, smoke fog, red banners.
- **People:** `character-{male,female}-{a..f}` from Mini Characters via `SkeletonUtils.clone`, `walk`/`idle`/`sit`/`die` clips. Townspeople: ≤ 60 animated; if more are needed, extras are instanced pegs. Each NPC has a role color accent (scarf/cloak tint). Hero: a distinct model + a soft gold ground ring; no beam.
- **Movement:** NPCs walk street grid paths between routine places (A* on the tile grid, cached); hero walks to its plan destinations. At 1× a season takes ~2 s, so walks are choreographed within the season.

## HUD — the simplification rules
Raphael's feedback: *too much text, hard to read at a glance.* Rules:
1. **At most four things on screen at rest:** (a) the clock — year huge, season small — with speed controls; (b) the hero card — portrait chip, name, age, three icon-meters (💰 money, ❤ health, ⚡ energy), current activity in ≤ 4 words; (c) the memory strip — the last three things the harness wrote, as short cards with an icon (🤝 person, 📜 promise, 💰 debt, 📰 news); (d) the timeline — a thin bar with diamond pins (hollow = planted, green = remembered, red = forgot, white = death) and a playhead.
2. **Everything else appears only when relevant:** event banner for 3 s when an event starts; relationship popover on click; leaderboard behind one button; inspector on click of a person or building.
3. **Thought bubble** above the hero: icon + ≤ 4 words. Townspeople get a tiny bubble only when talking to the hero.
4. **Moment card** (auto-pause, 60% dim): who (name, role), one italic line of what they said, one line "harness retrieved: …" or "nothing retrieved", one line "agent: paid 30 ducats", a stamp ✔ REMEMBERED · 25 YEARS or ✘ FORGOT or ✘ CONFABULATED. Press space to continue. Nothing else on the card.
5. **Numbers only where they matter:** money and health on the hero card; the score only on the end card and the leaderboard.
6. Type: one display face for the year and names (Fraunces), one sans for everything else (Archivo), mono only for the timeline years. Minimum 14 px; projector minimum 18 px for anything that must be read.
7. Palette: dark glass panels (`#0B0D10` at 82%) over the diorama; gold `#D9A441` for the hero and plants; green `#3FB27F` ✔; red `#C8413B` ✘; blue `#5B8DEF` for harness memory. No other colors in the UI.

## Moments (the product)
Plant: the hero meets someone → a small hollow ◇ card slides into the memory strip ("1346 · Tomas the cooper · lent 30 ducats"), a pin drops on the timeline. Payoff: auto-pause, camera eases to the door, the visitor walks up, the moment card appears; after the stamp, the pin fills green or red. Negative: same, stamp reads ✔ REJECTED or ✘ CONFABULATED. End: sepia freeze, life card (years, wealth, goals, memory x/y, false claims rejected x/y, cost), `vitabench` command line.

## Replay and live
The viewer opens `runs/demo` by default (`?run=<id>` for others; `?ws=<url>` for live). Live frames and replayed frames go through the same `applyFrame`. Speed 1× = one season per 2 s, 4×, 12×, and `→` jumps to the next pin. A scrubber on the timeline seeks.

## Screenshot checklist (Playwright, `scripts/screenshot.mjs`)
1. `t=0` overview: island, landmarks, ≥ 40 people, water, HUD at rest.
2. `t=34` (1348 plague): fog, fewer people, red pulse, banner.
3. `t=126` moment card open (payoff).
4. `t=172` end card.
Each must pass J1 (a stranger can say what is happening) and J2 (looks crafted). The orchestrator views every screenshot; a reviewer grades them.
