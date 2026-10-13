# ONEKI brand site: BRIEF

**How this brief was made:** an interview on 2026-10-12. Claude proposed an answer to each of the eight questions, drawing on ONEKI Brand Book v4.1. The user accepted all of them verbatim: "추천대로 진행해줘". The answers below are those accepted proposals.

**The page:** lives at `oneki/` in this repo and is previewed at https://claude-nifty-pasteur-jzu605.test-9bx.pages.dev/oneki/. This folder holds the planning artifacts.

**Brand rules:** `oneki/CLAUDE.md` is binding.
- Cobalt #2743B0 and gold #B39A5C. Red is forbidden.
- No efficacy claims, because this is a 일반식품.
- Never write "기를 꺾다".
- noindex until the trademark is cleared.

## The eight answers

1. **Vibe:** 고요함 / 직전의 긴장 / 푸른 불꽃 / 절제.
   - References: the Lululemon brand book (its order and tone), Apple's "107 seconds" film, and the silence of a stadium tunnel just before walking out.
2. **Journey:** keep the brand book's 起承轉結, but compress the 24 spreads into 6-7 scenes:
   1. The scene of borrowed energy
   2. The name and its origin
   3. Blue energy
   4. 톡
   5. Rituals
   6. Vision
   7. "Refill, never borrow."
3. **Energy:** calm at the start, then tension (borrowed energy), then a very short silence, then the burst (톡), then a calm finish.
4. **Feeling and the one moment:** "스크롤을 멈추자 화면이 조용해지더니, 톡 소리와 함께 페이지 전체가 푸르게 타올랐다."
5. **The one thing no other site does:** scroll speed sets the flame's temperature.
   - Scroll fast: the flame turns amber and flickers, and the screen roughens. Never red.
   - Scroll slowly: the flame settles blue, and the readout climbs to 1,900°C.
   - The visitor feels "calm burns hotter" with their own hand.
6. **Range:** between editorial (the brand book's texture) and premium-minimal.
7. **One world or scenes:** distinct scenes. Keep the brand book's chapter-and-intertitle grammar. No unbroken camera flight.
8. **Assets:**
   - Existing: about 40 images from Brand Book v4.1, the gold stick cut, and the ensō logo.
   - New, via Higgsfield: depth layers for the hero (background / stick / hand / mist) and 1-2 short clips for the 톡 moment.
   - The cost estimate is reported to the user before any paid call. The balance at the interview was 1,665.02 credits.

## Feeling curve (written before the acts)

| # | Feeling | What on screen causes it |
|---|---|---|
| 0 | Hush, curiosity | Cover plate: the gold stick hangs in dark air, a hand just short of the notch. "Keep Calm. Go Crazy." sits between the planes. |
| 1 | Unease | 起 Pause. The tired man and the six signals ("Cup no. 3", "The crash") draw themselves in while the frame holds. |
| 2 | Intimacy | The founder speaks: the kitchen, twenty failures, why the name is One Ki, Key, 元氣, 一圓相. It reads like a person, not a pitch. |
| 3 | Conviction | 承 Breathe in. The amber flame is wiped to the blue flame, 1,000°C becomes 1,900°C, and the map shows the empty quadrant ONEKI stands in. |
| 4 | Held breath | Authored silence. A near-empty dark viewport carries only "이름이 불리기 30초 전." |
| 5 | **Release (PEAK)** | 轉→結 Snap. The stick bends under the scroll and snaps. 톡. The whole page regrades to cobalt, the gauge locks at 1,900°C, and "누군가 방금, 자기 순간을 시작했다." lands. |
| 6 | Belonging | Breathe out. Twelve small rituals and the manifesto lines arrive at a walking pace. |
| 7 | Resolve | The vision, "a world that runs on blue energy.", and four BHAG posters hung one by one. |
| 8 | Calm, carried | The colophon. The flame rests blue, and "Refill, never borrow." holds on the last screen. |

No two adjacent rows share a feeling.

## The peak

> "I slowed down without meaning to, the screen went quiet, and then the stick snapped, 톡, and the whole page went blue."

- **Location:** act 5.
- **Budget:** the only generated clip, the largest span on the page, and the authored silence of act 4 directly in front of it.

## Tell-someone sentence

**It's the site where** the slower you scroll, the hotter the blue flame burns, and when the stick finally snaps the whole page catches fire in blue.

## Authored silence

Act 4 is deliberate. It is a dark ground with a single line, about 0.8 viewport-heights. It must not be reported as dead scroll.

## What the visitor does next

Nothing transactional yet. The trademark is not cleared, so there is no sign-up form and no shop link. The close resolves on the brand line, with the company colophon in small type. When pre-launch sign-up opens, it replaces the colophon line. It is the single action, labelled "알림 받기" everywhere.

## Feel check (2026-10-12, after build)

I scrolled the built page cold and wrote one word per act, then compared it with the intended curve.

| # | Intended | Felt | Change made |
|---|---|---|---|
| 0 | Hush, curiosity | curiosity | Faded the hard top and bottom edges of the haze plate, which read as a glitch rather than calm |
| 1 | Unease | unease | Moved the copy onto a paper panel, because it was unreadable over the floor; the panel now fades with the copy so no empty card is left behind |
| 2 | Intimacy | *(nothing on the first pass)* | The Q&A and the name breakdown never revealed: a stagger parent was missing its `data-sc-in`. After the fix it reads as intimacy |
| 3 | Conviction | conviction | None |
| 4 | Held breath | held breath | None. The silence is authored and the harness did not flag it |
| 5 | Release (peak) | release | None. It is the largest visual change on the sheet (cobalt bloom plus the gauge turning blue) and the longest span |
| 6 | Belonging | *(nothing on the first pass)* | Manifesto lines and rituals were invisible for the same `data-sc-in` reason. After the fix it reads as belonging |
| 7 | Resolve | resolve | None |
| 8 | Calm, carried | calm | None. The last screen holds the ensō, "Refill, never borrow." and the colophon |

**Deviation from the brand book, on purpose.** The intertitles are reordered to Pause 起 / Breathe in 承 / Snap 轉 / Breathe out 結, so the snap is the turn (轉) and the exhale is the resolution (結). The brand book had Breathe out before Snap. The feeling curve needs release before belonging.

## Revision 2026-10-13: Origins with the full brand-book interview

The user asked for appropriate illustrations to fill in the content of brand book pages 6 and 7.

- **Copy:** act 2 now carries all 17 founder Q&As from spreads 06 (Origins 1) and 07 (Origins 2), in 12 groups.
- **Illustrations:** a sticky column on desktop crossfades as each group is read; on phones each illustration sits inline above its answers.
  - Four come from the brand book.
  - Seven are newly generated in the brand book's line style.
- **Length:** the act grows to about 7.8vh, so the page now runs about 21vh. That is over the 14vh pacing reference, accepted because the user asked for the content. The act is natural flow, not a pin, so it reads as an editorial spread rather than held scroll.
