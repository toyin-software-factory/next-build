# Check verify: suggest an idea and see the board (spec 0004)

**Verdict: PASS. All 13 acceptance criteria are met. Each was driven in a running app, except a few server side details that only the Vitest run proves (listed under the table).**

Next: `/test` is skipped on purpose (Michael agreed, the unit and e2e tests already cover the risky logic). The feature stays `in-progress` until Michael marks it `done`.

## How it was run

- Deployed preview of PR 12: https://fsd-t07-slice1-next-build.jnr4u2.workers.dev (real Workers runtime, preview D1 `next-build-preview`, commit `aca66a4`). Driven with Playwright in Chromium.
- A second local Workers server on port 8788 with a fresh local D1, used only for the error state (no tables yet) and the empty board (migration applied). It was stopped afterwards.
- `pnpm exec vitest run`: 12 files, 73 tests passed.
- Every idea posted on the preview starts with `Verify 1794911370635`, `Nocookie probe` or `Offline probe`. Screenshots are in the scratch area (not committed).

## Per criterion

| AC | Result | Evidence |
|----|--------|----------|
| AC-1 post and see it | met | Posted on the preview. Status region said "Idea added", the field was empty, the idea was listed with no manual reload and still there after a reload. |
| AC-2 empty refused | met | Empty and spaces plus new line both gave "Write an idea first." The field had `aria-invalid="true"` and `aria-describedby` pointing at the error. |
| AC-3 over limit refused | met | 145 characters gave "Ideas can be up to 140 characters. Yours is 5 over." and the text stayed in the field. 140 emoji showed "140 / 140". The server side `too_long` and `raw_too_long` codes are proven by `src/app/actions.test.ts` (refuses empty, too long, raw too long, malformed), not by a raw request to the deployed action. |
| AC-4 stored text is normalized | met | `Verify 1794911370635  first\nidea   here` is listed as `Verify 1794911370635 first idea here` (one line, single spaces). Emoji counting is proven by the action test. |
| AC-5 board order and row | met | Two posts: the newer one is the first row. Each row shows text, `17 Nov 2026, 10:29 UTC` and a vote chip with `0 votes`. The 500 limit, hidden filter and tie order are proven by the query tests in the Vitest run, not by the preview. |
| AC-6 empty state | met | Fresh local D1: "No ideas yet. Be the first to suggest what we build next." and a "Write an idea" button. After a click, the focused element was `idea-field`. |
| AC-7 board load error | met | Local server with no tables: HTTP 500 and the page showed "We couldn't load the ideas. Try again." with a Try again button, no technical detail. |
| AC-8 post failure | met | With POST requests blocked in the browser: "We couldn't add your idea. Try again." with Try again, text kept. After unblocking, Try again stored the idea and cleared the field. |
| AC-9 voter cookie | met | First load set `nb_voter` (36 characters, Secure, HttpOnly, SameSite Lax). With the cookie deleted, a post was refused with "Please reload the page and try again." and nothing was stored. Try again loaded `/`, got a new cookie and stored the idea. A direct action call without a cookie is covered by the action test (`answers no_voter`). |
| AC-10 logs | met by tests | Not visible from the browser. `src/app/actions.test.ts` has two tests that make a database error carry the idea text and the full voter id, then assert neither is in the log output, and that `voter8` is only logged for a valid id. These passed. |
| AC-11 double press | met | A double click on Add idea stored exactly one row. Same submission key retry is proven by the action test (one row for the same id, two for different ids). |
| AC-12 axe and keyboard | met | axe (wcag2a, 2aa, 21aa, 22aa) gave 0 violations in light desktop, light phone, dark desktop and dark phone on the board. Two Tab presses reached `idea-field`, typing then Enter posted the idea. |
| AC-13 live on Workers | met | The migration is live on the preview D1 (tables exist, or the posts would have failed). Ideas posted on the deployed page were listed and survived a reload. |

## Specced surfaces

All built: the page `/`, `error.tsx`, the `ideas` and `votes` tables with migration `0000_lazy_hellion.sql`, the `postIdea` action, the `nb_voter` cookie step in `middleware.ts`. None missing, none unapplied.

## Not exercised in a running app

- AC-10 logging (tests only).
- AC-3 and AC-9 raw calls to the server action without the page (tests only). The Next server action id is not easy to call by hand.
- AC-5 limit of 500 and tie breaks (tests only).
- Production isolation (AC-13 extra): the preview idea `Isolation check 1794911192277` must not show on production. Michael checks this after the merge, tracked as commitment C-3.

## Worth a look in review

- The no cookie path needs a second press (Try again). That matches the spec, but a visitor who clears cookies mid session sees one refusal first.
- The preview D1 is shared, so the test ideas above stay on the preview board. Production is untouched.
- `pnpm test` prints a jsdom message about `HTMLCanvasElement.getContext` from axe. It is harmless but noisy.

## Files ticked

Scope: no `Verify it` box exists on the feature 5 row yet, so nothing was ticked there. The spec Status stays `In Progress` (done is Michael's call).
