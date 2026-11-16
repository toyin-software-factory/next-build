# 0003 Rationale: design system and UI foundation

## Context

The Next Build board is one public page (suggest an idea, see ideas sorted by votes, upvote) and one private admin page (hide and unhide spam). There is no login for visitors, no images and very little text, so the design job is small: a calm look, readable in light and dark, that nobody has to think about again. The stack is fixed by spec 0001 (Next.js, Tailwind v4 configured in CSS, Playwright with axe). The data rules are fixed by spec 0002 (one line ideas of 1 to 140 code points, vote toggle returns the new count and voted state, hidden ideas are not votable).

Only Toyin can say how the product should feel. That question went through Michael with a recommended default (option 1 below). Work continued on the recommendation so nothing blocked.

## Options considered

### Option 1: calm neutral, one blue accent (recommended, chosen)

Neutral greys, one blue for actions and the voted state, system light and dark.

- Pros: highest contrast headroom, reads as "a tool", cheap to change later (only accent values), no brand assets needed.
- Cons: less memorable.

### Option 2: warm and playful

A warmer accent (orange or pink), rounder shapes, a friendlier headline font.

- Pros: more personality for a public board.
- Cons: warm accents struggle to reach 4.5:1 as text on white, so more colours would need darker variants; a second font adds a download; easy to tip into noise on a page that is mostly short lines of text.

### Option 3: dark first, developer tool look

Dark by default, monospace accents, a green accent.

- Pros: distinctive.
- Cons: ignores the visitor's device setting, hurts readability for people who prefer light, and a monospace face makes tabular counts harder to scan at small sizes.

### Smaller decisions

| Decision | Chosen | Runner up | Why |
|---|---|---|---|
| Theme source | Device setting only (`prefers-color-scheme`) | Manual toggle | A toggle needs storage, a script to avoid a flash, and a control to place. Not needed for a one page board. Can be added later with no token change. |
| Colour method | `light-dark()` with `color-scheme` | Class based `.dark` variants | One declaration per token, no script, no flash. A media query fallback covers older browsers. |
| Tailwind mapping | `@theme inline` over raw CSS variables | Values inside `@theme` | `inline` keeps utilities pointing at the live variable, so they follow the scheme. Plain `@theme` would freeze one value. |
| Font | Inter variable via `next/font`, self hosted | System font stack only | Consistent numerals and widths on every device; self hosting means no third party request and no CSP change. System stack is the fallback. |
| Counter limit | Count code points | Count UTF 16 units | Matches the server rule in spec 0002 so an emoji is never counted twice. |
| `maxlength` on the field | None | `maxlength=140` | `maxlength` cuts pasted text with no feedback. The counter and message explain instead. |
| Vote button name | Stable name plus `aria-pressed` | Name flips ("Upvote" and "Remove vote") | A flipping name combined with `aria-pressed` gets read twice by screen readers. Stable name plus state is the standard toggle pattern. |
| Hide confirmation | None, one click, reversible | Confirm dialog | Hide is undoable with Unhide, so a dialog only adds friction when cleaning many spam rows. |
| Announcements | One polite status region | Live regions on counter and list | Live regions on fast changing content flood screen readers. One region, short messages, set only on real events. |
| Admin layout | Table, stacked cards on phones | Card list on all sizes | Admin compares text, votes, date and status across rows, which suits a table. |

## Rationale

The board has about eight visible things. Anything beyond neutral surfaces, one accent and clear states would be decoration. A neutral palette also leaves the most room for AA contrast: every pair in the table clears 4.5:1 with margin (the lowest are `--warning` and `--border-strong` on `--bg` in light mode, at 4.92 and 4.54), so a later tweak of the accent has room.

Putting the design system inside the first UI slice (instead of its own build task) follows the Tracer Bullet approach used in this project: tokens and components are proven on a real page, and the contrast test runs against the same values the page uses.

Voting is the one interaction people repeat, so it gets the most care: a 44 px target, a state shown by shape (filled arrow, heavier outline) as well as colour, a stable accessible name with `aria-pressed`, and a count that does not shift the layout (tabular numbers).

## Mobbin references

Six screens from public feedback and roadmap tools were reviewed. They show the same pattern: a vertical list of ideas with a bordered vote chip on one side, the count inside the chip, and the title and meta text beside it. The reference notes say what each one taught us, not what to copy.

| # | Reference | What it informed |
|---|---|---|
| 1 | Featurebase, feedback board with upvotes: https://mobbin.com/screens/929b32f4-745c-4b09-99c7-96193e6555d5 | Vote chip as a bordered control with an up arrow over the count, placed beside the row, with the idea text taking the remaining width. |
| 2 | Canny, feature request list with vote counts: https://mobbin.com/screens/0df17314-c363-4d16-8742-8c40b40e3fc1 | Dense but airy rows with a thin divider, a short sort label above the list, and a single column that works on a phone. |
| 3 | Featurebase, roadmap voting sorted by votes: https://mobbin.com/screens/6d7dadc1-bb7e-450c-8417-fc1d3957c168 | A "most votes first" ordering shown in the interface, so people know why rows move. |
| 4 | Productboard, ideas portal: https://mobbin.com/screens/94a52465-42c5-4e90-8a33-29674d26b173 | Calm neutral surfaces with one accent, and how a submit field sits above the list. |
| 5 | Canny, empty board state: https://mobbin.com/screens/7becac2a-231f-4f41-af27-a60ee3dcadd5 | Empty state with a short heading, one sentence and one clear next step. |
| 6 | Basecamp, empty state: https://mobbin.com/screens/81058ba9-1633-4234-a12a-1c87c41bdb53 | A quiet dashed card for "nothing here yet", friendly copy without noise. |

Not copied: logins and avatars (visitors are anonymous), status labels and comment threads (out of scope for this board), and heavy colour fills.

## Contrast method

Ratios use the WCAG 2.x relative luminance formula on sRGB hex values: `(L1 + 0.05) / (L2 + 0.05)` with the lighter colour first. The same pairs are listed in `index.md`, and the first UI PR adds a small unit test that recomputes them from the token values so a change cannot slip below AA. Thresholds: 4.5:1 for text, 3:1 for icons, input and button outlines, and the focus ring (WCAG 1.4.11). `--border` is decorative only and never the only cue, so it is exempt.

## References

- WCAG 2.2: 1.4.1 Use of Color, 1.4.3 Contrast (Minimum), 1.4.11 Non text Contrast, 2.4.7 Focus Visible, 2.5.8 Target Size, 4.1.3 Status Messages. https://www.w3.org/TR/WCAG22/
- Modern Web Guidance guides used while writing: dark mode, colour, accessibility, dynamic sort.
- Tailwind CSS v4 theme variables (`@theme inline`). https://tailwindcss.com/docs/theme
- Spec 0001 (stack and architecture) and spec 0002 (data model) in this repo's PRs #2 and #3.
