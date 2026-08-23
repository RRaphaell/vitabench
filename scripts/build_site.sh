#!/usr/bin/env bash
# Assembles the static site: landing at /, viewer at /app/, kits at /assets/, demo data at /runs/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SITE="$ROOT/site"
rm -rf "$SITE"; mkdir -p "$SITE/app" "$SITE/runs/demo" "$SITE/media"
(cd "$ROOT/web" && VITE_BASE=/app/ npm run build >/dev/null)
cp -R "$ROOT/web/dist/." "$SITE/app/"
rm -rf "$SITE/app/assets"
for kit in town castle pirate chars; do
  mkdir -p "$SITE/assets/$kit/Models"
  cp -R "$ROOT/web/public/assets/$kit/Models/GLB format" "$SITE/assets/$kit/Models/"
  cp "$ROOT/web/public/assets/$kit/License.txt" "$SITE/assets/$kit/" 2>/dev/null || true
done
cp "$ROOT/web/public/assets/waternormals.jpg" "$SITE/assets/"
cp "$ROOT/runs/demo/frames.json" "$SITE/runs/demo/frames.json"
cp "$ROOT/runs/leaderboard.json" "$SITE/runs/leaderboard.json"
echo '[{"name":"demo","label":"Claude Code · Sonnet · seed 2 (demo)"}]' > "$SITE/runs/index.json"
if [ -f "$ROOT/web/landing/index.html" ]; then cp -R "$ROOT/web/landing/." "$SITE/"; else printf '<meta http-equiv="refresh" content="0; url=/app/?run=demo">' > "$SITE/index.html"; fi
rm -rf "$SITE/screens"
find "$SITE" -name ".DS_Store" -delete
echo "site: $(find "$SITE" -type f | wc -l | tr -d ' ') files, $(du -sh "$SITE" | cut -f1)"
