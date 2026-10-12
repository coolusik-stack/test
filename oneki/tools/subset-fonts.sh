#!/usr/bin/env bash
# Re-subsets the Korean fonts to the glyphs used in index.html + js/oneki.js.
# Needs: npm, python3 with fonttools + brotli (pip install fonttools brotli).
# Run after changing Korean copy:  bash oneki/tools/subset-fonts.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && npm init -y >/dev/null && npm i --silent --no-audit --no-fund @fontsource/noto-serif-kr@5.1.0 pretendard@1.3.9)
python3 - "$ROOT" "$TMP" <<'PY'
import re, sys, subprocess, shutil, os
root, tmp = sys.argv[1], sys.argv[2]
nm = tmp + '/node_modules'
txt = open(root + '/index.html').read() + open(root + '/js/oneki.js').read()
chars = set(txt) | {chr(c) for c in range(0x20, 0x7f)} | set('‘’“”·…×≈°©')
open(tmp + '/chars.txt', 'w').write(''.join(sorted(chars)))
sub = lambda src, dst: subprocess.run(['pyftsubset', src, '--text-file=' + tmp + '/chars.txt', '--flavor=woff2', '--layout-features=*', '--output-file=' + dst], check=True)
sub(nm + '/pretendard/dist/web/variable/woff2/PretendardVariable.woff2', root + '/fonts/pretendard-subset.woff2')
shutil.rmtree(root + '/fonts/nsk', ignore_errors=True); os.makedirs(root + '/fonts/nsk')
cps = [ord(c) for c in chars]; css = []
for w in (400, 600):
    for blk in re.findall(r'@font-face\s*{(.*?)}', open(f'{nm}/@fontsource/noto-serif-kr/{w}.css').read(), re.S):
        url = re.search(r'url\(\./files/([^)]+?\.woff2)\)', blk).group(1)
        ur = re.search(r'unicode-range:\s*([^;]+);', blk).group(1).strip()
        rs = [tuple(int(x, 16) for x in (r.strip()[2:].split('-') * 2)[:2]) for r in ur.split(',')]
        if any(a <= c <= b for c in cps for a, b in rs):
            sub(f'{nm}/@fontsource/noto-serif-kr/files/{url}', f'{root}/fonts/nsk/{url}')
            css.append(f"@font-face{{font-family:'Noto Serif KR';font-style:normal;font-display:swap;font-weight:{w};src:url(nsk/{url}) format('woff2');unicode-range:{ur}}}")
f = root + '/fonts/fonts.css'
head = open(f).read().split("@font-face{font-family:'Noto Serif KR'")[0]
open(f, 'w').write(head + '\n'.join(css) + '\n')
print('noto serif kr files:', len(css))
PY
