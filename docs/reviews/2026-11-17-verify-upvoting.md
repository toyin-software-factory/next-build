# Check verify: upvoting (spec 0005)

**Verdict: PASS. All 14 acceptance criteria are met. Ten were driven in a running app (the local Workers server and the deployed preview). Four server side details are proven by the Vitest run only (listed below).**

Next: `/test upvoting`. The feature stays `in-progress` until Michael marks it `done`.

## How it was run

- Local Workers runtime (`pnpm preview`, real workerd, local D1) with Playwright in Chromium: `tests/e2e/voting.spec.ts`, 8 tests on desktop and phone, 16 passed.
- Deployed preview of PR 19: https://fsd-t10-slice2-next-build.jnr4u2.workers.dev (shared preview D1). Driven with a Playwright script: vote, unvote, reload, a blocked request for the row error, and a request with a foreign `Origin` header. Screenshots and a short video are published on the PR under `## Proof`.
- `pnpm exec vitest run`: 13 files, 105 tests passed.
- Every idea created for this check has a name like `Weekly email digest gcg8 desktop`. They stay on the shared preview board. Production is untouched.

## Per criterion

| AC | Result | Evidence |
|----|--------|----------|
| AC-1 vote | met | On the preview and locally: one press moved the count from 0 to 1, `aria-pressed="true"`, filled arrow, and the row moved up without a reload (`desktop-voted.png`, e2e test 1 and 4). The status text is asserted in the e2e and in `VoteButton.test.tsx`. |
| AC-2 unvote | met | A second press returned the count to 0 and the button to not voted (`desktop-unvoted.png`, e2e test 1). |
| AC-3 one vote per browser | met | A second browser context saw the count but not the voted state, then added its own vote (e2e test 2). Repeated on, repeated off and parallel requests are proven by `src/db/queries.test.ts` against a real local D1, not by a raw request to the deployed action. |
| AC-4 double press | met | The pending button is `aria-disabled`, and extra presses send nothing (e2e test 3 and `VoteButton.test.tsx`). |
| AC-5 order and focus | met | A voted row moved up the board and the pressed button kept keyboard focus (e2e test 4). The tie order is proven by the query tests. |
| AC-6 hidden idea | met by tests | Needs a hidden idea, and there is no admin page yet. `queries.test.ts` proves `idea_unavailable` with no change in the table, and `VoteButton.test.tsx` proves the status message, the refresh and the focus move. Not driven in the browser. |
| AC-7 no cookie | met by tests | Action tests prove `no_voter` and nothing stored. Component tests prove the Try again flow through a delayed `fetch('/')` and the same message after a second `no_voter`. Not driven in the browser. |
| AC-8 save failure | met | With the vote request blocked, the row showed "Couldn't save your vote." with Try again, and axe stayed clean (`phone-error-row.png`, e2e test 8). The refresh rules per code are proven by component tests with a spy. |
| AC-9 server numbers win | met by tests | Component tests give a different optimistic guess and a different returned `voted`, and check the announcement and the props after the refresh. Not driven in the browser. |
| AC-10 logs | met by tests | `actions.test.ts` checks the exact log keys for every event, a garbage cookie with no `voter8`, and a database error that carries the voter id. The e2e server log shows lines such as `{"event":"vote_set","code":"ok","voter8":"ace20cfb"}` with nothing more. |
| AC-11 survives reload | met | On the preview and locally: reload showed the idea still voted (`desktop-after-reload.png`, e2e test 1). A different browser saw it as not voted (e2e test 2). |
| AC-12 name, size, axe, keyboard | met | e2e: the button measures at least 44 by 56 px on desktop and phone, Enter and Space both vote, and axe gave 0 violations with voted, not voted and error rows in light and dark on both widths. |
| AC-13 live on Workers | met | The vote was stored in the preview D1 and survived a reload. A request with a foreign `Origin` header was refused with a 500, and a same origin request passed the origin check. No `serverActions.allowedOrigins` is set and none is needed. |
| AC-14 abuse seam | met by tests | `actions.test.ts` proves `checkVote` runs after validation and before the write and always passes. `VoteButton.test.tsx` injects `rate_limited` and checks the message, Try again and no refresh. |

## Specced surfaces

All built: the `setVote` query and action, `VoteResult` and the input schema, `checkVote`, the copy for every error code, `logVote`, `VoteButton`, the row error, and the status region announcements. No migration was specced. None missing, none unapplied.

## Not exercised in a running app

- AC-6, AC-7, AC-9 and AC-14 (tests only, see the table). AC-6 needs the admin hide from feature 8 to be driven end to end.
- AC-3 raw parallel calls and AC-10 log lines for refusals (tests only).
- Screen reader output (the status text is asserted in the DOM, not heard).

## Worth a look in review

- The `sync-recorded` check fails until the PR body has its filled `## Sync` section. That is expected at this point.
- The preview D1 is shared, so the test ideas above stay on the preview board.
- `agent-browser` could not be installed in this sandbox, so the proof uses Playwright scripts for screenshots and video.

## Files ticked

Scope: ticked `Browser proof` and `Verify it` on feature 6. Spec Status stays `In Progress` (done is Michael's call).
