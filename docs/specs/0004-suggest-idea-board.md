# 0004. Slice 1: suggest an idea and see the board

**Date**: 2026-11-16
**Status**: Proposed
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
- **AC-3**: An idea over 140 code points is refused with "Ideas can be up to 140 characters. Yours is N over.", the typed text stays in the field, and nothing is stored. The server refuses it too (a request that skips the page gets the error code `too_long`).
- **AC-4**: The server stores the normalized text (NFC, trimmed, whitespace collapsed to single spaces), never the raw text. A pasted idea with new lines becomes one line. An emoji counts as one character.
- **AC-5**: The board shows only visible ideas (`hidden_at` is null), at most 500, ordered by votes (highest first) then newest first. With no votes yet this means newest first. Each row shows the idea text, an absolute UTC date, and a static vote chip with the count (not yet pressable).
- **AC-6**: An empty board shows the empty state from spec 0003 ("No ideas yet. Be the first to suggest what we build next.") with a "Write an idea" button that moves focus to the idea field.
- **AC-7**: If the board cannot be loaded (the database read throws), `error.tsx` shows "We couldn't load the ideas. Try again." with a Try again button that re-renders the page. No technical detail is shown.
- **AC-8**: If posting fails for an unexpected reason (database error, network down), the visitor sees "We couldn't add your idea. Try again." under the button, and the typed text is kept.
- **AC-9**: A post needs the voter cookie `nb_voter` from spec 0002. A first page load sets it (through `middleware.ts`). A post sent without a valid cookie is refused with the code `no_voter` and the text "Please reload the page and try again." Nothing is stored.
- **AC-10**: The stored idea keeps the poster's voter id in `author_voter_id`. The voter id and the idea text are never written to logs in full (only the first 8 characters of the voter id).
- **AC-11**: Pressing Add idea twice quickly stores one idea (the second press is ignored while the first is sending).
- **AC-12**: The page has zero axe violations in light and dark, on desktop and phone widths. Keyboard only use works: Tab reaches the field, Enter submits, the empty state button moves focus to the field.
- **AC-13**: The page is live on Cloudflare Workers (the preview deploy of the PR is enough to prove it): the migration is applied and an idea posted on the deployed page appears in the list.

## Decision

**Chosen option**: Option 1, one server action (`postIdea`) and one server rendered page, with a no op abuse check as the seam for feature 9.

Reasons are in the Rationale below. In short: it is the smallest thing that satisfies spec 0001 (server actions and server components) and leaves feature 9 a single place to plug into.

## Feature design

### Post server action

File `src/app/actions.ts` (`'use server'`, server only). The vote and admin actions of later slices live in the same file.

**Input** (zod, in `src/lib/schemas.ts` so a test can import it):
- `text`: a string. A raw cap of 2000 characters stops absurd payloads before any work is done (above it the code is `invalid`, not `too_long`, because the raw length says nothing about how many characters the idea has after normalizing). The text is then passed through `normalizeIdea()` from `src/lib/idea.ts`, and the normalized text must be 1 to `MAX_IDEA_LENGTH` code points (`ideaLength()`).
- Any other shape (missing field, not a string, or over the raw cap) gives `invalid`. `too_long` is only used when the normalized text is over 140 code points, so the page's "N over" number is never negative.

**Result** (never throws for expected failures):

| Result | When | What the page shows |
|---|---|---|
| `{ ok: true }` | Idea stored | Clear the field, announce "Idea added", `router.refresh()` |
| `{ ok: false, code: 'empty' }` | Empty after normalizing | "Write an idea first." |
| `{ ok: false, code: 'too_long' }` | Normalized text over 140 code points | "Ideas can be up to 140 characters. Yours is N over." (the page computes N itself from `ideaLength`) |
| `{ ok: false, code: 'invalid' }` | Wrong shape, or raw text over 2000 characters | "That idea can't be added. Check it and try again." |
| `{ ok: false, code: 'no_voter' }` | Missing or malformed `nb_voter` cookie | "Please reload the page and try again." |
| `{ ok: false, code: 'server' }` | Database or other unexpected error (caught and logged) | "We couldn't add your idea. Try again." |

The page already blocks `empty` and `too_long` before sending, so those two codes mostly come from a direct request. The page still handles every code, so a mismatch never shows a blank or a crash. A network failure (the action never answers) is handled by the page as `server`.

**Order inside the action**:
1. Read the voter id with `getVoterId()` (below). Missing gives `no_voter`.
2. Parse and normalize the input. Failures give `empty`, `too_long` or `invalid`.
3. Run the abuse check (the seam, below). In this slice it always passes.
4. Insert one row with the `post` query of spec 0002: `id` is `crypto.randomUUID()`, `text` is the normalized text, `author_voter_id` is the voter id, `created_at` is `Date.now()`, `hidden_at` is null.
5. Log one structured line (`event: "idea_posted"` or `"idea_post_failed"`, outcome code, first 8 characters of the voter id). The idea text is not logged.
6. Return `{ ok: true }`.

### The seam for feature 9 (abuse protection)

Feature 9 adds Turnstile and the rate limit. To keep that change small, this slice adds one file now: `src/lib/abuse.ts`, exporting `checkPost(input: { voterId: string; ip: string | null; token?: string }): Promise<{ ok: true } | { ok: false; code: 'rate_limited' | 'challenge_failed' }>`.

- In this slice it returns `{ ok: true }` and does nothing else. It has a test that pins this, so feature 9 changes the test on purpose.
- `postIdea` calls it at step 3 with the voter id and the client IP (`CF-Connecting-IP`, read from the request headers, `null` when absent). The token field is not in the input schema yet.
- Feature 9 fills the function (Turnstile check, Workers Rate Limiting binding), adds an optional `token` to the input schema and the widget to `IdeaForm`, and adds the two result codes with their copy. The `postIdea` code and its result type are already prepared for those two codes, so the page code only adds their messages.
- The same function shape is later reused for voting (`checkVote`), which is out of scope here.

### Voter id

Spec 0002 sets the rule: `middleware.ts` creates the `nb_voter` cookie on the first page load, and server actions never create it. This slice builds both halves.

- **Middleware**: on a `GET` of a page (the matcher skips `_next`, `favicon`, `robots` and `sitemap`, and any request with a file extension), if `nb_voter` is missing or not a valid UUID, set a new `crypto.randomUUID()` cookie with the attributes from 0002 (`HttpOnly`, `Secure` except on `localhost`, `SameSite=Lax`, `Path=/`, `Max-Age` 400 days). The scaffold's middleware (CSP nonce) keeps working; this adds a cookie step to the same function.
- **`src/lib/voter.ts`**: `getVoterId()` reads the cookie with `cookies()` from `next/headers` and returns the id if it is a valid UUID, else `null`. It never creates a cookie. It is server only.
- **First request caveat**: on the very first page load the cookie is set on the response, so the server component of that same request does not see it yet. The board then uses an empty voter id, which means `voted` is false for every row. That is correct, because a new browser has voted for nothing.

### Board page

File `src/app/page.tsx`, a server component, dynamic (`export const dynamic = 'force-dynamic'`, because the data changes on every post and spec 0001 says the board is never prebuilt).

1. Read the voter id (`getVoterId()`, or the empty string when `null`).
2. Call `getBoard(voterId)` from `src/db/queries.ts`. This is the board query of spec 0002 as written, limit 500, which returns `id`, `text`, `created_at`, `votes` (number) and `voted` (0 or 1, mapped to a boolean).
3. Map each row to what `IdeaRow` needs, including the date text formatted on the server (`16 Nov 2026, 14:05 UTC`, from 0003) so the client never formats a date.
4. Render `PageShell`, then `IdeaForm`, then either `EmptyState` (no rows) or `IdeaList`.
5. No `try` and `catch` in the page. A throw reaches `src/app/error.tsx`.

`src/app/error.tsx` is a client component (a Next.js requirement). It renders `ErrorMessage` with the board error text and a Try again button that calls `reset()`. After a successful reset, focus goes to the "Ideas" heading when the list renders, and to the idea field when the board is empty (the heading is absent then, as `EmptyState` replaces the list).

`IdeaRow` shows the vote chip as a non interactive element (a `div`, not a button, with the count and a visually hidden "votes" or "vote" label). Slice 2 swaps it for `VoteButton` without moving the layout.

`IdeaForm` (a client component, as in 0003) calls `postIdea` inside a transition, then `router.refresh()` on success. The `EmptyState` button is a tiny client component that focuses the element with `id="idea-field"`.

**Limits we accept**: with more than 500 ideas that have votes, a brand new idea (zero votes) can fall outside the 500 and not show. Paging is out of scope until the board is that big (spec 0002).

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| `postIdea` | Idea `id` | `crypto.randomUUID()` in the action |
| `postIdea` | Idea `text` | The `text` input, after `normalizeIdea()` |
| `postIdea` | `author_voter_id` | `getVoterId()` (the `nb_voter` cookie, set by middleware) |
| `postIdea` | `created_at` | `Date.now()` on the server |
| `postIdea` | `hidden_at` | `null` (spec 0002) |
| `postIdea` | Client IP for the abuse seam | `CF-Connecting-IP` request header (`null` if absent) |
| Board | Rows, order, limit | `getBoard()` query (spec 0002) |
| Board | Vote count and `voted` | `getBoard()` query; the voter id comes from `getVoterId()` |
| Board | Date text on a row | `created_at` formatted on the server (`Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })` plus the fixed text " UTC", giving `16 Nov 2026, 14:05 UTC`, spec 0003) |
| Board | Counter text, over limit number | `ideaLength()` on the client from the typed value (spec 0003) |
| Page | All strings | `src/lib/copy.ts`, with one new key added by this spec: "Reload needed", "Please reload the page and try again." |

### Key invariants

- The text that is stored always went through `normalizeIdea()` on the server and is 1 to 140 code points. The database check (`length(text) between 1 and 140`) is the second line of defence.
- Only the server decides what is stored. The page's own check is for friendliness, not safety.
- A post never creates the voter cookie, and never succeeds without one.
- The board never shows a hidden idea and never returns more than 500 rows.

### Security model

Anyone can post and read (no login, spec 0001). The server action validates everything with zod, the text is stored as plain text and React escapes it on output (no HTML is ever rendered). Next.js' built in Origin check for server actions stays on. Abuse limits arrive with feature 9 through the seam above. No new environment variables or secrets are needed.

### Critical test scenarios

- Happy path: post "Add dark mode" on a fresh browser, the cookie exists, the idea appears at the top of the list, verifies **AC-1**, **AC-5**, **AC-9**.
- Empty and spaces only (including a pasted new line): refused, nothing stored, verifies **AC-2**.
- 141 code points, and 140 emoji (accepted) versus 141 emoji (refused): verifies **AC-3**, **AC-4**.
- Text with new lines and double spaces is stored on one line with single spaces: verifies **AC-4**.
- Direct action call without the cookie returns `no_voter` and stores nothing: verifies **AC-9**.
- Database throws inside the action: `server` code, text kept in the field: verifies **AC-8**.
- Board query throws: `error.tsx` renders with Try again: verifies **AC-7**.
- Empty database shows the empty state, and its button focuses the field: verifies **AC-6**, **AC-12**.
- 501 visible ideas return 500; a hidden idea is not returned: verifies **AC-5**.
- Double click on Add idea stores one row: verifies **AC-11**.
- Log lines do not contain the idea text or a full voter id: verifies **AC-10**.
- axe on `/` in light, dark, desktop and phone, with an empty board, a populated board and an error: verifies **AC-12**.
- Preview deploy: post on the deployed URL and see it listed: verifies **AC-13**.

## Build plan

Approach: Tracer Bullet (the project default). The first thing to build is a thin thread through every layer, plain and unstyled, running locally and on the preview deploy. After that it is thickened with the design from spec 0003. This slice includes tasks 1 and 2 of spec 0003 and the Slice 1 tasks of spec 0002, in this order:

1. **Shared text rules and copy** (satisfies **AC-3**, **AC-4**): `src/lib/idea.ts` (`MAX_IDEA_LENGTH`, `normalizeIdea`, `ideaLength`) with its unit test (emoji, combining accents, pasted new lines), and `src/lib/copy.ts` with the strings of spec 0003 plus "Reload needed". The thread needs these first.
2. **Data and voter** (satisfies **AC-5**, **AC-9**, **AC-10**): `ideas` and `votes` tables in `src/db/schema.ts`, the first generated migration in `drizzle/`, the `post` and `getBoard` queries in `src/db/queries.ts` with tests on a local D1 (limit 500, hidden excluded, order, tie break), `src/lib/voter.ts`, and the cookie step in `middleware.ts` with a test.
3. **The thin thread** (satisfies **AC-1**, **AC-8**, **AC-9**, **AC-13**): `postIdea` in `src/app/actions.ts` with `src/lib/schemas.ts` and the no op `src/lib/abuse.ts` seam, and a plain `src/app/page.tsx` (a bare form, a bare list, no styling) that posts and lists. Apply the migration to the preview D1 through the flow in spec 0001, deploy the preview, and prove one idea can be posted and seen there. Everything after this thickens a working thread.
4. **Tokens, theme and announcements** (satisfies **AC-12**): the tokens, `@theme inline` mapping, `color-scheme`, Inter through `next/font`, the contrast test over the token values, and `src/lib/announce.ts` with its test (spec 0003 build task 1).
5. **Components on the real page** (satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-11**, **AC-12**): `PageShell`, `IdeaForm`, `CharacterCounter`, `ErrorMessage`, `IdeaList`, `IdeaRow` with the static vote chip, and the server side date formatter (spec 0003 build task 2), replacing the plain markup. Component tests for the validation states, Enter submit (not while composing), and repeat press.
6. **Empty and error states** (satisfies **AC-6**, **AC-7**, **AC-8**): `EmptyState` with the focus button, `src/app/error.tsx` with `reset()`, and the failed post message.
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

- [ ] Feature 9 (abuse protection): fill `checkPost`, add the optional `token` to the schema, add the Turnstile widget and the two new copy strings (`rate_limited`, `challenge_failed`) reusing `ErrorMessage`.
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
