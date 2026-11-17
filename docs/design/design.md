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
7. Digg, give feedback form (idea form, slice 1): https://mobbin.com/screens/0270f6df-cdad-4d2e-ba37-dc90c5195df4
8. Zapier, feature request form (label, hint, counter place): https://mobbin.com/screens/643c68df-d195-4803-89b8-19757e1da35d
9. Peerlist, project spotlight (row with vote chip): https://mobbin.com/screens/7345ce03-b10b-41f5-87fb-ae4b0a766874
10. Featurebase, feedback posts list (dense rows): https://mobbin.com/screens/16cc75ad-3a5b-4895-9eef-220892a1f41f
11. Productboard, collect feedback at scale (empty state): https://mobbin.com/screens/209665bb-42c4-4730-89a5-75dd0d3d2a0f
12. Hotjar, no feedback available (empty state): https://mobbin.com/screens/29d2e8c4-9d66-4d76-8d7e-2ed66ab3f0f1
13. Notion, something went wrong (board load error): https://mobbin.com/screens/e00ca642-dcfd-4797-aec7-9ae0d780ec3d
14. Revolut Business, connection issue (icon with text error): https://mobbin.com/screens/b719158e-0a19-4b2e-8cc0-5217648ea20a

Items 1 to 6 are explained in [rationale.md](../specs/0003-design-system/rationale.md). Items 7 to 14 were used for the slice 1 screens, and what to take from each is in [slice-1-references.md](slice-1-references.md).
