# Engineering standards

## Principles
- One source of truth per fact: schemas in `schema.py`/`schema.ts`, scenario data in YAML, numbers in traces.
- Small modules (≤ 300 lines), pure functions where possible, side effects at the edges (I/O, network, rendering).
- Names say what a thing is; no comments that narrate code. A comment is allowed only for a non-obvious *why* (a constraint, a trade-off, a bug being avoided).
- No boilerplate, no speculative abstractions, no dead code, no TODOs in committed code — write the requirement into `docs/06_PROGRESS.md` instead.
- Errors are explicit: validate at boundaries (plan from agent, YAML from disk, frames from WS) and fail loudly in dev.

## Python (engine)
- Python 3.12, `uv` for everything (`uv run`, `uv add`). `pyproject.toml` with `[project.scripts] vitabench = "vitabench.cli:main"`.
- pydantic v2 models; `model_config = ConfigDict(extra="ignore")` for agent input, `extra="forbid"` for scenario files.
- `ruff` (line length 110) clean; full type hints; `from __future__ import annotations`.
- Randomness only through `numpy.random.Generator` streams passed in; never `random.random()`.
- Tests with `pytest`; fast (< 10 s total); test behavior, not implementation. Determinism test is mandatory.
- Logging via `logging`; no prints except the CLI.
- Network clients (Anthropic SDK, Sail) isolated in `adapters/` and `dialogue.py`; everything else runs offline.

## TypeScript (viewer)
- Vite + TypeScript strict; Three.js 0.185 via `import { ... } from 'three'` and addons via `three/addons/...`. No React, no UI framework, no state library.
- One mutable `store` of typed frames; rendering reads the store; UI renders from the store at ≤ 10 Hz; Three renders every frame.
- Modules: `world/` (static scene), `actors/` (moving things), `ui/` (DOM), `state/` (data). `main.ts` composes only.
- Assets loaded through `assets.ts` with a single `LoadingManager`; primitives render before GLBs arrive.
- Instancing for anything with > 20 copies (crowd, props). Target 60 fps at 1920×1080 with `setPixelRatio(min(dpr, 1.5))`.
- Colors and sizes in `world/constants.ts` and `ui/styles.css` variables only.

## Git
- Conventional commit messages; small commits; push after each. Branch `main` only tonight.
- `runs/` gitignored except `runs/demo/`. `web/public/assets/` gitignored (downloaded by `scripts/setup_assets.sh`); licenses kept in `docs/ASSETS.md`.
- No secrets. Keys come from env: `ANTHROPIC_API_KEY`, `SAIL_API_KEY`.

## Definition of "done" for a task
Code + test (or screenshot) + progress note + the reproduce command. Nothing else counts.
