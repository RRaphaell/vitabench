# VitaBench — instructions for agents working in this repo

You are one of several agents building VitaBench in parallel today. Read, in order: `docs/00_PROJECT.md`, `docs/01_REQUIREMENTS.md`, `docs/02_ARCHITECTURE.md`, `docs/03_SPEC.md`, `docs/05_STANDARDS.md`, then your workstream's section in `docs/04_WORKFLOW.md` and `docs/06_PROGRESS.md`. Viewer agents also read `docs/08_VIEWER_DESIGN.md`.

Hard rules:
- Build only inside the paths your workstream owns. Request other changes in your progress section.
- Never `git commit` or `git push`. The orchestrator commits.
- `engine/vitabench/schema.py` and `web/src/state/schema.ts` are frozen interfaces; propose changes, don't make them.
- Run your verification commands before reporting; paste the tail of the output into `docs/06_PROGRESS.md`.
- No narrating comments, no boilerplate, no TODOs, no placeholder data outside `runs/demo/` and `web/src/dev/fixtures/`.
- Keys come from env (`ANTHROPIC_API_KEY`, `SAIL_API_KEY`); never write them to disk.

Commands:
- Engine: `cd engine && uv sync && uv run pytest -q && uv run ruff check .`
- Viewer: `cd web && npm install && npm run build && npm run dev`
- Assets: `scripts/setup_assets.sh` (downloads Kenney kits into `web/public/assets/`)
- Screenshots: `node scripts/screenshot.mjs <run_dir>`
