# 0007. Slice 4: abuse protection

**Date**: 2026-11-17
**Status**: Proposed
**Feature**: scope feature 9, "Abuse protection" (Slice 4)

## Summary

Posting and voting get three layers of protection, all without a sign up. First, a short burst limit (Cloudflare's Workers Rate Limiting binding) stops fast floods. Second, an hourly limit kept in D1 stops slow, steady abuse, per browser and per network address. Third, an invisible bot check (Cloudflare Turnstile) must pass before an idea is accepted, so a script that posts without a real browser is refused.

The network address is the key that makes the limits real, because a new browser id costs nothing (clear cookies). The address is never stored as is: only a salted hash, kept for at most two hours, is written. The limits fail open (a broken counter never blocks a real visitor), and the bot check fails closed (if it can't confirm, posting waits).

This spec fills the two seams that specs 0004 and 0005 left (`checkPost` and `checkVote` in `src/lib/abuse.ts`), sets the numbers, adds one small table (`rate_events`), and lists what Toyin does in the Cloudflare dashboard (names only). No page code changes beyond the Turnstile widget in `IdeaForm` and two new copy strings.

## Requirements

**User stories**:
- As a visitor, I want to post and vote without any extra step, so that the board stays easy to use.
- As Toyin, I want one person or script unable to flood the board or inflate vote counts, so that the ideas and counts stay honest.
- As a visitor who hits a limit, I want a friendly message and a way to try again later, so that I am not confused.

**Built on** (not repeated here): spec 0001 (Turnstile and the Rate Limiting binding as the chosen tools, config names `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, test keys outside production, the CSP that already allows `challenges.cloudflare.com`, `getAppEnv()`), spec 0002 (voter cookie, one schema PR at a time, add only migrations), spec 0003 (`ErrorMessage`, status region, copy table, look), spec 0004 (`postIdea` order, `PostResult` with `rate_limited` and `challenge_failed`, `checkPost` seam, `getDb()` injection, the logging rule), spec 0005 (`setVote` order, `VoteResult` with `rate_limited`, `checkVote` seam, no refresh on `rate_limited`).

**Acceptance criteria**:
- **AC-1**: Posting is limited per client address to 3 posts in 60 seconds (burst). The burst limit is approximate (the binding counts locally and syncs in the background), so four posts that arrive at the very same moment can all pass. A fourth post a little later in the same minute returns `{ ok: false, code: 'rate_limited' }`, and nothing is stored. The hourly limits (AC-2) are exact.
- **AC-2**: Posting is limited to 5 posts per hour per browser (voter id) and 15 per hour per client address. The sixth post from one voter id inside one clock hour is refused with `rate_limited`. A visitor who clears cookies between posts is still stopped by the address limit: the sixteenth post from one address in one hour is refused whatever the cookie.
- **AC-3**: Voting is limited per client address to about 30 votes in 10 seconds (burst, approximate like AC-1), and to 60 per hour per browser and 150 per hour per client address. A refused vote returns `{ ok: false, code: 'rate_limited' }`, writes nothing, and does not refresh the board (spec 0005 AC-14).
- **AC-4**: Taking a vote back counts as a vote for the limits, so toggling on and off cannot go on without limit. A repeated request for the same wanted state also counts.
- **AC-5**: A limit resets when the clock hour changes (fixed windows aligned to the hour). A request in a new hour is allowed again.
- **AC-6**: The raw client address is never stored, logged or returned. The only stored form is `HMAC-SHA256(ABUSE_SALT, address)` (first 16 bytes as hex), inside `rate_events`, and rows older than two hours are deleted.
- **AC-7**: IPv6 addresses use their first 64 bits as the key, so rotating inside one network does not escape the limit. A missing or malformed address (`null`) uses one shared key `none` with the per browser caps (5 posts and 60 votes per hour for everyone without an address).
- **AC-8**: A post needs a valid Turnstile token. No token: `challenge_failed` and no call to Cloudflare. A token Cloudflare rejects: `challenge_failed`. In production the answer must also carry the action `post_idea` and the site's hostname, or it is rejected.
- **AC-9**: The order inside `checkPost` is: burst limit, Turnstile check, hourly check. A request with a bad or missing token never uses an hourly slot, and a request already over the burst limit never calls Cloudflare's siteverify. `checkVote` runs burst, then the hourly check. Both run after validation (specs 0004 and 0005), so a malformed request never uses a slot.
- **AC-10**: The limits fail open. If the D1 hourly statement fails, the Rate Limiting binding throws or is missing, or `ABUSE_SALT` is missing in production, only the affected limit is skipped (a missing `ABUSE_SALT` skips the address-keyed hourly limit, not the whole request) and one `abuse_degraded` line is logged. The Turnstile check on posts still runs in every one of these cases. The write that follows is a real D1 write, so a real D1 outage still shows as `server`.
- **AC-11**: The bot check fails closed. If siteverify times out (5 seconds), answers with an error status, returns something that is not the expected shape, or `TURNSTILE_SECRET_KEY` is missing in production, the post is refused with `challenge_failed` and one `abuse_degraded` line is logged. Voting is never affected by Turnstile.
- **AC-12**: The widget is invisible when it can be: no extra control, no layout shift. If Cloudflare needs the visitor to interact, the widget appears above the Post button, the status region announces "One more step: complete the check below." once, and the widget works by keyboard. The form passes axe in both themes and widths with the widget absent and present.
- **AC-13**: Every send uses a fresh token. After each attempt (any result) the widget is reset. Try again waits for the new token (up to 10 seconds, and as long as the visitor is completing a shown check), and shows the `challenge_failed` message if none arrives, for example when the script is blocked.
- **AC-14**: The hourly decision is one atomic statement that checks both the browser count and the address count before it records the request, so two parallel requests cannot both take the last slot. A refused request writes nothing, so a capped browser cannot use up the address quota.
- **AC-15**: `rate_events` does not grow without limit: only allowed requests write a row, and each request deletes rows from before the previous hour.
- **AC-16**: A production check by hand after the dashboard steps (below): a normal post works with no visible step, the fourth quick post is refused with the friendly message, and a replayed post request with the token removed is refused.

## Decision

**Chosen option**: Option 1, a burst limit in the Rate Limiting binding plus an hourly limit in D1, and Turnstile on the post form only.

### D1. Where the hourly limit lives

The binding only counts over 10 or 60 seconds, so it cannot hold an hour. The hourly counts go in D1 (the database already on the request path), in a new table `rate_events` added by the Slice 4 build as one add only migration. Counting `votes` rows is not enough: taking a vote back deletes the row, so toggling would never be counted. This answers the data model question of spec 0002: yes, the table is needed, and the Follow-up asks for a one line pointer in 0002.

### D2. The limit key

Two caps per check, both must have room (one statement checks both, see below):
- **Per client address** (hashed): the hard limit, since a new browser id is free. Higher than the per browser caps, because homes, schools and offices share one address.
- **Per browser (voter id)**: the fair share, so one browser cannot use up everyone's quota on a shared address.

The burst binding is keyed by the address hash only. The address comes from `CF-Connecting-IP`, which Cloudflare sets on every request to a `workers.dev` host and overwrites if a client sends one. `X-Forwarded-For` is never read.

### D3. The numbers

| What | Burst (binding, per address) | Hourly per browser (D1) | Hourly per address (D1) |
|---|---|---|---|
| Post an idea | 3 per 60 seconds | 5 | 15 |
| Vote (on, off, or repeat) | 30 per 10 seconds | 60 | 150 |
| No address (`none`) | same burst, one shared key | normal | 5 posts, 60 votes, shared by everyone without an address |

Why these: a real person adds a few ideas an hour and votes through a short list, so 5 and 60 are rarely felt. 3 per minute covers an honest double click and a quick second idea. 30 per 10 seconds fits fast tapping down a list and stops scripts. The address caps are three times (posts) and 2.5 times (votes) the browser caps, so a few people on one network are fine. The numbers live in one exported constant `LIMITS` in `src/lib/abuse.ts`, so Toyin can ask for a change in one place.

### D4. Turnstile mode

Widget mode **Managed** in the dashboard, rendered with `appearance: 'interaction-only'`. Normally it is invisible and solves itself in the background. If Cloudflare is unsure about a real visitor, it shows a small check instead of silently refusing them. Fully Invisible mode was rejected because it has no fallback for a visitor wrongly doubted. The widget is on the post form only, as scope says. Votes use limits alone, because a challenge on every vote would break the one tap vote.

## Feature design

### Order of the checks

`postIdea`: read voter id, validate input, **`checkPost`**, write, log, return (spec 0004). Inside `checkPost`:
1. Burst: `POST_RATE_LIMITER.limit({ key: ipKey })`. Refused: `rate_limited`.
2. Turnstile: token present, then siteverify. Refused: `challenge_failed`.
3. Hourly: one atomic insert that checks the browser cap and the address cap together (below). Either at its cap: `rate_limited`, and nothing is written.

`setVote`: read voter id, validate, **`checkVote`** (burst with `VOTE_RATE_LIMITER`, then hourly), then the write (spec 0005). Cheap checks run first so a flood costs the least work, and a bot with no token cannot use up a real visitor's hourly slots.

### The hourly counter

The hourly count is the number of allowed requests recorded in the current clock hour. One row is written per allowed request, so the cap is checked and the row is added in one statement, with no separate undo.

New table `rate_events` (`src/db/schema.ts`), one migration, add only:

| Column | Type | Rules |
|---|---|---|
| `kind` | `text` not null | `post` or `vote` |
| `voter_key` | `text` not null | The voter id |
| `ip_key` | `text` not null | The address hash, or `none` |
| `window_start` | `integer` not null | Start of the clock hour in ms: `floor(now / 3600000) * 3600000` |

No primary key (SQLite keeps a row id). Indexes: `rate_events_voter_idx` on (`kind`, `voter_key`, `window_start`), `rate_events_ip_idx` on (`kind`, `ip_key`, `window_start`), and `rate_events_window_idx` on `window_start` for the cleanup. Queries live in `src/db/abuse-queries.ts` (server only, through `getDb()`).

One statement decides and records at once (AC-14):

```sql
insert into rate_events (kind, voter_key, ip_key, window_start)
select :kind, :voter, :ip, :window
where (select count(*) from rate_events
       where kind = :kind and voter_key = :voter and window_start = :window) < :voterLimit
  and (select count(*) from rate_events
       where kind = :kind and ip_key = :ip and window_start = :window) < :ipLimit
returning 1
```

A returned row means allowed, and the row is the record. No row means at least one cap was reached, and nothing was written. Both caps are checked before the row is added, in one statement, and D1 runs one write at a time, so two parallel requests cannot both take the last slot, and a refused request changes nothing. A browser stuck at its own cap therefore cannot use up the shared address quota. For the key `none`, `:ipLimit` is the per browser cap (5 posts, 60 votes), so everyone without an address shares one strict allowance.

The same `db.batch` also runs `delete from rate_events where window_start < :cutoff` with `cutoff = windowStart - 3600000`, so rows from before the previous hour go (AC-15). When nothing is old it deletes nothing. `now` is passed in, so tests control the clock. Rows are bounded by the caps, because only allowed requests write one. A fixed window lets a determined person use two windows back to back at an hour boundary (up to twice the cap in a short time); the burst limit still applies, so this is accepted.

### The key

`ipKey(ip: string | null, salt: string): Promise<string>` in `src/lib/abuse.ts`:
- Validate with zod (`z.ipv4()` or `z.ipv6()`). Not valid or `null`: key `none`.
- IPv4 mapped IPv6 (`::ffff:1.2.3.4`) is treated as the IPv4 address. Other IPv6 is expanded and cut to the first four groups (a /64).
- `HMAC-SHA256` with `ABUSE_SALT` through Web Crypto, first 16 bytes as 32 hex characters.

Outside production the salt is a fixed public test value in code, like the Turnstile test keys. In production a missing salt allows the request and logs `abuse_degraded` (AC-10). The salt is never logged. The hash is never logged either.

### Turnstile on the server

`verifyTurnstile({ token, ip, fetch, now })` in `src/lib/turnstile.ts`:
- No token, or a token that is not a non empty string up to 2048 characters: `challenge_failed`, no network call.
- `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`, form encoded: `secret`, `response`, and `remoteip` when the address is valid. `AbortSignal.timeout(5000)`.
- Parse the answer with zod. `success` must be `true`. In production also `action === 'post_idea'` and `hostname` equal to the hostname of `getSiteUrl()` (test keys return a fixed fake hostname, so this check is production only).
- Anything else (timeout, non 2xx, bad shape, thrown error) is a refusal, and logs `abuse_degraded` when it was not Cloudflare saying no.
- Secret and site key: `TURNSTILE_SECRET_KEY` (server, production) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public, production). Outside production the code uses the published test keys already in `src/lib/env.ts`. Both are read through new getters in `src/lib/env.ts` (`getTurnstileSecret()`, `getTurnstileSiteKey()`), never `process.env` elsewhere.
- Tokens are single use and expire after 5 minutes, so every attempt needs a fresh one (AC-13). Retrying the same token is never attempted.

### Turnstile in the form

`TurnstileWidget` (client component, one job: produce a token), used inside `IdeaForm`:
- Loads `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` with `next/script`, using the request nonce (spec 0001 CSP already allows the host and the frame).
- Renders with `sitekey`, `action: 'post_idea'`, `appearance: 'interaction-only'`, `theme: 'auto'`. Callbacks: a token callback stores the token (a ref, not state); `expired-callback` and `error-callback` clear it; `before-interactive-callback` sets the status region message "One more step: complete the check below."; `after-interactive-callback` clears it.
- Exposes `getToken(): Promise<string | null>`: the current token, or the next one. The 10 second limit counts only while no challenge is being shown. When `before-interactive-callback` has fired, the wait has no time limit and ends on the token, on `error-callback` or on `expired-callback` (then `null`), so a visitor who is still completing the check is never cut off. If the script never loads or never sends a token or a callback within 10 seconds, the result is `null`. `IdeaForm` calls it inside the submit handler before `postIdea`. `null` shows the `challenge_failed` message with Try again, without calling the server.
- After every attempt, whatever the result, it calls `turnstile.reset()`. The widget has a reserved container that has no height while invisible, so nothing shifts.
- `postIdea`'s input schema gains `token: z.string().min(1).max(2048).optional()` (optional in the schema so the code table of spec 0004 stays the one place codes are decided; `checkPost` refuses a missing token itself).

### What the visitor sees

| Code | Text | Where |
|---|---|---|
| `rate_limited` (post) | You've reached the posting limit for now. Please try again in a little while. | `ErrorMessage` below the button (spec 0004) |
| `rate_limited` (vote) | You've reached the voting limit for now. Please try again in a little while. | `ErrorMessage` in the row (spec 0005), no board refresh |
| `challenge_failed` | We couldn't confirm you're not a robot. Try again. | Unchanged from spec 0004 |
| (status region, new) | One more step: complete the check below. | Announced once when the widget needs interaction |

The two `rate_limited` strings replace the "too fast. Wait a moment" strings in specs 0004 and 0005, because an hourly limit can last longer than a moment. Both messages say what happened and keep Try again, so nobody is stuck. Spec 0003's copy table is where the strings live; `src/lib/copy.ts` holds the keys with its existing `satisfies` check. Try again after a refusal sends the same text with the same submission id and a fresh token.

### Failure behaviour

| What fails | Result | Why |
|---|---|---|
| D1 counter statement throws | Allowed, `abuse_degraded` logged | A limit must never lock out real visitors, and the write that follows needs D1 anyway |
| Rate Limiting binding missing or throws | Allowed, `abuse_degraded`; the hourly counters still apply | The binding is best effort and per Cloudflare location |
| `ABUSE_SALT` missing in production | Allowed, `abuse_degraded` | A missing setup step must not take the site down. The production check catches it |
| Siteverify slow, down or malformed | Refused with `challenge_failed`, `abuse_degraded` | The bot check is the only defence against scripted posting, so it fails closed. Posting pauses, reading and voting go on |
| `TURNSTILE_SECRET_KEY` missing in production | Refused with `challenge_failed`, `abuse_degraded` | Same reason, and the production check catches it |
| Widget script blocked or no token in 10 s | The form shows the `challenge_failed` message | The server is not called |

### Logging

`abuse.ts` writes its own lines, separate from the action lines of specs 0004 and 0005, which stay as they are. Exactly these keys: `event` (`abuse_refused` or `abuse_degraded`), `kind` (`post` or `vote`), `reason`, `voter8` and `errorName` (only when an error was caught). `reason` is one of `burst`, `hourly_voter`, `hourly_ip`, `challenge_missing`, `challenge_rejected`, `challenge_unavailable`, `counter_error`, `binding_error`, `not_configured`. Never the address, the hash, the salt, the token, the idea text, `error.message` or the full voter id.

### Local, CI and previews

- **Local and CI**: the published Turnstile test keys and the fixed test salt, so nothing needs setting. The Rate Limiting binding runs in the local Workers runtime (`pnpm preview`).
- **Previews**: the same test keys and the preview base config's own rate limit namespaces (spec 0001). A preview's bot check always passes by design (test keys), so previews are not bot protected. They use the separate preview database, so this is accepted.
- **Playwright**: the browser script from `challenges.cloudflare.com` is stubbed with `page.route` (a tiny `window.turnstile` that calls the token callback with the dummy token `XXXX.DUMMY.TOKEN.XXXX`), so CI needs no outside page. The server still calls siteverify with the test secret, so the real server path runs. Each Playwright context sends its own `CF-Connecting-IP` header and a fresh cookie, so tests never share counters (Cloudflare overwrites that header in production, so this is test only). The limit tests use their own addresses.
- Cloudflare's test widget might render visibly even with `interaction-only`. The builder confirms how it renders and keeps axe green either way.

### Security and privacy

- The address is only ever a salted hash, kept at most two hours. It is not used for analytics, and there is no analytics promise on the page. Each `rate_events` row links a voter id to an address hash and an hour, so for up to two hours it records that browser's recent post and vote activity (vote and unvote events stay even after the vote row is deleted) and which network it used. That link is new data, not covered by the voter id already in D1. It is deleted with the row after two hours, is never shown or exported, and is used only for the limits.
- The limits are approximate against a determined attacker with many addresses. That is accepted: the goal is to stop floods and casual scripts, and Toyin can hide spam (feature 8). Turnstile plus the database rules are the real defence (spec 0001).
- Turnstile checks the post form only. A script that votes is limited by the burst and hourly counters, and the one vote per browser rule still stands.
- `remoteip` goes only to Cloudflare, who already see the connection.

### Critical test scenarios

- **Unit, `src/lib/abuse.test.ts`**: `ipKey` for IPv4, compressed IPv6, two addresses in one /64, IPv4 mapped, `null` and garbage, and that the same input gives the same hash and a different salt a different one (AC-6, AC-7). `windowStart` at hour edges (AC-5). Each check refused and allowed at the exact cap with an injected clock, limiter and local D1: post at 5 and 6 per voter, at 15 and 16 per address with changing voter ids, vote at 60 and 61, the address cap with changing voter ids, unvote counting, a new hour resetting (AC-2, AC-3, AC-4, AC-5). Parallel calls with one slot left allow exactly one, and a voter at the cap who keeps voting writes no row, so the address count stays the same and other voters on that address still pass, including when the voter is at 59 and the address is at 149 (AC-14). A slow interactive challenge past 10 seconds still yields the token (AC-13). The order: a failed token leaves the hourly rows unchanged and an over burst request makes no fetch call (AC-9). Fail open cases: D1 hourly error, binding throw, missing salt in production (AC-10). Cleanup deletes rows from before the previous hour and keeps the current and previous hour (AC-15). Logs contain only the listed keys (AC-6).
- **Unit, `src/lib/turnstile.test.ts`** (injected `fetch`): no token, empty and oversize tokens make no call; `success: false`; wrong action and wrong hostname in production only; timeout, 500, bad JSON and thrown errors fail closed; missing secret in production (AC-8, AC-11).
- **Action tests**: `postIdea` and `setVote` return `rate_limited` and `challenge_failed` in the spec 0004 and 0005 shapes, validation still runs first, and the existing pinned always passes tests are changed on purpose (AC-9).
- **Component tests**: `TurnstileWidget` and `IdeaForm` with a fake `turnstile`: token wait, null after 10 seconds, reset after each attempt, status message for the interactive state, Try again waiting for a fresh token (AC-12, AC-13).
- **Playwright and axe**: the stubbed script, a normal post and vote work, the fourth quick post shows the friendly message, a vote burst shows the row message with no refresh, axe in both themes and widths with the widget absent and present (AC-1, AC-3, AC-12).
- **Production check by hand** (verifies **AC-16**): see dashboard step 7.

## Dashboard setup for Toyin

Michael relays these steps. Names only, no values in chat or in the repo.

1. In the Cloudflare dashboard open **Turnstile** and choose **Add widget**. Name it "Next Build post form". Hostname: `next-build.jnr4u2.workers.dev`. Widget mode: **Managed**. Pre clearance: off. Create it.
2. Copy the **Site Key** (public) and the **Secret Key** (private). Keep the secret key out of chat.
3. Open **Workers Builds** for `next-build`, Settings, Build, **Variables and secrets**, and add the build variable `NEXT_PUBLIC_TURNSTILE_SITE_KEY` with the site key. It is public, and it is baked in at build time, so it needs a new build.
4. Open the Worker `next-build`, Settings, **Variables and Secrets**, and add the secret `TURNSTILE_SECRET_KEY` with the secret key (type Secret).
5. On the same page add the secret `ABUSE_SALT`. Use a long random value, for example 32 random bytes as hex from a password manager or `openssl rand -hex 32`. Never reuse another secret. Previews and local runs do not need it.
6. Redeploy production (a push to `main` or a manual build), so the site key is built in.
7. Try it (Michael or Toyin, two minutes): open the live site, post one idea (no visible step expected). Then post three more quickly, and the fourth should show "You've reached the posting limit for now." Hide the test ideas on the admin page. For the bot check, in the browser tools copy the post request as cURL, remove the `token` from the body and send it: it must be refused.

Nothing is needed for the Rate Limiting binding: its namespaces and limits live in `wrangler.jsonc`.

## Build plan

Tracer Bullet: the thinnest working thread first (a limit that refuses end to end), then the bot check, then the form widget. One schema PR at a time (the lead sequences it).

1. **Hourly limit thread** (satisfies **AC-2**, **AC-5**, **AC-6**, **AC-7**, **AC-14**, **AC-15**): the `rate_events` table and migration (`pnpm db:generate`, commit `drizzle/`), `abuse-queries.ts`, `ipKey`, `windowStart`, `ABUSE_SALT` handling, tests against local D1. A pointer line goes into spec 0002 (see Follow-up).
2. **Limits wired** (satisfies **AC-1**, **AC-3**, **AC-4**, **AC-9**, **AC-10**): fill `checkPost` (burst and hourly only at first) and `checkVote`, change `wrangler.jsonc` limits (post 3 per 60, vote 30 per 10, base and `previews` blocks), the two new copy strings, the logging rule, and change the pinned always passes tests on purpose.
3. **Bot check on the server** (satisfies **AC-8**, **AC-9**, **AC-11**): `turnstile.ts`, the env getters, the optional `token` in the schema, `checkPost` order with siteverify, unit tests with an injected `fetch`.
4. **Widget in the form** (satisfies **AC-12**, **AC-13**): `TurnstileWidget`, `IdeaForm` wiring, the status message, the Playwright stub and distinct address headers, axe in both themes and widths.
5. **Setup and proof** (satisfies **AC-16**): dashboard steps by Toyin, names added to `.env.example` and `.dev.vars.example` (`ABUSE_SALT`), the production check, a `docs/feature-map.md` line.

## Consequences

**Positive**:
- Floods and casual scripts are stopped at three layers, and a real visitor sees no extra step.
- Clearing cookies no longer resets the limits, and no raw address is ever kept.
- A broken hourly check or binding never locks out visitors.

**Negative / tradeoffs**:
- Every allowed post and vote now writes one `rate_events` row (plus three index writes), and a refused one writes nothing. On the free D1 plan (100,000 rows written per day) that is fine for a small board, but it is the first cost to watch if the board gets busy. Moving the hourly counters to a Durable Object would be the next step.
- People behind one shared address share the address caps, and the hourly cap can last up to an hour. The message says to try later.
- Fixed hourly windows allow a short double burst at an hour boundary.
- Previews are not bot protected (test keys).
- Turnstile needs the `challenges.cloudflare.com` script. A visitor who blocks it cannot post (voting still works); the form says so with the existing message.

**Neutral**:
- `abuse.ts` gains real logic and a second file `turnstile.ts`. The seam shapes of specs 0004 and 0005 do not change.

## Follow-up

- [ ] Spec 0002: add a one line pointer to this spec for the `rate_events` table (the data model's "add only" migration for feature 9). `/architect` update, or Michael folds it in.
- [ ] Specs 0003, 0004 and 0005: replace the "too fast. Wait a moment" strings with the two `rate_limited` texts above, and add the new status message to spec 0003's copy table. Same owner as above.
- [ ] Spec 0001 config table: add `ABUSE_SALT` (secret, production only, test value elsewhere).
- [ ] Root `AGENTS.md` "Config names" line: add `ABUSE_SALT` (`/sync` after the build).
- [ ] Revisit the numbers after a week of real traffic (the `abuse_refused` logs show which limit fires).
- [ ] If the board gets busy: move the hourly limit to a Durable Object.

## Rationale

**Options considered**

1. **Burst limit in the binding plus hourly limit in D1, Turnstile on posting (chosen).** The binding is the cheapest first filter, D1 holds the hourly count, and Turnstile stops scripts. Matches Toyin's pick and the portfolio's tools. Costs one small table.
2. **Binding only.** No migration, but it cannot count an hour (10 or 60 second windows only) and it is per Cloudflare location, so Toyin's hourly limits would not exist. Rejected.
3. **Counters in a Durable Object.** Exact and fast, but a new product, a new binding and a new deploy concern for a board this size. Kept as the follow up if D1 writes become a cost.
4. **Key on the cookie only.** Simplest, but clearing cookies resets it, so it stops nobody who is trying. Rejected for that reason (the address key is the point).
5. **Store the raw address.** Easier to debug, but it keeps personal data we do not need. A salted hash gives the same limit with nothing to leak.
6. **Turnstile in fully Invisible mode.** No visible step ever, but no fallback for a wrongly doubted visitor. Managed with `interaction-only` is invisible almost always and has a way through.

Why the bot check is fail closed and the limits fail open: a limit error should never cost a real visitor a post, but if the bot check could be skipped by making it fail, the check would protect nothing. Posting pausing for a short outage is a small cost.

Why check order is cheap first: the burst limit is free, siteverify is a network call, and the D1 counters are writes. Doing the free check first keeps a flood cheap, and doing siteverify before the counters means a script without a token cannot use up a real visitor's hourly slots.

## References

- Workers Rate Limiting binding (10 or 60 second periods, per location, approximate): https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Turnstile client side rendering (explicit render, `appearance`, callbacks, `reset`): https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- Turnstile server side validation (siteverify, single use, 5 minute expiry, 2048 character limit, `action` and `hostname` in the answer): https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Turnstile widget modes (Managed, Non interactive, Invisible): https://developers.cloudflare.com/turnstile/concepts/widget/
- Turnstile test keys and dummy token: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
- `CF-Connecting-IP`: https://developers.cloudflare.com/fundamentals/reference/http-headers/
- D1 SQL statements (upsert and `RETURNING`) and pricing (rows written): https://developers.cloudflare.com/d1/ 
- Specs 0001 to 0006 in this repo.
