# ONEKI Brand Book: build source

This is the source of the 24-spread brand book PDF. It was recovered from the original build session's logs, and its checksums match v4: `p1.html` 09fac4eb…, `p5.html` 7119eaf…

## Versions
- **v4.1** (2026-10-12): spread 20, tile 04, uses the gold stick (`raw/w32.png` = hf_20261012_061931_cf3d620c…).
- **v4.2** (2026-10-13): seven spot illustrations added to spreads 06-07 (Origins), in the brand book's line style. They are generated with Higgsfield, using i02/i03/i05 as style references, and stored as `b/img/n_*.jpg` with near-white levelled to pure white.
  - Spread 06: kitchen and gas flame above the second and third Q&A columns, which moved from top 600px to 700px.
  - Spread 07: two faces beside the watch, five people and can-vs-stick under the second and third columns, ingredients and bedtime under "Our product".

## Rebuild
1. Download every entry in `images.txt` (`key:filename`) from the CDN into `raw/<key>.png`. The CDN is `https://d8j0ntlcm91z4.cloudfront.net/user_3EF7RM3YH2M24lHzmiXGHKRiX4A/`. Level the `n_*` files to white and save them as `b/img/n_*.jpg`.
2. Install the fonts (`@fontsource/*`, `pretendard`) and `playwright-core` into `fx/`, then copy the fonts into `b/fonts`.
3. Run `python3 proc.py && python3 newimg.py`. This writes `b/img/`.
4. Run `cat b/parts/p0.html b/p1.html b/p5.html > b/index.html`.
5. Run `OUT=ONEKI_BrandBook.pdf node render2.js`. It uses Chromium at `/opt/pw-browsers/chromium` and rasterizes the `.rast` gradient type before printing.
