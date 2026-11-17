# Test: admin sign in (spec 0006)

**Result: all 223 Vitest tests pass and the admin Playwright specs pass (8 of 8 on desktop and phone). The suite already covered nearly every criterion, so this run added one browser test. The AC-10 preview smoke is done and the preview refused the request. No bugs found.**

## What was checked

You asked for the Test box of feature 7 and the preview smoke that Michael's check only ran with a junk token. Each acceptance criterion was matched to the tests that exist, then the gaps were filled.

| Area | Criteria | Where it is tested | Status |
|---|---|---|---|
| No token gives the plain 403 with `no-store` and `noindex`, no redirect | AC-1 | `src/middleware.test.ts`, `tests/e2e/admin.spec.ts` | covered |
| Valid admin token loads `/admin` | AC-2 | `admin.signed-in.spec.ts` | covered |
| Every bad token (signature, key, audience, issuer, expiry, algorithm, no email, wrong email) | AC-3 | `src/lib/access.test.ts` verifier table, e2e wrong key, audience and email | covered |
| Missing or malformed config fails closed | AC-4 | `access.test.ts` (`readAccessConfig`, no config refuses first), `middleware.test.ts` | covered |
| `setHidden` with no token is `forbidden` and writes nothing | AC-5 | `src/app/admin/actions.test.ts`, guard coverage over every `"use server"` file, e2e POST to `/` with the real action id | covered |
| Admin queries need the `Admin` proof | AC-6 | `admin-queries.test.ts` type tests, ESLint ban tests in `access.test.ts` | covered |
| Key fetch fails, retry, unknown key id refetches once | AC-7 | `access.test.ts` `getAccessKeys` | covered |
| Refusal logs hold only event, surface and reason | AC-8 | `middleware.test.ts`, `actions.test.ts` | covered |
| Production and preview audiences differ | AC-9 | `access.test.ts` | covered |
| Local key trusted only outside production and with no `cf-ray` | AC-10 | `access.test.ts` local keys guard, e2e `cf-ray` test, preview smoke below | covered |
| Foreign `Origin` POST refused even with a valid token | AC-11 | `admin.actions.spec.ts` | covered |
| axe in light and dark, desktop and phone | AC-12 | `admin.spec.ts` (403 page), `admin.signed-in.spec.ts` (admin page) | covered |
| Production check | AC-13 | Not testable in CI | owned by Michael (C-6) |

## Added

One Playwright test in `tests/e2e/admin.signed-in.spec.ts`, "a failed hide call shows the sign in ended message and changes nothing". It makes the action POST fail in a real browser, as it does when Access drops the session. It checks the ended message, the Reload button, that the row keeps its Hide button, and that the idea is still on the public board. Before this, that path was only covered by component tests.

## AC-10 preview smoke

Target: the deployed preview of PR #31 (`feat-fsd-t20-close-foundations-next-build.jnr4u2.workers.dev`), built by Workers Builds from the same Worker code as main. The token came from `pnpm access:token` (a throwaway local key, valid shape, signed by a key the preview does not trust).

| Request to the preview | Result |
|---|---|
| `/admin` with `X-Forwarded-Host: localhost` and the signed token | **403**, the plain refusal page, `cache-control: no-store`, `x-robots-tag: noindex` |
| `/%61dmin` with the same headers | **403**, same page and headers |
| `/admin/` with the same headers | 308 to `/admin`, no data in it (the known Next redirect) |
| `/admin` with the same headers and `Host: localhost` | 403, but this one came from the sandbox proxy (its own nginx style page), not from the Worker |
| `/admin` with no token, and with a junk token | 403 |
| `/` | 200, the public board stays open |

Limits, stated plainly:

- A spoofed `Host` header cannot be sent from this sandbox. The proxy answers its own 403 before the request reaches Cloudflare, so that half of the smoke was not proven by the Worker. Cloudflare also routes by `Host`, so a real request with `Host: localhost` would not reach the Worker either. `X-Forwarded-Host: localhost` did reach the Worker and was refused.
- The preview has no `ACCESS_LOCAL_JWKS` set, so the 403 shows the token was refused, not that the `cf-ray` guard alone blocked a trusted local key. That guard is proven by the unit tests (`access.test.ts`, with and without `cf-ray`, and in production) and by `admin.spec.ts` "a deployed host cannot turn on the local key (cf-ray)", where the Worker does trust the key and the `cf-ray` header alone makes it refuse.

## Not covered

- AC-13 (the production check) belongs to Michael (C-6).
- A flaky existing test: `src/components/VoteButton.test.tsx` "pressing the vote button on an error row clears the error and sends the new opposite" fails about 1 full run in 4 (it sees `want: off` instead of `on`) and passes on rerun. It is feature 6 code, not changed here.

## Commands

```
pnpm exec vitest run                       # 223 passed
pnpm exec playwright test admin.signed-in --project=admin-desktop --project=admin-mobile   # 8 passed
pnpm lint && pnpm format:check && pnpm typecheck   # clean
```
