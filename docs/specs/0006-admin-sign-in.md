# 0006. Slice 3: admin sign in

**Date**: 2026-11-17
**Status**: Proposed
**Feature**: scope feature 7, "Admin sign in" (Slice 3), plus the shape of the feature 8 "Hide spam" page it guards

## Summary

Only Toyin can open `/admin` or run an admin action. Two locks protect it. The first is Cloudflare Access in front of `/admin`: it asks for a login and allows only the admin email. The second is the Worker itself: on every admin page load and every admin action it checks the signed token that Access adds to the request (`Cf-Access-Jwt-Assertion`), and refuses with a 403 if anything is wrong. The second lock is the real gate. If the Access rule is wrong, missing, or bypassed (a preview URL, a typo in the dashboard), the Worker still says no.

This spec decides the token check, where it runs, what a refused request looks like, how previews and local runs behave, the dashboard steps for Toyin, and the contract of the admin page and its one action (`setHidden`) so feature 8 can build the hide page without reopening any of this. It needs no database migration.

The Access application is a self hosted application on the `workers.dev` host with the path `/admin`. Cloudflare's Workers documentation lists both a `workers.dev` hostname and a single path as valid application domains. A first dashboard step confirms the dashboard accepts it, and a custom domain is the contingency (see **D1**).

## Requirements

**User stories**:
- As the admin, I want to sign in once with my email and then see every idea, so that I can hide spam.
- As the admin, I want my session to end after a while, and a clear message if it ends while I am on the page.
- As a visitor or anyone else, I get no way into the admin area, and learn nothing about it.

**Built on** (not repeated here): spec 0001 (Access choice, `jose`, names `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAIL`, preview base config, `/admin` is `force-dynamic` with `Cache-Control: no-store` and `X-Robots-Tag: noindex`), spec 0002 (admin list and hide queries, `hidden_at`), spec 0003 (admin page look, `AdminRow`, `ErrorMessage`, copy), spec 0004 and 0005 (server action style, result codes, logging rule, the Next.js Origin check and `allowedOrigins`).

**Acceptance criteria** (each can be checked on its own):
- **AC-1**: A request to `/admin` with no `Cf-Access-Jwt-Assertion` header gets HTTP 403 and a plain page ("This page is only for the site admin."). No redirect, no login form, no idea data, and no hint about why. The response has `Cache-Control: no-store` and `X-Robots-Tag: noindex`.
- **AC-2**: A request with a valid token for the admin email loads the admin page.
- **AC-3**: Each of these tokens is refused with the same 403: wrong signature, signed by an unknown key, wrong audience, wrong issuer, expired, not yet valid, algorithm other than `RS256` (including `none` and `HS256`), no `email` claim (a service token), and an email other than `ADMIN_EMAIL`. The email comparison ignores case and surrounding spaces.
- **AC-4**: If `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` or `ADMIN_EMAIL` is missing or empty, or `ACCESS_TEAM_DOMAIN` is not `<name>.cloudflareaccess.com`, every admin request is refused (fails closed). It is never open.
- **AC-5**: `setHidden` with no valid token returns `{ ok: false, code: 'forbidden' }`, writes nothing and reads nothing, even when the input is garbage. The token check is the first thing the action does, before it validates the input.
- **AC-6**: The admin queries cannot be called without proof of a verified admin. The proof is a value only `requireAdmin()` can create, and the query signatures demand it, so a new admin query written without the check does not compile.
- **AC-7**: If Cloudflare's public keys cannot be fetched, the request is refused (not allowed through), and the next request tries again. A key rotation at Cloudflare needs no deploy: an unknown key id triggers one refetch.
- **AC-8**: Logs for a refusal hold only `{ event: 'admin_refused', surface, reason }`. Never the token, the email, the IP or the audience.
- **AC-9**: A token made for the production Access application is refused on a preview, and the other way round, because the audience differs. Checked by a unit test (two configs with different audiences), not in a browser, because a preview Access application may not exist.
- **AC-10**: Local runs and CI reach `/admin` with a token signed by a throwaway test key. The test key is trusted only when `getAppEnv()` is not `production` and the request has no `cf-ray` header, and never on a deployed Worker. A unit test sets the variable with a `cf-ray` header and expects a 403, and a preview smoke check sends `Host` and `X-Forwarded-Host` set to `localhost` plus a locally signed token to the deployed preview and expects 403.
- **AC-11**: A server action POST to `/admin` with a foreign `Origin` header is refused by Next.js even when the token is valid. The Playwright test sends a valid locally signed `Cf-Access-Jwt-Assertion` header on the foreign `Origin` POST, so it fails on the Origin check and not on authentication. The token proves who is asking, not that they meant to.
- **AC-12**: The admin 403 page and the admin page have zero axe violations in light and dark, desktop and phone.
- **AC-13**: On production, with the dashboard steps done: the public board stays open to everyone with no login, `/admin` shows the Access login, the admin email gets in, and any other email is denied by Access. With no login, each of these four URLs gets the Access login or a 403, and the body never contains idea text: `/admin/`, `/%61dmin`, `/admin?_rsc=x`, and `/admin` with the request header `RSC: 1`.

## Decision

**Chosen option**: Option 1, Cloudflare Access plus a signed token check inside the Worker, enforced in the middleware, the page and the action.

Toyin chose Cloudflare Access (no passwords for us to store). The Worker check is added because Access only proves identity at the edge, and the app should never depend on a dashboard being set up right. Reasons are in the Rationale.

### D1. Access scope: `/admin` only, on the `workers.dev` host

The Cloudflare Workers page "Cloudflare Access" says hostname or path based Access works with a self hosted application (Zero Trust, Access, Applications), and lists `my-worker.example.workers.dev` and a single path such as `example.com/login` as valid application domains. That page also says hostname or path based Access applies first, before Worker level Access. (The older general self hosted application page says the domain must belong to an active zone. The Workers page is the newer and more specific one, so it wins here; the first dashboard step proves it on the real account.)

- **Primary**: a self hosted application on `next-build.jnr4u2.workers.dev` with the paths `admin` and `admin/*` (the second covers sub paths, per Cloudflare's application paths documentation), allowing only the admin email.
- **Never**: the Worker level Access switch for the Worker or the account. It covers the whole host, including the public board, and would lock every visitor out.
- **Contingency** (only if the dashboard refuses the primary in step 1): a custom domain on a Cloudflare zone Toyin owns, with a Worker custom domain (for example `next-build.<their domain>`) and the same Access application on that domain's `admin` paths. `NEXT_PUBLIC_SITE_URL` and `serverActions.allowedOrigins` then use the new host, and spec 0001's Auth row is updated in the same change. The `workers.dev` host can stay on: `/admin` there has no token, so the Worker refuses it. The code in this spec is the same in both cases.
- **Previews**: Version URLs have changing hostnames (`<version>-next-build.jnr4u2.workers.dev`), so one application per preview is not workable. The choice is one wildcard application (`*-next-build.jnr4u2.workers.dev`, paths `admin` and `admin/*`) if the dashboard accepts a wildcard, because Cloudflare's page says nothing about wildcards in a hostname. If it does not, previews get no Access application and `/admin` on a preview stays refused by the Worker check (403 for everyone). That is a safe result, so it is the default; the wildcard is an optional extra (dashboard step 8).

### `ctx.access` or the header: the Worker trusts the verified token

Cloudflare also hands the Worker `ctx.access` (undefined when Access did not authenticate the request, with `getIdentity()` and `aud`) next to the `Cf-Access-Jwt-Assertion` header. This spec trusts the header token, checked by our own code, and does not use `ctx.access` for the decision:

- `ctx.access` carries no email without an extra identity call, and the documentation does not say how it is verified. The token check pins the audience and the email to our own config.
- It is documented as not passing through service bindings or the Static Assets router, and how the OpenNext adapter hands `getCloudflareContext().ctx` to the app is unverified. A lockout of the admin because `ctx.access` was missing would be the failure mode.
- Tests need a token path anyway (AC-10), and one path is easier to prove than two.

`ctx.access` stays unused. If a builder finds it reliably present in the preview, it can be logged next to a refusal as a debugging aid. It must never turn a refused request into an allowed one, and never be required.

## Feature design

### The token check (`src/lib/access.ts`, server only)

One function does all the checking, with the environment passed in so tests can control it:

```ts
verifyAccessToken(
  token: string | null,
  config: AccessConfig,
  keys: AccessKeys, // { list(): Promise<JWK[]>; refresh(): Promise<JWK[]> }, real or test double
): Promise<{ ok: true; email: string } | { ok: false; reason: AccessRefusal }>
```

`AccessRefusal` is one of `not_configured`, `no_token`, `invalid_token`, `wrong_email`, `keys_unavailable`. The caller never shows the reason to the visitor; it only goes to the log.

Steps, in this order, stopping at the first failure:

1. **Config.** `ACCESS_TEAM_DOMAIN` must match `^[a-z0-9-]+\.cloudflareaccess\.com$`, and `ACCESS_AUD` and `ADMIN_EMAIL` must be non empty. Otherwise `not_configured`. The domain pattern also stops a wrong value from making the Worker fetch keys from somewhere else.
2. **Token present.** Read only the `Cf-Access-Jwt-Assertion` header. The `CF_Authorization` cookie is ignored. No header gives `no_token`.
3. **Verify** with `jose` `jwtVerify(token, createLocalJWKSet({ keys }), { issuer: 'https://<ACCESS_TEAM_DOMAIN>', audience: ACCESS_AUD, algorithms: ['RS256'], clockTolerance: 30 })`. This checks the signature, issuer, audience, expiry and not before time. Access puts `aud` in the token as an array, and `jose` accepts a string `audience` option against an array claim, so `ACCESS_AUD` is passed as a plain string. If the payload has a `type` claim, it must be `"app"` (optional check, a user token); a missing `type` is not refused, because the email check already rejects service tokens. Any failure gives `invalid_token`. A failure to fetch the keys gives `keys_unavailable`.
4. **Email.** The payload `email` must be a string and, trimmed and lower cased, equal `ADMIN_EMAIL` trimmed and lower cased. An email containing a control character (code point below 0x20 or 0x7f) is refused. Otherwise `wrong_email`. A service token has no `email` claim and fails here.

**Keys.** No module scope `createRemoteJWKSet`: its shared pending fetch can be awaited by a second request, and on Workers a promise created in one request cannot be awaited in another (a cross request I/O error). Instead, a small `getAccessKeys(teamDomain, { forceRefresh })` in `src/lib/access.ts` does a plain `fetch('https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs', { signal: AbortSignal.timeout(5000) })` and keeps only the parsed JWK list in a module scope variable (plain data, safe to share). The key set is built per request with `createLocalJWKSet(list)`. If the token's `kid` is not in the cached list, the code refetches once and tries again. A fetch that fails, times out (5 seconds), or returns something that is not a key list gives `keys_unavailable`, and the cache is left unchanged so the next request tries again. Two concurrent requests with a cold cache may each fetch once. That is fine, and neither waits on the other's promise. Verification uses `clockTolerance: 30` (seconds). Tests pass a local key list instead of fetching.

**Local and CI keys.** If `ACCESS_LOCAL_JWKS` (a public key set as JSON, in `.dev.vars` only, never a Wrangler secret or var) is set, `getAppEnv()` is not `production`, and the request has no `cf-ray` header, the verifier uses it instead of the remote keys. Otherwise it is ignored. The rebuilt request URL host is not used as the signal, because a request can arrive with a spoofed `Host` or `X-Forwarded-Host`. `getAppEnv()` cannot tell local from a deployed preview (both are `preview`), so the `cf-ray` header carries the weight: Cloudflare adds it to every request that reaches a deployed Worker (a client cannot remove it), and `wrangler dev` and `next dev` do not. The variable is also never set on a deployed Worker. Playwright's global setup makes a key pair, gives the public half to the web server as `ACCESS_LOCAL_JWKS`, and signs the admin project's token with the private half. There is no switch that turns the check off.

### `requireAdmin()` and the `Admin` proof

`requireAdmin()` reads the header from the request (`headers()` in a page or action, the request in middleware), loads the config, calls `verifyAccessToken`, logs a refusal, and returns `Admin` or a refusal. `Admin` is a branded type (`{ readonly email: string; readonly [adminBrand]: true }`) that nothing else in the code base can build.

The admin queries take it as a parameter, so the compiler enforces the check:

The admin queries live in their own file, `src/db/admin-queries.ts`, not in `queries.ts`.

- `listIdeasForAdmin(db, admin: Admin)`: every idea, hidden or not, newest first then `ideas.id` descending, with vote count and `hidden_at` (spec 0002, capped at 500 like the board).
- `setIdeaHidden(db, admin: Admin, { ideaId, hidden })`: see below.

### Where the check runs (three places, none trusts another)

| Layer | What it does when the check fails |
|---|---|
| `src/middleware.ts`, for `/admin` and `/admin/*` | Returns the 403 response (AC-1) with the nonce CSP header, so the page gets the right status code. It does not cover server actions: Next.js finds an action by its ID in the `Next-Action` request header, not by the URL path, so a POST to `/` carrying an admin action ID never touches this check. |
| `src/app/admin/page.tsx` (and any later admin page or layout) | Renders the same "only for the site admin" content and no data. It does not assume the middleware ran, because a middleware bypass has happened in Next.js before. |
| Every admin server action (`src/app/admin/actions.ts`, and any other `"use server"` file that uses an admin query) | Calls `requireAdmin()` first and returns `{ ok: false, code: 'forbidden' }` before doing anything else. **This per action check is the real guard for actions.** Access and the middleware only see the path. |

The middleware gives the right status code for pages. The page and action checks are what keep the data safe if the middleware is skipped (a prefetch is excluded from it by the matcher, for example) or never sees the request (an action POSTed to another path). The check costs one signature verification with cached keys, so running it up to three times is fine. The middleware never hands its result to the page in a header, because that header could be forged.

The refusal page is one small piece of markup shared by the middleware and the page, with `<meta name="color-scheme" content="light dark">` and no scripts. Its copy is in the table at the end.

### The admin page and `setHidden` (the shape feature 8 builds on)

- **Route**: `/admin`, `src/app/admin/page.tsx`, a server component, `force-dynamic`. `src/app/admin/error.tsx` is the error boundary (spec 0003). The page, the labelled list and the table follow spec 0003. This spec builds only a thin version (the heading and the idea count) to prove the guard.
- **Action** `setHidden`, in `src/app/admin/actions.ts`, input `{ ideaId: string (uuid), hidden: boolean }`, validated with zod. It sends the wanted state, like `setVote`, so a retry is safe.
- **Result**: `AdminResult` is `{ ok: true; hidden: boolean }` or `{ ok: false; code }` with `code` one of `forbidden`, `invalid`, `not_found`, `server`.
- **Order inside the action**: `requireAdmin()`, then zod validation, then `setIdeaHidden`.
- **`setIdeaHidden`**: hide is `update ideas set hidden_at = coalesce(hidden_at, :now) where id = :id returning id` (hiding twice keeps the first time). Unhide is `set hidden_at = null where id = :id returning id`. No row returned gives `not_found`. Votes are never touched (spec 0002).
- **Logging**: `{ event, code, surface }` only, plus `ideaId8` (first 8 characters) on a write. Never the email.

Everything after the first line of feature 8 (the row UI, optimism, copy for success) stays in spec 0003. Anything feature 8 adds under `/admin` calls `requireAdmin()`.

### How the client handles a refusal

Access sessions end (24 hours, see the dashboard steps). If one ends while the admin page is open, the next action POST is answered by Access with a redirect to its login page, which the browser's `fetch` cannot follow across origins, so the action call throws. If the Worker itself refuses, the action returns `forbidden`. Both mean "signed out":

- `forbidden` or a thrown call on the admin page shows a row level `ErrorMessage`: "Your admin sign in has ended. Reload this page to sign in again." with a Reload button that reloads the page (Access then shows the login). No retry loop, no automatic reload.
- Any other failure keeps spec 0003's "Couldn't hide this idea." or "Couldn't show this idea." with Try again.

A thrown call cannot be told apart from a network failure, so the message names both: the sentence above is used for a thrown call and for `forbidden`, and the board refresh after an unknown outcome follows spec 0005's rule.

### Preview and local behaviour

- **Production**: the Worker secrets `ACCESS_AUD` and `ADMIN_EMAIL`, and `ACCESS_TEAM_DOMAIN`, all set as dashboard secrets.
- **Deployed previews**: the same check, with the preview application's audience from the preview base config (spec 0001). If no Access application covers a preview, `/admin` there is a 403 for everyone. That is the intended safe result, not a bug. Proof of the hide page on a preview needs the preview Access application (dashboard step 8); without it, feature 8 proves the page with the local end to end run and the unit tests.
- **Local and CI**: no Access in front. Tests use `ACCESS_LOCAL_JWKS` and a signed test token (AC-10). A developer who wants to open `/admin` in a browser sends the header with a header editing extension and a token from `pnpm access:token` (a small script that signs one with the local key).
- A new variable name, `ACCESS_LOCAL_JWKS`, is added to `.dev.vars.example` only. It must not appear in `wrangler.jsonc` (a test greps for it).

### Security model

- The identity comes from a verified token, never from a cookie or a form field.
- Refusals are all the same 403 body, so nothing tells an outsider whether an email, an audience or a key was wrong.
- CSRF: the token proves who is asking, not intent, so a cross site POST that carries the Access cookie would still pass the token check. Next.js' built in Origin check for server actions is the defence, and `serverActions.allowedOrigins` is verified on the deploy (AC-11, same as spec 0005).
- Replay: the token is short lived and checked for expiry. There is no extra nonce.
- Keys are fetched only from the validated team domain.
- Secrets: `ACCESS_AUD` and `ADMIN_EMAIL` are Worker secrets, never in the repo. The team domain is not secret.
- The `/admin` responses are never cached and never indexed (spec 0001), including the 403. `next.config.ts` `headers()` sets `Cache-Control: no-store` for `/admin/:path*` (which also matches `/admin`), and the middleware's 403 response and the page's refusal content carry the same header. Accepted and documented limit: after the admin signs out, the browser's back button or the Next.js router cache can still show a page that was already loaded in that tab until it is reloaded. It is the admin's own screen on the admin's own device, and every action still needs a valid token.

### Value sourcing

| Value | Source |
|---|---|
| Token | The `Cf-Access-Jwt-Assertion` request header only |
| Team domain | `ACCESS_TEAM_DOMAIN` (dashboard secret, production and previews, `.dev.vars` locally; no `wrangler.jsonc` var) |
| Audience | `ACCESS_AUD` (production secret, preview base config secret, `.dev.vars` locally) |
| Allowed email | `ADMIN_EMAIL` (production and preview secrets, `.dev.vars` locally) |
| Keys | `https://<team domain>/cdn-cgi/access/certs`, or `ACCESS_LOCAL_JWKS` only when `getAppEnv()` is not `production` and there is no `cf-ray` header |
| Admin proof | Returned by `requireAdmin()`, nowhere else |
| `now` for hide | The server clock, inside the action |

### Critical test scenarios

- **Verifier table** (verifies **AC-3**, **AC-4**, **AC-7**, **AC-9**): one row per token and config case in the criteria, using a local key set. Includes a service token, an `alg: none` token, a token with the right signature and the wrong audience, mixed case email, and a key fetch that fails once and then works, two concurrent requests with a cold cache (both succeed, no cross request error), and an unknown `kid` that triggers exactly one refetch (this also proves that a key rotation needs no deploy, **AC-7**).
- **Guard coverage** (verifies **AC-5**, **AC-6**): a test globs every file that starts with `"use server"` (not only `src/app/admin/actions.ts`), imports every export of the ones that use an admin query, and calls each with garbage input and no header, and expects `forbidden` (not `invalid`), with a database spy that was never touched. Type tests (`expectTypeOf`, no suppressions) assert that the admin queries take `Admin`. Two lint rules, each with a test that proves it fires: `no-restricted-imports` so only admin code (`src/app/admin/**` and `src/lib/access.ts`) may import `src/db/admin-queries.ts`, and `no-restricted-syntax` banning a type assertion `as Admin` anywhere outside `src/lib/access.ts`, so the proof cannot be forged with a cast.
- **Action from another path** (verifies **AC-5**): POST to `/` with the real `setHidden` action ID in the `Next-Action` header and no token, then assert `forbidden` and that nothing was written (a database read before and after).
- **Middleware** (verifies **AC-1**, **AC-8**): no token gives 403 with the no store and noindex headers and the refusal copy; a log spy sees only `{ event, surface, reason }`.
- **Local key guard** (verifies **AC-10**): `ACCESS_LOCAL_JWKS` is honoured with no `cf-ray` header and `getAppEnv()` not `production`, and ignored with a `cf-ray` header or in production. A preview smoke check sends `Host` and `X-Forwarded-Host` set to `localhost` with a locally signed token and expects 403.
- **Playwright**: an admin project (header set by global setup) loads `/admin`, with axe in both themes and widths; a no header project gets the 403 page and sees no idea text; a token signed by another key gets the 403; a POST with a foreign `Origin` is refused (verifies **AC-1**, **AC-2**, **AC-11**, **AC-12**).
- **Production check** (verifies **AC-13**) is done once after the dashboard steps, with screenshots in the PR. With no login, request the four URLs (`/admin/`, `/%61dmin`, `/admin?_rsc=x`, `/admin` with `RSC: 1`) and check that each answers with the Access login or a 403 and that no body contains idea text.

## Dashboard setup for Toyin (names only)

Michael relays these. Nothing here needs a secret in chat: values go into Worker secrets through the build task, and Toyin only reports the **team domain** (not secret) and confirms when the steps are done. Dwight or Jim need the **Application Audience tag** only as a Worker secret, set by someone with Cloudflare access (see step 6).

1. **Check the scope is accepted first.** In Cloudflare Zero Trust, open Access, Applications, Add an application, Self hosted. Try the destination `next-build.jnr4u2.workers.dev` with path `admin`. If it is accepted, go on. If it is refused, stop and tell Michael: the contingency is a custom domain on a zone Toyin owns (D1). Do not turn on the Worker level Access switch instead, because it locks the public board.
2. **Team name.** In Zero Trust, Settings, Custom Pages or General, find (or choose) the team name. The team domain is `<team name>.cloudflareaccess.com`. Tell Michael the team domain.
3. **Login method.** Settings, Authentication: keep One time PIN turned on. No identity provider is needed. One time PIN is the only way in, so before relying on it, sign in once and check that the PIN email arrives (spam folder included). If it does not, add a second login method before locking yourself out.
4. **Application.** Name it "Next Build admin". Session duration: 24 hours. One application with two destinations (not two applications): `next-build.jnr4u2.workers.dev` with path `admin`, and `next-build.jnr4u2.workers.dev` with path `admin/*`.
5. **Policy.** Name "Admin only", action Allow, include rule Emails with the admin email. Add no other rule (no Everyone, no email domain rule). Everyone else is blocked, because Access denies anyone who matches no Allow policy. Save the application.
6. **Audience tag and secrets.** Open the saved application, Overview, copy the Application Audience (AUD) Tag. In the Cloudflare dashboard, Workers, `next-build`, Settings, Variables and Secrets, add `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` and `ADMIN_EMAIL` as secrets (type Secret), once for production and once for previews (the preview base config, as in spec 0001). `ADMIN_EMAIL` is the same email as the policy. The audience tag is not truly secret, and the team domain is public, but they are kept as secrets so a deploy never has two places to disagree. Workers Builds deploys keep secrets set in the dashboard. Do not paste any value in chat or the repo.
7. **Remove the placeholder.** The build task deletes the empty `ACCESS_TEAM_DOMAIN` placeholder under `vars` (base and `previews`) in `wrangler.jsonc`, because a name set there and as a dashboard secret would collide. The team domain from step 2 is entered in step 6.
8. **Previews (optional, for hide page proof).** Try a second application "Next Build admin preview" (same policy and session). First option: in the destinations, choose the Workers destination types `preview_worker` (previews of the `next-build` Worker) or `all_preview_workers`, with the paths `admin` and `admin/*`. Only if those are not offered: the hostname wildcard `*-next-build.jnr4u2.workers.dev` with the same paths. If neither is accepted, skip it: previews then answer 403 on `/admin`, which is safe and is the default. If created, its AUD tag goes into the preview base config secret `ACCESS_AUD` and `ADMIN_EMAIL` (spec 0001), then onto each existing preview.
9. **Try it.** In a private window: the board opens with no login; `/admin` asks for the email and a code; the admin email reaches the admin page; a different email is denied. Also with no login, the four URLs `/admin/`, `/%61dmin`, `/admin?_rsc=x` and `/admin` with the header `RSC: 1` each get the Access login or a 403, and none shows an idea (Michael or Dwight checks this with a plain request).

## Build plan

Approach: Tracer Bullet (the project default). A thin thread first (the guard in front of a bare page), then the pieces around it.

1. **Verifier** (satisfies **AC-3**, **AC-4**, **AC-7**, **AC-8**): add `jose` (pin the exact current version), `src/lib/access.ts` with the config reader, `verifyAccessToken` and the cached key set, the `AccessRefusal` type, the logging rule, and the verifier table tests. Add the names to `.dev.vars.example` and the `ACCESS_TEAM_DOMAIN` var for previews.
2. **Proof and queries** (satisfies **AC-5**, **AC-6**): `requireAdmin()` and the `Admin` brand, `listIdeasForAdmin` and `setIdeaHidden` in `src/db/admin-queries.ts` with local D1 tests, `setHidden` and `AdminResult` and its zod input, the guard coverage test, the `no-restricted-imports` rule for `src/db/admin-queries.ts` and the `no-restricted-syntax` ban on `as Admin` outside `src/lib/access.ts` (each with a test that proves the rule fires).
3. **Middleware and refusal page** (satisfies **AC-1**, **AC-10**): the `/admin` check in `src/middleware.ts`, the shared refusal markup, `ACCESS_LOCAL_JWKS` with the `cf-ray` guard, `pnpm access:token`, and Playwright global setup with the admin and no header projects.
4. **The thin thread** (satisfies **AC-2**, **AC-9**, **AC-11**, **AC-12**, **AC-13**): `/admin` renders the heading and the idea count behind the check, `error.tsx`, the sign out message path. Deploy, then run dashboard steps 1 to 9 with Toyin and capture the production proof.
5. **Handoff**: the PR notes that feature 8 (`/develop hide spam`) builds `AdminRow`, the table and the list on this page and calls `setHidden`.

Each task is a commit or small group of commits in one PR, `/develop admin sign in`. Steps 1 to 3 need no dashboard work, so the build can start before Toyin does the dashboard steps (step 4 waits for them).

## Consequences

**Positive**:
- A wrong or missing Access setup cannot expose admin: the Worker refuses by default.
- A new admin query or action that forgets the check does not compile, and a test catches an action that skips it.
- No passwords, sessions or user table to own.
- Key rotation at Cloudflare needs no deploy.

**Negative / tradeoffs**:
- The token is verified up to three times per request. It is one signature check with cached keys, so the cost is small.
- If the dashboard refuses the `workers.dev` path (D1), production needs a custom domain first, and that change touches spec 0001, `NEXT_PUBLIC_SITE_URL` and `allowedOrigins`.
- Previews answer 403 on `/admin` unless a preview Access application exists, so hide page proof on a preview needs that extra dashboard step.
- Each failure looks the same to the admin (a 403 page), so a misconfigured secret is found from the logs (`reason`), not the screen.

**Neutral**:
- The build stays on `src/middleware.ts` (edge) for now. Renaming it to `proxy.ts` is a later follow-up, because `proxy.ts` runs on the Node runtime only, which OpenNext does not support for it yet.
- `middleware.ts` gains an admin branch beside the CSP code. A new dependency, `jose`, runs on Workers through Web Crypto.

## Follow-up

- [ ] **D1**: dashboard step 1 confirms the `workers.dev` path is accepted. Only if it is refused, switch to the custom domain contingency and update spec 0001's Auth row, `NEXT_PUBLIC_SITE_URL` and `allowedOrigins` in the same change (`/architect` update).
- [ ] Spec 0001 points here for the preview rule and says the preview base config secret holds the preview audience. If the wildcard preview application is skipped (step 8), note that previews answer 403 on `/admin` (`/architect` update to 0001).
- [ ] Spec 0003's copy table gains two keys: the refusal page copy and "Your admin sign in has ended. Reload this page to sign in again." with the Reload button. Add them in `/develop admin sign in`.
- [ ] Optional: a "Sign out" link on the admin page to `/cdn-cgi/access/logout`. Not in this spec because it changes the admin header in spec 0003. Ask Toyin whether they want it.
- [ ] Later: rename `middleware.ts` to `proxy.ts` once OpenNext supports it (it is Node only there). The admin check moves with it.
- [ ] `/audit` after the slice: note `requireAdmin`, the `Admin` proof and the three check places in `AGENTS.md`.
- [ ] Questions for Toyin: the session length (24 hours is recommended) and whether to try the preview application (step 8). Neither blocks the build.

## Rationale

**Options considered**

| Option | Idea | Why not (or why) |
|---|---|---|
| 1. Access in front, token verified in the Worker (chosen) | Edge login plus a signed token check on page and action | Toyin's choice, no passwords, and the Worker stays safe if Access is wrong |
| 2. Access only, trust the edge | No code check | One dashboard mistake or an open preview URL exposes admin. Spec 0001 already rejected this |
| 3. Own login (password or magic link) | Sessions and a user table in D1 | More code and more to secure for one admin. Rejected |
| 4. A shared secret in a header or URL | `?key=...` or a bearer secret | Leaks through logs and history, and no expiry. Rejected |
| 5. Trust `ctx.access` instead of the header | Skip our own token check | Undefined on some paths, unverified through OpenNext, and it does not pin the email. See the section above |
| 6. Check only in middleware | One place | A middleware bypass would expose everything. Next.js has had one. The page and action check cost almost nothing |

Why the check is also in the page and the action: a server action is a public POST endpoint, so it cannot depend on the page having been checked. Why one proof type: a rule that says "remember to check" is the weakest guard, and a type the compiler enforces holds every time.

Why the email is compared after the signature: the email is only trusted once the token is proven genuine, and the policy in Access is a second filter, not the only one.

Why not trust a header set by the middleware: a header can be forged by the client when the middleware does not run.

**References**

- Spec 0001 (Access, `jose`, config names, preview base config), spec 0002 (admin queries), spec 0003 (admin page), spec 0004 and 0005 (action style and Origin check), all in this repo.
- Cloudflare Access: validating the application token (`Cf-Access-Jwt-Assertion`, keys at `/cdn-cgi/access/certs`, audience tag in the application overview). Named from memory of the documentation, not re-fetched; confirm while building step 1.
- Cloudflare Workers, "Cloudflare Access": https://developers.cloudflare.com/workers/configuration/cloudflare-access/ (fetched 2026-11-17). Source for: `workers.dev` hostname and single path as valid application domains, hostname or path Access applying before Worker level Access, and `ctx.access` (undefined when Access did not authenticate, `getIdentity()`, `aud`, not passed through service bindings or the Static Assets router). It says nothing about wildcards or the team domain.
- Cloudflare Workers, Version URLs (previews): https://developers.cloudflare.com/workers/configuration/previews/ (fetched 2026-11-17). Access can protect Version URLs at the Worker or account level. Nothing about paths.
- Cloudflare Zero Trust, self hosted public application: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/ (fetched 2026-11-17). Says the domain must belong to an active zone. The Workers page above is newer and specific to `workers.dev`, so D1 follows it and keeps the custom domain as the contingency.
- Next.js authentication guidance: check authorization inside each server action and data access, not only in middleware.
