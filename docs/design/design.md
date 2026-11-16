# Next Build design language

Status: Proposed. The build spec is [docs/specs/0003-design-system/index.md](../specs/0003-design-system/index.md). It holds the exact tokens, component rules and acceptance criteria. This page is the short human version.

## Feel

Calm and neutral. The ideas are the product, so the page stays quiet: one centred column, thin borders, plain greys, and a single blue accent for actions, the voted state and the focus ring. It follows the device's light or dark setting. There is no theme toggle at launch.

## Colour at a glance

| Role | Light | Dark |
|---|---|---|
| Page | `#fafafa` | `#0a0a0a` |
| Card, row, input | `#ffffff` | `#171717` |
| Text | `#171717` | `#fafafa` |
| Muted text | `#525252` | `#a3a3a3` |
| Accent | `#1d4ed8` | `#60a5fa` |
| Error | `#b91c1c` | `#f87171` |

Every text pair is at least 4.5:1 and every control outline and the focus ring at least 3:1, in both modes. The full token list and the contrast table are in the spec.

## Type and space

- One font: Inter variable, self hosted. Body 16 px, meta 14 px, page title 28 px.
- Counts and the character counter use tabular numbers so they do not jitter.
- 4 px spacing scale. Content column 672 px wide with 16 px side padding.
- Radius 8 px for controls, 12 px for cards. One small shadow, on the form card only.

## Components

| Component | Where | Key rule |
|---|---|---|
| Idea form | Board | Label, textarea, live "n / 140" counter (code points), Add idea button. Over limit text is kept and explained, never cut off. |
| Idea row | Board | Idea text, an absolute UTC date, and a vote chip on the right. |
| Vote button | Board | Up arrow above the count, 44 by 56 px minimum. Voted state: soft blue fill, inset ring, filled arrow, `aria-pressed="true"`. Sends the wanted state (on or off), so a retry is safe. |
| Empty state | Board | "No ideas yet", one sentence, a button that moves focus to the idea field. |
| Error message | Board, Admin | Icon plus plain text, a Try again button when it helps. |
| Admin row | Admin | Idea, votes, date, Visible or Hidden badge, one Hide or Unhide button. No confirm dialog because it is reversible. |

## Keyboard and focus

- Visible focus ring on every control: 2 px accent outline with 2 px offset.
- Tab order follows reading order. Enter submits the idea. Enter or Space presses a button.
- Focus stays on the control you used, even when the list re-sorts. Results are announced once through a polite status region.
- Targets are at least 44 by 44 px. Motion respects `prefers-reduced-motion`.

## Mobbin references

1. Featurebase, feedback board with upvotes: https://mobbin.com/screens/929b32f4-745c-4b09-99c7-96193e6555d5
2. Canny, feature request list: https://mobbin.com/screens/0df17314-c363-4d16-8742-8c40b40e3fc1
3. Featurebase, roadmap sorted by votes: https://mobbin.com/screens/6d7dadc1-bb7e-450c-8417-fc1d3957c168
4. Productboard, ideas portal: https://mobbin.com/screens/94a52465-42c5-4e90-8a33-29674d26b173
5. Canny, empty board: https://mobbin.com/screens/7becac2a-231f-4f41-af27-a60ee3dcadd5
6. Basecamp, empty state: https://mobbin.com/screens/81058ba9-1633-4234-a12a-1c87c41bdb53

What each one informed is in [rationale.md](../specs/0003-design-system/rationale.md).
