# Check verify: abuse protection (spec 0007)

**Verdict: PASS. 17 of 17 acceptance criteria are met. AC-16 was checked on production after Toyin's dashboard steps (see Production check below).**

Next: nothing. The dashboard steps, the production check and `/test abuse protection` are all done, and the feature is `done`.

## How it was run

- Local Workers runtime (`pnpm preview`, real workerd, local D1, the real Workers Rate Limiting binding) with Playwright in Chromium: 52 e2e tests passed on desktop and phone, including the new `tests/e2e/abuse.spec.ts`.
- `pnpm test`: 15 files, 157 tests passed (real local D1 for the limit tests).
- `pnpm build:worker`, lint, format check, typecheck and the migration drift check are clean.
- Each e2e test gets its own client address (a header set by a route handler), so the address limits never cross tests. The Turnstile script is replaced by a stub that hands out Cloudflare's published dummy token. The server still calls the real siteverify with the published test secret.
- Screenshots are published on the PR under `## Proof`.

## Per criterion

| AC | Result | Evidence |
|----|--------|----------|
| AC-1 burst posts | met | e2e: three quick posts pass, the fourth shows the friendly message, keeps the text and stores nothing. The binding refusal is in the server log as `abuse_refused` with reason `burst`. |
| AC-2 hourly posts | met by tests | `abuse.test.ts` on real D1: voter caps at 5 and 6, address caps at 15 and 16 with changing voter ids. |
| AC-3 votes | met | e2e: repeated votes end in the row message "You've reached the voting limit for now." with no board refresh. Caps 60 and 150 by `abuse.test.ts`. |
| AC-4 unvote counts | met by tests | `abuse.test.ts`. |
| AC-5 window reset | met by tests | `abuse.test.ts` with an injected clock. |
| AC-6 no address stored or logged | met by tests | Log keys and `rate_events` columns checked in `abuse.test.ts`. |
| AC-7 IPv6 and none key | met by tests | `ipKey` cases, including one /64, IPv4 mapped, null and garbage. |
| AC-8 token needed | met | e2e with the stub passes siteverify. Missing, rejected, wrong action, wrong host and missing config are covered by `turnstile.test.ts`. |
| AC-9 order | met by tests | A bad token uses no hourly slot, an over burst request makes no fetch call. |
| AC-10 fail open | met by tests | D1 error, binding throw and missing salt (only the per browser count runs). |
| AC-11 fail closed | met by tests | Timeout, 500, bad JSON, `internal-error`, missing secret. |
| AC-12 widget, nonce, axe | met, with a note | The real test key widget loads under the page CSP, shows no hidden widget markup and yields a token. The status message for a shown check is announced and axe is clean. Cloudflare's script makes one blocked `eval` probe and carries on, so the CSP test ignores that one line and fails on anything else. axe with a real challenge on screen was not run (the test key never shows one). |
| AC-13 fresh token, reset | met | Component tests, and e2e with the script blocked: the form shows the challenge message after the wait and stores nothing. |
| AC-14 atomic hourly | met by tests | Parallel calls with one slot left allow exactly one, and a refusal writes nothing. |
| AC-15 table stays small | met by tests | Cleanup keeps the current and previous hour. |
| AC-16 production check | met | Checked on production on 2026-11-17. See Production check below. |
| AC-17 retry uses no slot | met by tests | `actions.test.ts`. |

## Specced surfaces

All built: `rate_events` and its migration (`0001_bitter_tusk.sql`), `checkPost`, `checkVote`, the hourly queries, `verifyTurnstile`, `getAbuseSalt`, the Turnstile and site key getters, `logAbuse`, the `rate_limited` copy, `TurnstileWidget`, the form wiring, and the burst limits in `wrangler.jsonc`. None missing.

## Worth a look in review

- The spec said the local salt would be "a fixed public test value in code". It is in `.dev.vars.example` instead (CI and local runs copy it). Previews and production still need a real secret.
- A missing salt skips the burst limit and the address count, as the spec says, so until `ABUSE_SALT` is set only the per browser count protects previews and production.
- The posted row shows before the server confirms, and the bot check adds a round trip. A reload in that moment loses the post. The e2e now waits for "Idea added".
- The local e2e database keeps its ideas between runs. `rate_events` is cleared by the global setup.

## Files ticked

Scope: feature 9 status `in-progress`, the first four Build milestones and `Verify it` ticked. The dashboard milestone, `Build it` and `Test it` stay open. Spec 0007 status is `In Progress`.

## Production check (2026-11-17, Michael, AC-16)

Run on `https://next-build.jnr4u2.workers.dev` after Toyin finished the spec 0007 dashboard steps (Turnstile keys, `ABUSE_SALT`, `NEXT_PUBLIC_SITE_URL`) and the next deploy rebuilt the site.

- The page carries the real Turnstile site key (`0x4…`, not a test key) and loads `challenges.cloudflare.com/turnstile/v0/api.js`. The CSP allows it in `script-src` and `frame-src`.
- Toyin, in a normal browser: a normal post appeared on the board. A quick run of posts was stopped with the limit message. The test ideas were then hidden from `/admin` and left the public board (which also checks feature 8 on production). Toyin reported "All works" with no errors.
- A post with no token is refused on production: Michael replayed the `postIdea` server action (`Next-Action` id from the live JS bundle, a fresh voter cookie, a new `submissionId`, no `token`). The answer was `{"ok":false,"code":"challenge_failed"}`, and the idea text did not appear on the board.
- Toyin noticed that an incognito window can vote again. This is expected: votes are one per browser by design (anonymous, no sign up), and the per address hourly cap limits it. Toyin was asked whether to tighten it (thread 1794920460.404369).

Result: PASS.
