# ONEKI brand site (`oneki/`)

A one-page brand intro that follows **ONEKI Brand Book v4.1** (24 spreads, 起承轉結). It is static HTML/CSS/JS with no build step. It lives apart from the repo's other site, so nothing here should touch files outside `oneki/`.

## Files
- **Rebuild:** built with the scroll-craft skill. The brief, plan and feel check are in `../scrollcraft/builds/oneki/` (BRIEF.md, PLAN.md). The structure is the **Breath cycle**: nine acts, about 14 viewport-heights, holds and releases alternating, and a single peak (the snap).
- **`index.html`:** all copy and the act markup, using `data-sc-*` attributes that the engine reads.
- **`engine/`:** the scroll-craft engine (MIT). **Never edit it.** Bespoke behaviour goes in `js/oneki.js`.
- **`css/oneki.css`:** brand tokens, the hero layer positions (a 16:10 scene box on desktop and a separate portrait composition on phones), and per-act layout.
- **`js/oneki.js`:** builds the scene callouts, the 12 rituals and the 4 BHAG posters before the engine mounts. It also runs the signature move:
  - Scroll velocity becomes `--heat`, which drives the gauge, its °C readout, the grain and the flame.
  - The peak switches the page into `.is-snapped` (cobalt, gauge locked at 1,900°C).
- **`img/`:** self-hosted, optimized assets.
  - Generated with Higgsfield: `stick.webp` and `hand.webp` (alpha cutouts), `haze.webp`, `flame-amber.jpg`, and `snap/d|m/*.webp` (a 62-frame sequence from the snap clip; `m` is the portrait crop).
  - Origins illustrations: `ill-tower`, `ill-cups`, `ill-watch` and `ill-tok` come from brand book spreads 06-07. `ill-kitchen`, `ill-flame`, `ill-faces`, `ill-people`, `ill-pocket`, `ill-ingredients` and `ill-moon` are new, generated in the same line style with the brand-book illustrations as references. They sit on the paper ground with `mix-blend-mode: multiply`, so their containers need `background: var(--paper)`.
  - From the brand book: everything else.
- **`fonts/`:** self-hosted. Korean fonts are subset to the page's glyphs, so **run `tools/subset-fonts.sh` after changing Korean copy**.
- **Verification:** the scroll-craft harness (`shoot.mjs`), run at desktop, 390px and reduced-motion.

## Brand rules (do not break)
- **Name:** ONEKI = One Ki (一氣), read as 원기(元氣). KI also reads as Key. The logo is the gold ensō (일원상). Never redesign it.
- **Positioning:** Blue Energy ("The hottest flame is blue." / "가장 뜨거운 불꽃은 파랗다.").
- **Moment:** The Moment Before (직전의 순간). Slogan: Keep Calm. Go Crazy. / 차분하게, 미쳐라.
- **Colors:**
  - Cobalt `#2743B0`, gold `#B39A5C`, ink `#1C1B1D`, dark `#231F20`, black `#0C0C0D`.
  - Secondary: blue2 `#6F8BFF`, pink `#F4ACA4`.
  - **Red is forbidden.**
- **Fonts:**
  - Hanken Grotesk 800 for display.
  - Newsreader for serif.
  - Pretendard for Korean sans.
  - Noto Serif KR for Korean body.
  - Londrina Solid 900 for hand caps.
- **Packaging colour (decided 2026-10-13):** the stick stays muted champagne metallic gold: near-matte, ensō only, no lettering, never yellow gold, so it doesn't read as a 홍삼 or 한약 stick. Blue is the *release*, not the vessel. Cobalt goes on:
  - a thin line at the notch
  - the inside face of the foil, seen when torn open
  - the 10-pack box (cobalt outside, gold sticks inside)
  - the caffeine figure, the largest type on the pack

  Any blue-vs-gold question should be settled by testing thumbnail response in the organic hook tests, not by taste.
- **Ritual:** "톡" / "기 트자". The stick is what snaps, and the 기 is what opens. **Never write "기를 꺾다".** Timing: "들어가기 30분 전, 톡".
- **Banned wording (general food, 일반식품):**
  - 폭발시킨다, 고카페인 (as a claim), 풀파워, 공부/성적
  - 긴장 완화, 불안 해소, 피로회복, 숙취해소, 집중력 향상
  - Any efficacy claim.
  - Body-state wording that reads as an effect: 가라앉힌다, (빠진 기를) 채운다, 심장/머리가 어떻게 된다. Say it as a ritual or a mood instead ("숨 한 번, 그리고 톡", "조용히 불을 켠다").
  - Unverifiable superlatives such as 최초, 유일, 1위.
  - Competitor brand names on anything public. Use category labels instead (에너지 캔, 에너지 샷).
  - The names 청심환/청심원/맥문동탕/생맥산. 靑心 may be used only as a worldview metaphor.
- **Trademark:** the ONEKI mark has not been cleared by a 변리사.
  - Keep `noindex` on the page.
  - Don't add it to the repo's `sitemap.xml`.
  - Don't fix a domain or channel IDs until the trademark is cleared.
- **Visuals:** people and scenes are illustrations, not real guests, and the footer note says so. 한방 appears only as an accent.
