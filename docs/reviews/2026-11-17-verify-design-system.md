# Check verify: design system and UI foundation (spec 0003)

**Verdict: PASS. All 10 acceptance criteria are met. The ones a browser can show were driven in the local Workers runtime. The rest are proven by the token tests and by the slice verify reports of features 5, 6 and 8.**

Next: nothing owed for feature 4. The tokens only lint check from T18 has not landed, so a Vitest scan covers it for now.

## How it was run

- `pnpm preview` (real workerd, local D1) driven with Playwright in Chromium by a scratch script. It loaded `/` at 320 px and 1280 px, in light and dark, with 200 percent text size, with reduced motion, and with JavaScript off. Screenshots: `ds-320-light.png`, `ds-320-dark.png`, `ds-320-zoom200.png`, `ds-desktop-light.png`, `ds-desktop-dark.png` (kept in the scratch area, not committed).
- `pnpm exec vitest run`: 265 tests passed, including `contrast.test.ts` (28 pair checks) and the new `src/app/globals.test.ts` (33 tests).
- `pnpm exec playwright test`: axe runs on the board, form states, voting states and the admin page in light and dark, desktop and phone. 84 of 88 passed without `.dev.vars`. The 4 failures were the abuse burst tests that need CI's Turnstile test settings. With them set, the abuse spec passed 10 of 10.
- `pnpm lint`, `pnpm format:check` and `pnpm typecheck` are clean.

## Per criterion

| AC | Result | Evidence |
|----|--------|----------|
| AC-1 tokens defined once, used by name | met | `globals.test.ts` checks all 12 tokens exist in the light, dark and `light-dark()` blocks and that the blocks agree (I changed `--accent` in one block and the test failed, then restored it). The same file scans every file in `src/components` and `src/app` for raw hex, `rgb()`, `hsl()`, `oklch()`, arbitrary colour classes and Tailwind palette colours: none found. |
| AC-2 contrast meets AA in both modes | met | `contrast.test.ts`: 14 pairs from the spec table in light and dark, text at 4.5:1 and borders at 3:1, all pass. axe reported 0 violations in light and dark in the e2e runs. |
| AC-3 follows the device scheme, no flash | met | Browser: at 320 px and 1280 px the body was `rgb(250, 250, 250)` on light and `rgb(10, 10, 10)` on dark, with `color-scheme: light dark`. With JavaScript off, dark still painted `rgb(10, 10, 10)`, so the theme comes from CSS alone. No toggle exists. |
| AC-4 counter and shared normalizer | met | `idea.test.ts`, `actions.test.ts` (emoji count as one) and e2e `board.spec.ts` (empty refused, 141 refused with the text kept, exactly 140 accepted). Detail in the board verify report. |
| AC-5 idea row and vote button | met | e2e `voting.spec.ts`: `aria-pressed`, state kept after reload, 44 by 56 px button, axe clean voted and not voted. Detail in the upvoting verify report. |
| AC-6 empty state and board error | met | Driven in the board verify report (empty message with "Write an idea" button, error with Try again).. |
| AC-7 admin row, table and list | met | e2e `admin.signed-in.spec.ts`, desktop and mobile projects, plus the hide spam verify report: table on wide screens, labelled list on phones, Hidden badge, 0 axe violations. |
| AC-8 focus ring, tap size, keyboard | met | Browser: first Tab landed on a link with `outline: solid 2px`, colour `rgb(29, 78, 216)` (the accent). `globals.test.ts` checks the `:focus-visible` rule, the forced colours rule and the 44 px and 56 px minimums. e2e checks Enter and Space on the vote button and Enter to post. |
| AC-9 one polite status region, alerts for failures, focus rules | met | `announce.test.ts`, `HideButton.test.tsx` and `VoteButton.test.tsx` (focus kept, Try again returns focus, no pull from another control). e2e checks `#status` text and focus after hide, vote and post. |
| AC-10 320 px to desktop, reduced motion, 200 percent zoom | met | Browser: `scrollWidth` equals the window width at 320 px (320) and 1280 px (1280), light and dark. With text at 200 percent in a 320 px window `scrollWidth` was still 320 (`ds-320-zoom200.png`). With reduced motion the `.btn` transition duration was `0s`. |

## Specced surfaces

All built: the tokens and `@theme inline` mapping, Inter through `next/font`, `IdeaForm`, `CharacterCounter`, `ErrorMessage`, `EmptyState`, `IdeaList`, `IdeaRow`, `VoteButton`, the admin row with table and list, `error.tsx`, `copy.ts` and `announce.ts`. None missing.

## Not exercised

- A real screen reader. Status text and roles are asserted in the DOM, not heard.
- Real browser zoom (Ctrl and plus). The 200 percent check raised the root font size instead.
- Safari and Firefox. Chromium only.
- Hover and pressed tints by eye.

## Worth a look in review

- `src/lib/admin-refusal.ts` builds the standalone 403 page as an HTML string with raw hex colours (`#fafafa`, `#171717`, `#0a0a0a`) and its own dark media query. It is not a component and it matches the token values today, but it would drift if the tokens change. When T18 lands, decide whether the lint rule covers it.
- `contrast.test.ts` reads only the `light-dark()` values. The new `globals.test.ts` ties the fallback blocks to those values.
- The tokens only lint check (T18) has not landed. `globals.test.ts` is the stand in until it does.

## Files ticked

Scope: feature 4 `Verify it` and `Test it`, status `done`.
