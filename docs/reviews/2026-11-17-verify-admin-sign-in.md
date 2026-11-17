# Verify: admin sign in (spec 0006), steps 1 to 3 and the thin page

Result: PASS for everything that can run before the Cloudflare dashboard steps. Two items are owed after deploy (AC-10 preview smoke, AC-13 production proof).

Ran via `pnpm test:e2e` (the real Workers runtime from `pnpm preview`, local D1, a throwaway signing key trusted through `ACCESS_LOCAL_JWKS`): 46 passed, plus the vitest suite (120 passed). Screenshots were taken with Playwright's Chromium against the same preview server (agent-browser is not installed in this sandbox).

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC-1 | met | `admin.spec.ts` "answers 403 with the plain page and the safety headers": 403, `no-store`, `noindex`, no `Location`, refusal text. Screenshot `admin-403-desktop.png`. |
| AC-2 | met | `admin.signed-in.spec.ts`: 200, heading Admin, `N ideas, M hidden.` Screenshot `admin-signed-in-phone.png` shows "20 ideas, 0 hidden." |
| AC-3 | met | `access.test.ts` verifier table (every token case), plus e2e wrong key, wrong audience, wrong email, cookie only. |
| AC-4 | met | `access.test.ts` config cases; `middleware.test.ts` refuses when unconfigured. |
| AC-5 | met | `actions.test.ts` forbidden before zod, guard coverage over every `"use server"` file. The version that POSTs to `/` with the real `setHidden` id is not possible yet: `setHidden` has no caller, so Next does not put it in the action manifest. Feature 8 wires the form and adds that test. |
| AC-6 | met | Branded `Admin` type, `expectTypeOf` and `@ts-expect-error` tests, two ESLint bans each with a firing test. |
| AC-7 | met | `access.test.ts` getAccessKeys: failed fetch refused, next request retries, unknown kid refetches once. |
| AC-8 | met | `middleware.test.ts` and `actions.test.ts` log spies see only the allowed fields. |
| AC-9 | met | `access.test.ts` two configs with different audiences. |
| AC-10 | partly met | Local key guard unit tests (production and `cf-ray` ignored) and e2e `cf-ray` check pass. The preview smoke with a spoofed `Host` and `X-Forwarded-Host` needs a deployed preview: owed after deploy. |
| AC-11 | met | `admin.actions.spec.ts`: POST to `/admin` with a valid token and `Origin: https://evil.example` is refused (status 400 or more, no success body). |
| AC-12 | met | axe zero violations in light and dark, desktop and phone, for the 403 page and the admin page (`admin.spec.ts`, `admin.signed-in.spec.ts`). |
| AC-13 | blocked | Needs the dashboard steps with Toyin and a production deploy. |

Worth knowing: a trailing slash (`/admin/`) gets a 308 redirect to `/admin` from Next before the middleware runs, and `/admin` then answers 403. The redirect carries no data. `wrangler --var` strips quotes from JSON values, so the e2e key set is passed as base64 (`readLocalKeys` accepts both).
