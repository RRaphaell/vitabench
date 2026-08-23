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
EXTRA="claude_sonnet_s10 claude_sonnet_s0 claude_caterina_s1 claude_opus_s0"
INDEX='[{"name":"demo","label":"Claude Code · Sonnet · Marco · seed 2 (demo)"}'
for name in $EXTRA; do
  [ -f "$ROOT/runs/$name/frames.json" ] || continue
  mkdir -p "$SITE/runs/$name"; cp "$ROOT/runs/$name/frames.json" "$SITE/runs/$name/frames.json"
  INDEX="$INDEX,{\"name\":\"$name\",\"label\":\"$name\"}"
done
echo "$INDEX]" > "$SITE/runs/index.json"
if [ -f "$ROOT/web/landing/index.html" ]; then cp -R "$ROOT/web/landing/." "$SITE/"; else printf '<meta http-equiv="refresh" content="0; url=/app/?run=demo">' > "$SITE/index.html"; fi
rm -rf "$SITE/screens" "$SITE/shot.mjs"
find "$SITE" -name ".DS_Store" -delete
echo "site: $(find "$SITE" -type f | wc -l | tr -d ' ') files, $(du -sh "$SITE" | cut -f1)"
