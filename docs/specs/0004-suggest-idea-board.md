# 0004. Slice 1: suggest an idea and see the board

**Date**: 2026-11-16
**Status**: Accepted
**Feature**: scope feature 5, "Suggest an idea and see the board" (Slice 1)

## Summary

This is the first thing a visitor can use: one page where anyone types an idea of up to 140 characters, adds it, and sees the list of ideas. It is the walking skeleton, so it runs end to end on Cloudflare Workers, from the browser to the database and back. Most decisions are already made: the data in spec 0002, the look and components in spec 0003, the stack in spec 0001. This spec only fills the gaps they leave open: what the post action accepts and returns, how the board page loads, the acceptance criteria, and the order to build in.

## Requirements

**User stories**:
- As a visitor, I want to write one short idea and add it so that the team can see what I would like built next.
- As a visitor, I want to see the ideas people have suggested so that I know what is already on the board.
- As a visitor who made a mistake, I want a clear message when my idea is empty or too long so that I know how to fix it.

**Built on** (this spec does not repeat them): spec 0001 (stack, folders, server actions, zod, CSP), spec 0002 (tables, text rules, voter cookie, `post` and `board` queries), spec 0003 (tokens, `IdeaForm`, `CharacterCounter`, `IdeaList`, `IdeaRow`, `EmptyState`, `ErrorMessage`, copy table, focus and announcements).

**Acceptance criteria** (each one can be checked on its own):
- **AC-1**: A visitor can add an idea of 1 to 140 characters (counted as code points, after the text rules of spec 0002). After the post the field is empty, the status region says "Idea added", and the idea is on the list without a manual reload.
- **AC-2**: An empty idea (or one that is only spaces or new lines) is refused with "Write an idea first.", and nothing is stored. The field is marked `aria-invalid` after the failed submit and the message is linked to it.
- **AC-3**: An idea over 140 code points is refused with "Ideas can be up to 140 characters. Yours is N over.", the typed text stays in the field, and nothing is stored. The server refuses it too (a request that skips the page gets the error code `too_long`). Raw input over 2000 characters gets its own code and message, never a negative "N over" (see the result table).
- **AC-4**: The server stores the normalized text (NFC, trimmed, whitespace collapsed to single spaces), never the raw text. A pasted idea with new lines becomes one line. An emoji counts as one character.
- **AC-5**: The board shows only visible ideas (`hidden_at` is null), at most 500, ordered by votes (highest first), then newest first, then `ideas.id` descending, so the order is always the same. With no votes yet this means newest first. Each row shows the idea text, an absolute UTC date, and a static vote chip with the count (not yet pressable).
- **AC-6**: An empty board shows the empty state from spec 0003 ("No ideas yet. Be the first to suggest what we build next.") with a "Write an idea" button that moves focus to the idea field.
- **AC-7**: If the board cannot be loaded (the database read throws), `error.tsx` shows "We couldn't load the ideas. Try again." with a Try again button that re-renders the page. No technical detail is shown.
- **AC-8**: If posting fails for an unexpected reason (database error, network down, a malformed answer), the visitor sees "We couldn't add your idea. Try again." in an `ErrorMessage` under the button, with a Try again button that sends the kept text again. The typed text is kept.
- **AC-9**: A post needs the voter cookie `nb_voter` from spec 0002. A first page load sets it (through `middleware.ts`). A post sent without a valid cookie is refused with the code `no_voter` and the text "Please reload the page and try again." Nothing is stored.
- **AC-10**: The stored idea keeps the poster's voter id in `author_voter_id`. Logs hold only `{ event, code, voter8, errorName }`: never the idea text, the full voter id, `error.message` or `error.cause` (a D1 error can contain both).
- **AC-11**: Pressing Add idea twice quickly stores one idea (the second press is ignored while the first is sending), and sending the same submission key again (a retry after a lost response) never stores a second idea. The field cannot be edited while a post is pending, so no typed text is lost.
- **AC-12**: The page has zero axe violations in light and dark, on desktop and phone widths. Keyboard only use works: Tab reaches the field, Enter submits, the empty state button moves focus to the field.
- **AC-13**: The page is live on Cloudflare Workers (the preview deploy of the PR is enough to prove it): the migration is applied and an idea posted on the deployed page appears in the list.

## Decision

**Chosen option**: Option 1, one server action (`postIdea`) and one server rendered page, with a no op abuse check as the seam for feature 9.

Reasons are in the Rationale below. In short: it is the smallest thing that satisfies spec 0001 (server actions and server components) and leaves feature 9 a single place to plug into.

## Feature design

### Post server action

File `src/app/actions.ts` (`'use server'`, server only). The vote and admin actions of later slices live in the same file.

**Input** (zod, in `src/lib/schemas.ts` so a test can import it):
- `submissionId`: validated by zod as `z.string().uuid()`. Missing or malformed gives `invalid`.
- `text`: a string. A raw cap of 2000 characters stops absurd payloads before any work is done (above it the code is `raw_too_long`, not `too_long`, because the raw length says nothing about how many characters the idea has after normalizing, so there is no honest "N over" to show). The text is then passed through `normalizeIdea()` from `src/lib/idea.ts`, and the normalized text must be 1 to `MAX_IDEA_LENGTH` code points (`ideaLength()`).
- Any other shape (missing field, not a string) gives `invalid`. `too_long` is only used when the normalized text is over 140 code points, and `raw_too_long` only above the raw cap, so the page's "N over" number is never negative.

**Result** (never throws for expected failures):

| Result | When |
|---|---|
| `{ ok: true }` | Idea stored |
| `{ ok: false, code: 'empty' }` | Empty after normalizing |
| `{ ok: false, code: 'too_long' }` | Normalized text over 140 code points |
| `{ ok: false, code: 'raw_too_long' }` | Raw text over 2000 characters |
| `{ ok: false, code: 'invalid' }` | Wrong shape (missing field, not a string) |
| `{ ok: false, code: 'no_voter' }` | Missing or malformed `nb_voter` cookie |
| `{ ok: false, code: 'rate_limited' }` | Reserved for feature 9 (`checkPost`), never returned in this slice |
| `{ ok: false, code: 'challenge_failed' }` | Reserved for feature 9 (`checkPost`), never returned in this slice |
| `{ ok: false, code: 'server' }` | Database or other unexpected error (caught and logged) |

The result type, with all nine outcomes, is exported from `src/lib/schemas.ts` as `PostResult`, and the page handles every code, so feature 9 adds no new page code beyond turning the checks on.

**Code, copy key and where it shows** (`src/lib/copy.ts` holds the keys; the strings are in spec 0003's table unless marked new):

| Code | Copy key | Text | Where it shows |
|---|---|---|---|
| `empty` | Validation, empty | Write an idea first. | Inline under the field, field gets `aria-invalid` |
| `too_long` | Validation, too long | Ideas can be up to 140 characters. Yours is N over. (N from `ideaLength` on the page) | Inline under the field, field gets `aria-invalid` |
| `raw_too_long` | Validation, raw too long (new) | That's too long to add. | Inline under the field, field gets `aria-invalid` |
| `invalid` | Server validation failure | That idea can't be added. Check it and try again. | `ErrorMessage` below the button |
| `no_voter` | Reload needed (new) | Please reload the page and try again. | `ErrorMessage` below the button |
| `rate_limited` | Rate limited (new) | You're adding ideas too fast. Wait a moment and try again. | `ErrorMessage` below the button |
| `challenge_failed` | Challenge failed (new) | We couldn't confirm you're not a robot. Try again. | `ErrorMessage` below the button |
| `server` (also anything thrown or malformed) | Submit failure | We couldn't add your idea. Try again. | `ErrorMessage` below the button |

`ErrorMessage` always carries a Try again button that sends the kept text again (for `no_voter` it first runs `await fetch('/', { credentials: 'same-origin' })`: `middleware.ts` sets `nb_voter` on that GET response, so awaiting it is a real completion condition, which `router.refresh()` is not because it returns nothing to wait on. Only then does it send the kept text again, with the same submission id). A field error has no Try again: the person edits the text. The copy table in `copy.ts` is checked with `satisfies Record<PostErrorCode, string>`, so a code without a string fails the type check.

**Client contract** (`IdeaForm`): it sends the raw field value, untouched (the server normalizes). The call is wrapped in `try` and `catch`, and anything thrown, a missing result, or a result that is not one of the nine shapes counts as `server`. While sending, the button reads "Adding…" and has `aria-disabled="true"`, and repeat presses are ignored. The typed text is kept on every failure. While a post is pending the field is `readOnly` with `aria-busy="true"` (not `disabled`, so focus stays and the text is still read out), so nothing can be typed that a success would then wipe. It is cleared only on `{ ok: true }`, and editable again when the request ends. **Submission key**: each attempt carries a `submissionId` (a `crypto.randomUUID()` made when the person first presses Add idea). A retry of the same text (Try again after a failure) reuses the same key. The key is replaced after a success and whenever the field value differs from the value last sent (the person edited after a failure). This makes a retry after a lost response safe: see the action.

**Order inside the action**:
1. Read the voter id with `getVoterId()` (below). Missing or not passing `isVoterId()` gives `no_voter`.
2. Parse and normalize the input. Failures give `empty`, `too_long`, `raw_too_long` or `invalid`.
3. Run the abuse check (the seam, below). In this slice it always passes.
4. Insert one row with the `post` query of spec 0002, written as `insert ... on conflict (id) do nothing` (a second request with the same key stores nothing and still counts as success, so a retry after a lost response never adds the idea twice): `id` is the `submissionId` from the input, `text` is the normalized text, `author_voter_id` is the voter id, `created_at` is `Date.now()`, `hidden_at` is null.
5. Log one structured line with exactly `{ event, code, voter8, errorName }`: `event` is `idea_posted`, `idea_refused` (any refusal, so spam patterns can be seen) or `idea_post_failed`; `code` is the result code (`ok` on success); `voter8` is the first 8 characters of the voter id; `errorName` is `error.name` for a caught error and absent otherwise. Never log the idea text, the full voter id, `error.message` or `error.cause`.
6. Return `{ ok: true }`.

### The seam for feature 9 (abuse protection)

Feature 9 adds Turnstile and the rate limit. To keep that change small, this slice adds one file now: `src/lib/abuse.ts`, exporting `checkPost(input: { voterId: string; ip: string | null; token?: string }): Promise<{ ok: true } | { ok: false; code: 'rate_limited' | 'challenge_failed' }>`.

- In this slice it returns `{ ok: true }` and does nothing else. It has a test that pins this, so feature 9 changes the test on purpose.
- `postIdea` calls it at step 3 with the voter id and the client IP (`CF-Connecting-IP`, read from the request headers, `null` when absent). The token field is not in the input schema yet.
- Feature 9 fills the function (Turnstile check, Workers Rate Limiting binding), adds an optional `token` to the input schema and the widget to `IdeaForm`. The two result codes, their copy and the page handling already exist (see the code table), so feature 9 only turns the checks on.
- The same function shape is later reused for voting (`checkVote`), which is out of scope here.

### Voter id

Spec 0002 sets the rule: `middleware.ts` creates the `nb_voter` cookie on the first page load, and server actions never create it. This slice builds both halves.

- **Middleware**: on any `GET` that is not a file request (the matcher skips `_next`, `favicon`, `robots`, `sitemap` and any path with a file extension), including the RSC requests and prefetches that `router.refresh()` and links make, if `nb_voter` fails `isVoterId()`, set a new `crypto.randomUUID()` cookie with the attributes from 0002 (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 400 days, and `Secure` unless `request.nextUrl.hostname` is `localhost` or `127.0.0.1`). The scaffold's middleware (CSP nonce) keeps working; this adds a cookie step to the same function.
- **`src/lib/voter.ts`**: exports `VOTER_COOKIE` (`nb_voter`), one predicate `isVoterId(value: unknown): value is string` (a UUID string, nothing else), and `getVoterId()`, which reads the cookie with `cookies()` from `next/headers` and returns it if `isVoterId()` passes, else `null`. Middleware and `postIdea` both use `isVoterId()`, so the two can never disagree about what a valid id is. `getVoterId()` never creates a cookie.
- **First request caveat**: on the very first page load the cookie is set on the response, so the server component of that same request does not see it yet. The board then uses an empty voter id, which means `voted` is false for every row. That is correct, because a new browser has voted for nothing.

### Board page

File `src/app/page.tsx`, a server component, dynamic (`export const dynamic = 'force-dynamic'`, because the data changes on every post and spec 0001 says the board is never prebuilt).

1. Read the voter id (`getVoterId()`, or the empty string when `null`).
2. Call `getBoard(voterId)` from `src/db/queries.ts`. This is the board query of spec 0002 with one addition: `ideas.id desc` as the last sort key, so two ideas with the same votes and `created_at` always come in the same order (see Follow-up for spec 0002's text). Limit 500, which returns `id`, `text`, `created_at`, `votes` (number) and `voted` (0 or 1, mapped to a boolean).
3. Map each row to what `IdeaRow` needs, including the date text formatted on the server (`16 Nov 2026, 14:05 UTC`, from 0003) so the client never formats a date.
4. Render `IdeaForm`, then either `EmptyState` (no rows) or `IdeaList`. `PageShell` is not rendered here.
5. No `try` and `catch` in the page. A throw reaches `src/app/error.tsx`.

`PageShell` (skip link, `<header>` with the `h1`, `<main id="main">`, the `#status` region) is rendered in `src/app/layout.tsx`, around `{children}`. That way `error.tsx` renders inside it and the error state keeps the landmarks, the `h1`, the skip link and `#status`. The shell shows no data, so it cannot throw on a database failure.

`src/app/error.tsx` is a client component (a Next.js requirement). It renders `ErrorMessage` with the board error text and a Try again button that calls `retry()`, the retry function this Next.js version (16.4.5) passes to `error.tsx` instead of `reset()`. `reset()` only re-renders the client boundary without fetching new server data, so it cannot recover a failed server read, while `retry()` re-fetches and re-renders the segment, and the boundary clears only if that render succeeds. If the database is still down the error shows again. After a successful retry, focus goes to the "Ideas" heading (an `h2` with `tabIndex={-1}`) when the list renders, and to the idea field (`id="idea-field"`) when the board is empty, because the heading is absent then (`EmptyState` replaces the list, as spec 0003 says).

`IdeaRow` shows the vote chip as a non interactive element (a `div`, not a button, with the count and a visually hidden "votes" or "vote" label). Slice 2 swaps it for `VoteButton` without moving the layout.

`IdeaForm` (a client component, as in 0003) calls `postIdea` inside a transition under the client contract above, then `router.refresh()` on success. The `EmptyState` button is a tiny client component that focuses the element with `id="idea-field"`.

**Limits we accept**: with more than 500 ideas that have votes, a brand new idea (zero votes) can fall outside the 500 and not show. Paging is out of scope until the board is that big (spec 0002).

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| `postIdea` | Idea `id` | The `submissionId` input (a `crypto.randomUUID()` made by `IdeaForm` per attempt, reused on retry) |
| `postIdea` | Idea `text` | The `text` input, after `normalizeIdea()` |
| `postIdea` | `author_voter_id` | `getVoterId()` (the `nb_voter` cookie, set by middleware) |
| `postIdea` | `created_at` | `Date.now()` on the server |
| `postIdea` | `hidden_at` | `null` (spec 0002) |
| `postIdea` | Client IP for the abuse seam | `CF-Connecting-IP` request header (`null` if absent) |
| Board | Rows, order, limit | `getBoard()` query (spec 0002) |
| Board | Vote count and `voted` | `getBoard()` query; the voter id comes from `getVoterId()` |
| Board | Date text on a row | `created_at` formatted on the server (`Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" })` plus the fixed text " UTC", giving `16 Nov 2026, 14:05 UTC`, spec 0003). `h23` makes midnight `00:05`, never `24:05` |
| Board | Counter text, over limit number | `ideaLength()` on the client from the typed value (spec 0003) |
| Page | All strings | `src/lib/copy.ts`, with new keys added by this spec: raw too long, reload needed, rate limited, challenge failed (see the code table) |

### Key invariants

- The text that is stored always went through `normalizeIdea()` on the server and is 1 to 140 code points. The database check (`length(text) between 1 and 140`) is the second line of defence.
- Only the server decides what is stored. The page's own check is for friendliness, not safety.
- A post never creates the voter cookie, and never succeeds without one.
- The board never shows a hidden idea and never returns more than 500 rows.

### Security model

Anyone can post and read (no login, spec 0001). The server action validates everything with zod, the text is stored as plain text and React escapes it on output (no HTML is ever rendered). Next.js' built in Origin check for server actions stays on. Abuse limits arrive with feature 9 through the seam above. No new environment variables or secrets are needed.

### Critical test scenarios

How each part is tested, with no test only switch in production code:
- **Database and action tests** (Vitest): `src/db/client.ts` exports `getDb()`; tests replace it with `vi.mock` to give a local D1 (normal cases) or a database that throws (failure cases). The action and the board page function are called directly.
- **`error.tsx` and layout** (Vitest with a component harness): render `layout.tsx` with `error.tsx` as its child, assert the landmarks, `h1`, skip link and `#status` are present, that Try again calls `retry()` (and never `reset()`), and that focus lands on the heading or the field as specified. Run `vitest-axe` on the harness for structure and names. Colour contrast is covered by the token contrast test (spec 0003) and by Playwright axe on the real pages.
- **Browser** (Playwright): the post flow, empty board, refusals, keyboard path, and axe on `/` in light, dark, desktop and phone for an empty and a populated board.

Scenarios:
- Happy path: post "Add dark mode" on a fresh browser, the cookie exists, the idea appears at the top of the list, verifies **AC-1**, **AC-5**, **AC-9**.
- Empty and spaces only (including a pasted new line): refused, nothing stored, verifies **AC-2**.
- 141 code points refused, 140 emoji accepted, 141 emoji refused, verifies **AC-3**, **AC-4**. Raw text of 2001 spaces then `x` returns `raw_too_long` and the page shows "That's too long to add." (no "N over"), verifies **AC-3**.
- Text with new lines and double spaces is stored on one line with single spaces: verifies **AC-4**.
- Direct action call without the cookie, or with a malformed cookie, returns `no_voter` and stores nothing; `isVoterId()` is the same function in middleware and the action: verifies **AC-9**.
- Middleware sets the cookie on a page GET and on an RSC GET, with `Secure` on a normal host and without it on `localhost` and `127.0.0.1`: verifies **AC-9**.
- Database throws inside the action (injected `getDb`): result `server`, `ErrorMessage` with Try again shown, text kept, Try again sends the same text again; a thrown action or a malformed result counts as `server`: verifies **AC-8**.
- Logging: refusals log `idea_refused`, a failure logs `idea_post_failed`, each with exactly `{ event, code, voter8, errorName }`. A test makes the database error message contain the idea text and the full voter id, and asserts neither appears anywhere in the captured log output: verifies **AC-10**.
- Board query throws (injected `getDb`): the page function rejects and `error.tsx` renders inside the layout, with Try again calling `retry()`: verifies **AC-7**.
- Retry after a lost response: the same `submissionId` posted twice stores one idea and both calls return `ok`; a different `submissionId` with the same text stores a second idea (no duplicate check, spec 0002): verifies **AC-1**, **AC-8**, **AC-11**.
- While a post is pending the field is `readOnly` with `aria-busy="true"`, and it is editable again after success or failure: verifies **AC-1**, **AC-11**.
- `no_voter` retry: the `fetch('/')` is delayed in the test, the resubmit does not start until it resolves, and it then sends the kept text with the same submission id: verifies **AC-9**, **AC-8**.
- A request with a missing or non UUID `submissionId` returns `invalid` and stores nothing: verifies **AC-1**.
- Posting twice with the same `submissionId` leaves exactly one row: verifies **AC-11**.
- After `retry()` succeeds, focus goes to the "Ideas" heading on a non empty board and to the idea field on an empty one: verifies **AC-7**, **AC-12**.
- Empty database shows the empty state, and its button focuses the field: verifies **AC-6**, **AC-12**.
- 501 visible ideas return 500; a hidden idea is not returned; two ideas with the same votes and `created_at` come in `id` descending order: verifies **AC-5**.
- Date text: `16 Nov 2026, 14:05 UTC` for the example, and an idea created at 00:05 UTC shows `00:05`, not `24:05`: verifies **AC-5**.
- `copy.ts` has a string for every post error code (type check with `satisfies`): verifies **AC-2**, **AC-3**, **AC-8**, **AC-9**.
- Double click on Add idea stores one row; the button shows "Adding…" with `aria-disabled="true"`: verifies **AC-11**.
- axe on `/` in light, dark, desktop and phone, with an empty board and a populated board, and on the `error.tsx` harness: verifies **AC-12**.
- Preview deploy: post on the deployed URL and see it listed: verifies **AC-13**.

## Build plan

Approach: Tracer Bullet (the project default). The first thing to build is a thin thread through every layer, plain and unstyled, running locally and on the preview deploy. After that it is thickened with the design from spec 0003. This slice includes tasks 1 and 2 of spec 0003 and the Slice 1 tasks of spec 0002, in this order:

1. [x] **Shared text rules and copy** (satisfies **AC-3**, **AC-4**): `src/lib/idea.ts` (`MAX_IDEA_LENGTH`, `normalizeIdea`, `ideaLength`) with its unit test (emoji, combining accents, pasted new lines), and `src/lib/copy.ts` with the strings of spec 0003 plus the four new keys, checked with `satisfies`. The thread needs these first.
2. [x] **Data and voter** (satisfies **AC-5**, **AC-9**, **AC-10**): `ideas` and `votes` tables in `src/db/schema.ts`, the first generated migration in `drizzle/`, the `post` and `getBoard` queries in `src/db/queries.ts` (with `ideas.id desc` last in the order) and tests on a local D1 through an injected `getDb()` (limit 500, hidden excluded, order, tie breaks), `src/lib/voter.ts` (`isVoterId`, `getVoterId`), and the cookie step in `middleware.ts` with its test.
3. [x] **The thin thread** (satisfies **AC-1**, **AC-9**, **AC-13**): `postIdea` in `src/app/actions.ts` with `src/lib/schemas.ts` (input and `PostResult`), the logging rule, and the no op `src/lib/abuse.ts` seam, `PageShell` in `layout.tsx` in its bare form, and a plain `src/app/page.tsx` (a bare form, a bare list, no styling) that posts and lists. Action tests include the logging test. Apply the migration to the preview D1 through the flow in spec 0001, deploy the preview, and prove one idea can be posted and seen there. Everything after this thickens a working thread.
4. [x] **Tokens, theme and announcements** (satisfies **AC-12**): the tokens, `@theme inline` mapping, `color-scheme`, Inter through `next/font`, the contrast test over the token values, and `src/lib/announce.ts` with its test (spec 0003 build task 1).
5. [x] **Components on the real page** (satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-8**, **AC-11**, **AC-12**): `PageShell` (styled), `IdeaForm` under the client contract, `CharacterCounter`, `ErrorMessage` (with Try again, used for the failed post states in the code table), `IdeaList`, `IdeaRow` with the static vote chip, and the server side date formatter (spec 0003 build task 2), replacing the plain markup. Component tests for the validation states, Enter submit (not while composing), repeat press, and each non field error showing in `ErrorMessage`.
6. [x] **Empty and error states** (satisfies **AC-6**, **AC-7**): `EmptyState` with the focus button, and `src/app/error.tsx` with `retry()` and the focus rule, tested in the harness above.
7. **Browser proof** (satisfies **AC-1** to **AC-3**, **AC-6**, **AC-9**, **AC-12**, **AC-13**): Playwright runs for the post flow, the empty board, over limit and empty refusal, the keyboard path, and axe in both themes and both widths, plus the preview check. Screenshots (light and dark, desktop and phone) go in the PR. Each CodeRabbit nit noted on PR #4 that applies to a UI slice is checked here.

Each task is a commit or a small group of commits in one PR, `/develop suggest an idea and see the board`.

## Consequences

**Positive**:
- The slice has no open decisions left for the builder: input, result codes, order of steps, voter handling and page flow are all named.
- Feature 9 only fills one function and adds one widget, with no change to `postIdea`'s shape.
- The thin thread is live on Workers early, so deploy problems show up in the first task, not the last.

**Negative / tradeoffs**:
- The first page view in a new browser shows `voted: false` for everything. That is correct, and costs nothing now, but slice 2 must remember it when it tests voting on the very first load.
- A post made right after the first page load in a browser that blocks cookies is refused with a reload message. That matches spec 0002 and is the price of one id per browser.
- A new idea with no votes can be pushed past the 500 cap on a huge board. Accepted until paging exists.
- There is no duplicate check (spec 0002), so two people can post the same idea.

**Neutral**:
- `middleware.ts` now does two jobs (CSP nonce and voter cookie). If it grows, split it into helpers.

## Follow-up

- [ ] Feature 9 (abuse protection): fill `checkPost`, add the optional `token` to the schema, and add the Turnstile widget. The result codes, copy and `ErrorMessage` handling already exist.
- [ ] Michael: spec 0002's board query text needs the same one line addition, `ideas.id desc` as the last `order by` key (this spec already uses it).
- [ ] Slice 2 (upvoting): replace the static chip with `VoteButton`, add `setVote` and `checkVote`, and test the first load in a fresh browser.
- [ ] `/audit` after this slice: note the files (`src/lib/idea.ts`, `src/lib/copy.ts`, `src/lib/voter.ts`, `src/lib/abuse.ts`, `src/app/actions.ts`) in root `AGENTS.md`.
- [ ] Questions for Toyin: none open.

## Rationale

**Options considered**

| Option | Idea | Why not (or why) |
|---|---|---|
| 1. One `postIdea` action and a server page, with an abuse seam (chosen) | The shape spec 0001 already picked, plus one stub file | Smallest thing that works, leaves one place for feature 9 |
| 2. A route handler (`POST /api/ideas`) with a fetch from the form | A classic JSON API | Spec 0001 chose server actions for writes. A route handler adds a second way to write and its own CSRF thinking, with nothing gained for one form |
| 3. Build all abuse protection into this slice | Turnstile and rate limit now | Feature 9 is a separate scope item with its own Toyin setup step (Turnstile keys). It would block the walking skeleton on an account task |

The voter cookie stays in middleware because spec 0002 chose it so that two quick first votes share one id. A server action that created the cookie itself would race with a second action in the same browser, so this slice follows 0002 and rejects a post without a cookie.

The abuse check is a real function that returns "ok", not a comment or a todo. A stub with a test is hard to forget, and `postIdea` already calls it in the right place, so feature 9 cannot be wired in a different order by accident (validate first, so a bad idea never uses up a Turnstile token or a rate limit slot, then check abuse, then write).

`error.tsx` rather than a `try` and `catch` in the page keeps one error path (spec 0003) and avoids a page that quietly shows an empty board when the database is down, which would invite posting into a broken service.

The Tracer Bullet order puts the deploy in task 3 because the riskiest unknowns of this stack (the D1 binding, migrations on Workers, the cookie in middleware on the edge) are all in the thread, and finding them before the styling work is cheaper.

**References**

- Spec 0001 (stack, server actions, CSP, preview flow), spec 0002 (data model, voter cookie, queries), spec 0003 (design system, components, copy), all in this repo.
- OWASP input validation guidance (validate on the server, treat the browser as untrusted).
