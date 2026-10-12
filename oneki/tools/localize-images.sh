#!/usr/bin/env bash
# Downloads every brand image the page hotlinks from the Higgsfield CDN into oneki/img/,
# downsizes them to 2400px JPEG (ImageMagick, if installed), and rewrites the references.
# Run from anywhere on a machine that can reach the CDN:  bash oneki/tools/localize-images.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE='https://d8j0ntlcm91z4.cloudfront.net/user_3EF7RM3YH2M24lHzmiXGHKRiX4A/'
mkdir -p "$ROOT/img"
fail=0
names=$( { grep -ho 'hf_[0-9_]*[0-9a-f-]*\.png' "$ROOT/index.html" "$ROOT/css/oneki.css";
           grep -o "'0[0-9_]*[0-9a-f-]*'" "$ROOT/js/oneki.js" | tr -d "'" | sed 's/^/hf_20260928_/; s/$/.png/'; } | sort -u )
for n in $names; do
  out="$ROOT/img/${n%.png}.jpg"
  [ -s "$out" ] && continue
  curl -sfL -o "$ROOT/img/$n" "$BASE$n" || { echo "failed: $n" >&2; fail=1; continue; }
  if command -v magick >/dev/null; then magick "$ROOT/img/$n" -resize '2400x2400>' -quality 84 -strip "$out" && rm "$ROOT/img/$n"
  elif command -v convert >/dev/null; then convert "$ROOT/img/$n" -resize '2400x2400>' -quality 84 -strip "$out" && rm "$ROOT/img/$n"
  else mv "$ROOT/img/$n" "${out%.jpg}.png"; fi
  echo "ok: $n"
done
if [ "$fail" = 1 ]; then echo "some downloads failed; references left unchanged. Re-run to retry." >&2; exit 1; fi
ext=jpg; command -v magick >/dev/null || command -v convert >/dev/null || ext=png
sed -i.bak -e "s#${BASE}\(hf_[^'\")]*\)\.png#img/\1.${ext}#g" "$ROOT/index.html"
sed -i.bak -e "s#${BASE}\(hf_[^'\")]*\)\.png#../img/\1.${ext}#g" "$ROOT/css/oneki.css"
sed -i.bak -e "s#var CDN = '${BASE}'#var CDN = 'img/'#" -e "s#\.png\" alt=\"\" loading#.${ext}\" alt=\"\" loading#" "$ROOT/js/oneki.js"
sed -i.bak -e '/preconnect" href="https:\/\/d8j0ntlcm91z4/d' "$ROOT/index.html"
rm -f "$ROOT"/index.html.bak "$ROOT"/css/oneki.css.bak "$ROOT"/js/oneki.js.bak
echo "done: references now point at oneki/img/"
