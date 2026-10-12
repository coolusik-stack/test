# Fingerprints

Every site you build with **scroll-craft** gets one row here, appended after it
ships. The registry exists so your next build can prove it is a different page
rather than a re-skin of one you already made.

This file is **yours**. It starts empty on purpose: the gate is about not
repeating *yourself*, so it has nothing to say until you have built something.

The rules and the gate live in the skill's
`references/uniqueness.md`. Short version:

**A new build must differ from EVERY row below on at least 4 of the 6
dimensions.** Four against each row individually, not four on average across the
table. If a planned build fails, change the plan. Never edit a row to make room
for it.

The six dimensions are: **grammar**, **nav treatment**, **hero device**,
**act-sequence shape**, **close pattern**, **signature move**.

Dimension 6 is free, because a signature move is unique by definition. So the
gate really asks for three more out of the remaining five, and a build that
changes only grammar and world will fail it.

---

## The registry

| Build | Grammar | Nav treatment | Hero device | Act-sequence shape | Close pattern | Signature move | World | Port |
|---|---|---|---|---|---|---|---|---|
| oneki (2026-10-12) | Breath cycle (new): four intertitled breaths, holds and releases alternate, hard-cut grounds | Fixed right-margin flame gauge (mobile: bottom bar): °C readout + 起承轉結 jump ticks, no top bar | Pinned layered cover plate: dot grid / haze / alpha gold stick / alpha hand closing on the notch / front mist, headline between planes | parallax-pin → pin+line-draw → flow → reveal+count → authored silence → pin+image-sequence scrub (peak, 3vh) → flow stagger → reveal ×4 → hold; 9 acts ≈ 14vh | Exhale: ensō + gradient line + colophon holds on the last screen, no button | Scroll velocity drives page heat: calm = blue 1,900°C, fast = amber flicker; the snap locks it and regrades to cobalt | Photographic studio still life on off-black, cobalt + gold | oneki/ |


---

## What is taken

Add a bullet here whenever a build claims something a later build should avoid
reusing: a grammar, a nav treatment, a close pattern, a signature move, an
act-count-and-length band. The shared columns are what the next build inherits
as a constraint, so writing them down is the whole point.

- **Breath cycle** grammar (intertitle-led hold/release alternation)
- **Margin gauge nav** that doubles as a live readout
- **Velocity-to-temperature** signature (scroll speed as a page-wide variable)
- **9 acts ≈ 14vh** band with a single 3vh image-sequence peak

---

## Appending a row

After shipping, add one line to the table and one bullet to **What is taken** if
the build claimed something new. Fill every column. Say what the build shares
with existing rows.

Rows are append-only. A build that has been superseded stays in the table,
because the space it occupies is still occupied.

---

## Worked example

The skill's author kept a registry of twelve builds across eight page grammars.
If you want to see what a filled-in table looks like, and which shapes tend to
collide, read `EXAMPLES.md` in the scroll-craft repository. Treat it as
illustration only: those rows are somebody else's builds and they do **not**
constrain yours.
