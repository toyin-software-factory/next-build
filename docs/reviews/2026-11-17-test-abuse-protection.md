# Test: abuse protection (spec 0007)

**Result: all 206 Vitest tests pass. PR #22 already carried most of the suite, so this run added 3 tests where the checklist had a gap. No bugs found.**

## What was checked

You asked for burst and hourly limits (posts and votes), the Turnstile server check, the `submissionId` shortcut (AC-17), and no salt meaning the browser cap only. Each one was matched to the tests that already exist, then the gaps were filled.

| Area | Criteria | Where it is tested | Status |
|---|---|---|---|
| Burst limit, posts | AC-1, AC-9 | `src/lib/abuse.test.ts` (burst refusal makes no siteverify call and takes no slot, key is the address hash) | covered |
| Burst limit, votes | AC-3 | `abuse.test.ts` (refused, nothing written) | covered |
| Hourly limit, posts | AC-2, AC-5, AC-7 | `abuse.test.ts` (5 per browser, 15 per address, new hour, shared key for no address) | covered |
| Hourly limit, votes | AC-3, AC-4 | `abuse.test.ts` (60 per browser, unvote and repeats count, 150 per address) | covered |
| One atomic statement, cleanup | AC-14, AC-15 | `abuse.test.ts` (parallel last slot, refused rows write nothing, old rows deleted) | covered |
| Turnstile, missing or bad token | AC-8, AC-11 | `src/lib/turnstile.test.ts` (no call for missing, empty or oversize; `success: false`; timeout, 500, bad JSON, wrong shape fail closed; production action and hostname) and `abuse.test.ts` (bad token takes no hourly slot) | covered |
| Votes never use Turnstile | AC-9 | `abuse.test.ts` | **added** |
| AC-17 shortcut | AC-17 | `src/app/actions.test.ts` (saved idea answers success with no abuse check, the race after a refusal, a failing lookup) | covered |
| No salt, posts | AC-10 | `abuse.test.ts` (browser cap only, never the `none` key, logs `not_configured`) | covered |
| No salt, burst limiter | AC-10 | `abuse.test.ts` (limiter is never called for posts or votes) | **added** |
| No salt, votes | AC-10 | `abuse.test.ts` (60 per browser, another browser on the same address is not held back, rows carry only the fixed `unsalted` marker) | **added** |
| Failing open | AC-10 | `abuse.test.ts` (binding missing or throwing, D1 failing, reason lookup failing) | covered |
| Logs | AC-6 | `abuse.test.ts` (no address, hash, salt or full voter id) | covered |
| Widget and form | AC-12, AC-13 | `TurnstileWidget.test.tsx`, `IdeaForm.test.tsx`, `tests/e2e/abuse.spec.ts` | covered |

## Added

Three tests in `src/lib/abuse.test.ts`, under "failing open (AC-10)":

1. Without a salt, the burst limiter is never called for a post or a vote.
2. Without a salt, a vote keeps only the 60 per browser cap, and stored rows hold only the `unsalted` marker.
3. A vote never calls Cloudflare for a bot check.

## Not covered

- **AC-16** (a production check by hand after the dashboard steps) cannot run in CI. It belongs to Michael (C-7), once Toyin has finished the dashboard steps.
- The burst limit is approximate by design (the Workers binding counts locally), so no test pins an exact number of requests. The Playwright run only checks that a burst is refused.

## Commands

`pnpm test` (206 passed), `pnpm lint`, `pnpm format:check` and `pnpm typecheck` are clean.
