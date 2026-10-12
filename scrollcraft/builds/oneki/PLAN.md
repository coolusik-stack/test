# ONEKI: plan (grammar, gate, score, layers, assets)

## Grammar: Breath cycle (new, defined from the brand book's own intertitles)

The brand book already structures itself as breathing: Pause / Breathe in / Breathe out / Snap, mapped to 起承轉結. The page takes that as its grammar.

| | Rule |
|---|---|
| **Unit** | A breath: one intertitle word set at poster scale, then the one scene it opens. Four breaths. |
| **Sequence law** | Holds (pinned) and releases (natural flow) alternate. Two holds are never adjacent. The only long hold on the page is the peak. |
| **Grounds** | Each breath cuts to its own ground on a hard edge, the way a printed spread does. No drift interpolation. |
| **Nav** | No top bar. A **flame gauge** sits in the right margin: a vertical 1,000→1,900°C scale, the four breaths (起 承 轉 結) as clickable ticks, and the live readout. The gauge is the navigation and it carries the signature move. |
| **Hero** | The brand book cover as a dimensional plate (layer contract below). |
| **Close** | The exhale. The gauge comes to rest blue, "Refill, never borrow." holds on the last screen, and a colophon follows in the page's smallest type. No button island. |
| **Bans** | Top nav bar; `pan` rails; `spotlight`; `magnet`; character-level `kinetic`; `drift`; more than one `scrub` (the peak only); counters other than the flame temperatures (1,000°C / 1,900°C are physical figures the brand book already uses). |

**Why not the eight defined grammars:**
- **Filmic one-shot:** it hides seams, but the brand book is made of intertitles and hard cuts.
- **Chaptered editorial:** closest. But it bans media under type and requires a media-free title page. The brand book's own spreads put type over full-bleed photography, and the hero-depth baseline wants planes.
- **Live surface:** there is no software product.
- **Continuous world:** the subject is not travel through a place.
- **Typographic poster:** there are forty brand images and a product. Type alone would waste the stick.
- **Gallery / catalog:** one product, not a range.
- **Split stage:** Red vs Blue is one act, not the whole page.
- **Rhythmic cutlist:** "Keep calm" is the opposite of a pulse.

## Fingerprint gate

The registry was empty, so this is the first build and there are no rows to clear.

This build claims:
- the Breath cycle grammar
- the margin flame-gauge nav
- the layered cover-plate hero (stick and hand at the moment before contact)
- the 9-act / ~14vh hold-release shape
- the exhale colophon close
- the velocity-to-temperature signature

## Signature move: calm burns hotter

Scroll velocity drives one page-wide temperature `--heat` (0 = calm, 1 = agitated). It is derived per frame from the scroll delta and eased back toward 0 when the hand slows.

- **The gauge readout** maps `--heat` to temperature: 1,900°C when calm, falling toward 1,000°C when fast. The flame glyph in the gauge shifts from cobalt to amber. Never red: the hottest hue allowed is gold-amber #C98A3A.
- **Page grain** opacity rises with heat.
- **The Burn Blue flame image** shifts hue toward amber with heat.

So the visitor *feels* "calm burns hotter": slowing down makes the page hotter and bluer.

- **At the peak** the snap locks the gauge at 1,900°C and regrades the page to cobalt. The heat input is ignored from then until the close.
- **Reduced motion:** the gauge renders static at 1,900°C with its ticks. Nothing reacts.
- **Touch:** it works the same, because it reads scroll, not the pointer.

## Feeling curve to score

| # | Act | Feeling | Device (why) | Span (vh) | Ground |
|---|---|---|---|---|---|
| 0 | Cover | Hush, curiosity | `parallax` layered sticky planes: the hand closes on the notch but never touches. Depth is the first impression. | 1.4 | off-black #0C0C0D |
| 1 | Pause. / The Scene | Unease | `pin` + line-drawn callouts. The frame holds while the signals accumulate, which is an argument, not an image. | 1.8 | photo |
| 2 | Origins & the name | Intimacy | `flow` + `in`: a person talking reads as prose, not as a show. | 1.4 | paper #FCFCFB |
| 3 | Breathe in. / We Burn Blue | Conviction | `reveal` (the amber flame is wiped to blue) + `count` °C + the map draws. The wipe is the change of state. | 1.4 | paper / black split |
| 4 | Silence | Held breath | Ground only, one line: authored silence before the peak. | 0.8 | near-black |
| 5 | **Snap. (PEAK)** | **Release** | `pin` + `scrub` (the stick bends and snaps under the hand) + page regrade. It gets the only clip and the biggest span. | **3.0** | black, then cobalt |
| 6 | Breathe out. / Rituals + Manifesto | Belonging | `flow` + `in` at walking stagger. The release after the peak. | 1.8 | cobalt #2743B0 |
| 7 | Vision + BHAG | Resolve | `reveal` up, per poster: each goal is uncovered. | 1.4 | dark #231F20 |
| 8 | Exhale (close) | Calm, carried | Natural end. The final line holds and the colophon sits under it. | 1.0 | off-black |

**Total ≈ 14.0vh over 9 acts.**

**Families used:** parallax, pin, flow, reveal, count, scrub. That is six. No family repeats in adjacent acts. Holds are acts 1 and 5, and they are not adjacent.

**Cut from the current page** (still in the brand book; the page keeps one argument):
- Dedication
- Why We Made This
- Muses
- Refill collage (its principle line moves to the close)
- Purpose/Mission (the purpose line feeds the vision act)
- Go Crazy
- Declare
- How We Create
- The separate pinned chapter dividers. Their words now open the acts.

## Hero layer contract

| Plane | Asset and depth | Independent movement | Contact / occlusion rule |
|---|---|---|---|
| Far | CSS brand dot grid on off-black | Smallest (rate -0.3) | None |
| Rear atmosphere | Cobalt haze, generated alpha plate | Slow drift (-0.6), opacity breathes | Never washes out the stick |
| Focal subject | Gold stick, generated and then `remove_background`, genuine alpha | Rotates ~4° toward the hand and rises slightly (-0.9) | Floats free: it is held in air, so it has no ground contact |
| Near foreground | Hand, fingertips toward the notch, generated and then `remove_background` | Strongest (+1.2): it travels toward the notch | Fingertips **never** touch the notch in the hero; the gap is the story. The gap closes to about 6px at hero exit. |
| Front atmosphere | Faint mist alpha plate + grain | Opposite drift | Stays below the headline |
| Type | "Keep Calm." behind the stick, "Go Crazy." in front of it; subline "에너지를 당겨쓰지 않는다. 채워서 쓴다." | Copy at 1× | The full headline stays readable at every position |

**Opening, midpoint, exit:**
- **Opening:** the gap between finger and notch is wide.
- **Midpoint:** the hand closes in and "Keep Calm." recedes behind the stick.
- **Exit:** the gap is a hair's width, and the page cuts to Pause.

The snap itself is withheld until act 5.

**Mobile:** a separate portrait crop. The stick runs vertical, the hand enters from below, and the type sits above the planes.

## Assets to generate (Higgsfield)

Every still uses one shared style preamble, word for word.

| # | Asset | Model | Notes |
|---|---|---|---|
| A1 | Gold stick, isolated, 3/4 view, on flat dark ground | nano_banana_2_1, 2k | Reference: the v4.1 gold stick cf3d620c, for material match. Then `remove_background`. |
| A2 | Hand reaching, fingertips forward, on flat dark ground, same light direction | nano_banana_2_1, 2k | Then `remove_background`. |
| A3 | Cobalt haze / mist plate | nano_banana_2_1, 2k | Screen-blended, so no alpha is needed. |
| A4 | Amber flame matching the blue flame (i37) composition | nano_banana_2_1, 2k | Reference: i37. Needed for the Burn Blue wipe. |
| A5 | Peak start frame: two hands holding the gold stick at the notch, about to bend | Reuse cf3d620c | Already approved by the user in v4.1. |
| C1 | Peak clip: the stick bends at the notch and snaps cleanly; a soft blue light opens from the break | 5s, start_image = A5, image-to-video | The only clip. `encode.sh` desktop + mobile. |

Every result is downloaded and **looked at** before use. That requires network access to the CDN. If access is unavailable, the user approves each result link instead, and the report states the limit.
