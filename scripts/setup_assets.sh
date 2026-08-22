#!/usr/bin/env bash
# Downloads the CC0 Kenney kits used by the viewer into web/public/assets/ (licenses in docs/ASSETS.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/web/public/assets"
mkdir -p "$OUT"
fetch() { local name="$1" url="$2"; if [ -d "$OUT/$name" ]; then echo "$name: present"; return; fi
  local zip="$OUT/$name.zip"; curl -sL -o "$zip" "$url"; mkdir -p "$OUT/$name"; unzip -q -o "$zip" -d "$OUT/$name"; rm "$zip"; echo "$name: ok"; }
fetch town      "https://kenney.nl/media/pages/assets/fantasy-town-kit/efe948d309-1754222374/kenney_fantasy-town-kit_2.0.zip"
fetch chars     "https://kenney.nl/media/pages/assets/mini-characters/bfc7e272b4-1774770718/kenney_mini-characters.zip"
fetch pirate    "https://kenney.nl/media/pages/assets/pirate-kit/e6d4bb1525-1771333093/kenney_pirate-kit.zip"
fetch castle    "https://kenney.nl/media/pages/assets/castle-kit/a395102d20-1711543616/kenney_castle-kit.zip"
curl -sL -o "$OUT/waternormals.jpg" "https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/textures/waternormals.jpg"
echo "assets ready in $OUT"
