"""Android launcher icons from the app's own artwork (run after `npx cap add android`).
Legacy square/round icons come from the iOS 1024 icon; the adaptive icon's foreground is the
maskable icon (its subject sits inside the safe zone, its sky fills the bleed)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
res = root / 'android/app/src/main/res'
full = Image.open(root / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png').convert('RGBA')
mask = Image.open(root / 'assets/icon-maskable-512.png').convert('RGBA')
for name, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    d = res / f'mipmap-{name}'
    sq = full.resize((px, px), Image.LANCZOS)
    sq.save(d / 'ic_launcher.png')
    m = Image.new('L', (px * 4, px * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, px * 4 - 1, px * 4 - 1), fill=255)
    rnd = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    rnd.paste(sq, (0, 0), m.resize((px, px), Image.LANCZOS))
    rnd.save(d / 'ic_launcher_round.png')
    fg = round(px * 108 / 48)
    mask.resize((fg, fg), Image.LANCZOS).save(d / 'ic_launcher_foreground.png')
(res / 'values/ic_launcher_background.xml').write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#58B7F5</color>\n</resources>\n')
print('android icons written')

# splash screens: the sky colour with the icon in the middle (replaces Capacitor's placeholder)
for f in res.glob('drawable*/splash.png'):
    w, h = Image.open(f).size
    s = Image.new('RGBA', (w, h), (0x58, 0xB7, 0xF5, 255))
    k = int(min(w, h) * 0.42)
    s.paste(mask.resize((k, k), Image.LANCZOS), ((w - k) // 2, (h - k) // 2))
    s.convert('RGB').save(f)
print('android splash screens written')
