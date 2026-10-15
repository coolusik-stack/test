# ONEKI Brand Book: build source

This is the source of the 24-spread brand book PDF. It was recovered from the original build session's logs, and its checksums match v4: `p1.html` 09fac4eb…, `p5.html` 7119eaf…

## Versions
- **v4.1** (2026-10-12): spread 20, tile 04, uses the gold stick (`raw/w32.png` = hf_20261012_061931_cf3d620c…).
- **v4.2** (2026-10-13): seven spot illustrations added to spreads 06-07 (Origins), in the brand book's line style. They are generated with Higgsfield, using i02/i03/i05 as style references, and stored as `b/img/n_*.jpg` with near-white levelled to pure white.
  - Spread 06: kitchen and gas flame above the second and third Q&A columns, which moved from top 600px to 700px.
  - Spread 07: two faces beside the watch, five people and can-vs-stick under the second and third columns, ingredients and bedtime under "Our product".
- **v4.3** (2026-10-14): spread 13 (Our Muses) gets a four-step day for Haru (07:00 → 15:00) and a four-step night for Dal (19:30 → 02:00), drawn as small spot illustrations in the same line style. They are the `m_*` entries in `images.txt`, processed by `muse.py`: day spots are levelled to white JPEG; night spots are keyed against white into PNG with the black ink recoloured cream, so they sit on the dark page.
- **v4.4** (2026-10-14): risk fixes, with no new images.
  - The red kettlebell on the posters spread is recoloured cobalt by `retouch.py`, which reads `raw/i35.png`.
  - Copy that read as a calming or energy-restoring effect claim for a 일반식품 is rewritten as ritual and mood (spreads 07 and 11, and the red-vs-blue table). "최초의 블루 에너지" becomes "블루 에너지라는 이름의 첫 줄에 서려 한다".
  - The competitor map on spread 11 is marked internal-only.
  - The chapters now follow the site: 轉 = Snap (What We Build: spreads 15-18), 結 = Breathe out (The Moment: spreads 19-22).

- **v4.5** (2026-10-14): spread 03 (Why We Made This) replaces the gold glitter plate (i01) with a dry-brushed champagne-gold ink ensō on dark handmade paper (`w01`, written to `b/img/w01.jpg` by `retouch.py`). It is a photograph of a brushstroke, not the logo, so the logo itself is unchanged.

- **v4.6** (2026-10-15): still 24 spreads, restructured.
  - The vision statement now runs as wall lettering above the BHAG posters (spread 18), replacing its own spread.
  - The closing line now sits on the back cover under "Refill, never borrow." (spread 24), replacing its own spread.
  - The two freed spreads are new:
    - **16 The Stick:** a hero plate (`s_hero`, gold outside, cobalt notch line and inner foil), the 꺾고·짜고·들어간다 ritual (`m_tok`, `s_squeeze`, `s_enter`), the pack principles with the 10-pack (`s_box`), and a note that the pack is fixed only after the trademark review.
    - **23 Identity:** the mark (clear space, minimum size, grounds, don'ts), colour with recommended ratio and no red, type, and imagery rules.
  - The new images are listed in `images.txt` and processed by `muse.py`.

- **v4.7** (2026-10-15): spreads 06-07 go from 17 founder Q&As to 10.
  - Seven are dropped because they now repeat spread 11 (why blue, red vs blue) or spread 16 (inside, can vs stick, how to take it, the biggest type on the pack), or because they leaned toward an effect claim ("그래서 무엇을 원했나?").
  - The origin answer loses its heart-rate line.
  - Spread 07's right page is retitled "Two rules" (taste, when not to take it).
  - The website keeps the full interview.

- **v4.8** (2026-10-15): spread 03 now states the core insight. The headline is "에너지를 미래에서 빌려 쓰지 않는다." It is followed by the loan metaphor ("오늘 밤, 이자까지 붙어 돌아온다"), "이미 내 안에 있는 기(氣)를 깨운다. 톡." and "먼저 차분하게. 그다음, 끝까지." It is written as metaphor and attitude, with no claim about what the product does to the body. The site's hero subtitle, meta description and opening scene carry the same line.

- **v5.0 Final** (2026-10-15): the last copy pass.
  - The mission now reads "bold, fearless" instead of "focused", which could read as a concentration claim.
  - The opening scene's "빨라진 심장" becomes "들뜬 손끝", on the site as well.
  - The colophon marks the edition as final and as partner-only until the trademark review.
  - A light edition (`ONEKI_BrandBook_v5.0_light.pdf`, about 11 MB) is rendered from `b_light/`, which holds 1500px copies of the images, with `IN=../b_light/index.html`.

## Rebuild
1. Download every entry in `images.txt` (`key:filename`) from the CDN into `raw/<key>.png`. The CDN is `https://d8j0ntlcm91z4.cloudfront.net/user_3EF7RM3YH2M24lHzmiXGHKRiX4A/`. Level the `n_*` files to white and save them as `b/img/n_*.jpg`.
2. Install the fonts (`@fontsource/*`, `pretendard`) and `playwright-core` into `fx/`, then copy the fonts into `b/fonts`.
3. Run `python3 proc.py && python3 newimg.py && python3 muse.py && python3 retouch.py`. This writes `b/img/`.
4. Run `cat b/parts/p0.html b/p1.html b/p5.html > b/index.html`.
5. Run `OUT=ONEKI_BrandBook.pdf node render2.js`. It uses Chromium at `/opt/pw-browsers/chromium` and rasterizes the `.rast` gradient type before printing.
