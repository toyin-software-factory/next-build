# 0005. Slice 2: upvoting

**Date**: 2026-11-17
**Status**: Proposed
**Feature**: scope feature 6, "Upvoting" (Slice 2)

## Summary

A visitor can vote for an idea with one tap, and tap again to take the vote back. Each browser gets one vote per idea, the count updates right away, and the list re-sorts by votes. The rules are already set: the data and the "set vote" query in spec 0002, the button's look and behaviour in spec 0003, and the action style, result codes, logging and voter id in spec 0004. This spec only fills the gaps: the `setVote` action contract, the error codes and where they show, the rate limit seam for feature 9, the acceptance criteria and the build order. It needs no database migration.

## Requirements

**User stories**:
- As a visitor, I want to vote for an idea I like so that the team sees what matters most.
- As a visitor, I want to tap again to remove my vote so that I can change my mind.
- As a visitor, I want the count and the order to update right away, and a clear message if my vote did not save, so that I can trust what I see.

**Built on** (not repeated here): spec 0002 (`votes` table, "set vote" query rules, voter cookie), spec 0003 (`VoteButton`, `useOptimistic`, copy, announcements, focus), spec 0004 (`src/app/actions.ts`, `PostResult` style, logging rule, `isVoterId()`, `checkPost` seam, `getDb()` injection for tests, the `await fetch('/')` retry for `no_voter`, and the board order with `ideas.id desc` last).

**Acceptance criteria** (each can be checked on its own):
- **AC-1**: Pressing the vote button on an idea you have not voted for adds your vote. The count goes up by one, the button shows the voted state (`aria-pressed="true"`, filled arrow), the status region says "Vote added. Now N votes.", and the list re-sorts without a reload.
- **AC-2**: Pressing it again removes your vote. The count goes down by one, the button returns to not voted, and the status region says "Vote removed. Now N votes."
- **AC-3**: One browser can never count twice on one idea. Repeating the same wanted state (`on` twice, or `off` twice, in any number of requests, including parallel ones) leaves exactly the same result as sending it once. Two different browsers each add one vote.
- **AC-4**: A double tap or a press while a request is pending does nothing extra: only one request is sent for the press, and a retry or repeat can never flip the vote back.
- **AC-5**: The board order stays votes (highest first), then newest first, then `ideas.id` descending, after every change. Focus stays on the pressed vote button even when its row moves.
- **AC-6**: Voting on an idea that is hidden or does not exist is refused with the code `idea_unavailable`. Nothing changes in the database. The row shows "This idea is no longer on the board.", the board refreshes, and the row disappears.
- **AC-7**: A vote sent without a valid `nb_voter` cookie is refused with `no_voter` and stores nothing. Try again waits for `await fetch('/')` (which sets the cookie) and then sends the same wanted state again.
- **AC-8**: If saving fails (database error, network down, a malformed answer), the optimistic change is dropped, the row shows "Couldn't save your vote." in an `ErrorMessage` with Try again, and Try again sends the same wanted state again. The failure is announced once by the alert, not also in the status region.
- **AC-9**: The server's numbers always win. The count and voted state shown after a refresh are the board's own, even if the optimistic guess was different (someone else voted meanwhile). The count read out in the announcement is the one the server returned.
- **AC-10**: Logs hold only `{ event, code, voter8, errorName }` (as in spec 0004): never the full voter id, `error.message` or `error.cause`. Refusals are logged too.
- **AC-11**: A voted idea still shows as voted after a reload in the same browser, and a different browser sees it as not voted.
- **AC-12**: The vote button keeps the stable name "Upvote idea, N votes" with the idea text as its description, is at least 44 by 56 px, and the page has zero axe violations in light and dark, on desktop and phone widths. A keyboard only visitor can vote and unvote with Enter or Space.
- **AC-13**: Voting works on the Workers preview deploy of the PR: the vote is stored in the preview D1 and survives a reload.
- **AC-14**: `setVote` calls the abuse check `checkVote` after it validates the input and before it writes. In this slice `checkVote` always passes. The result codes `rate_limited` and the page handling for it already exist, so feature 9 only turns the check on.

## Decision

**Chosen option**: Option 1, one `setVote` server action that carries the wanted state and writes with one D1 batch, plus a no op `checkVote` seam for feature 9.

Reasons are in the Rationale below. In short: it reuses the idempotent "wanted state" design of spec 0002, needs no new table, and mirrors the shape of `postIdea` so the builder has nothing new to learn.

## Feature design

### The `setVote` server action

File `src/app/actions.ts` (the same file as `postIdea`, `'use server'`).

**Input** (zod, in `src/lib/schemas.ts` next to the post schema):
- `ideaId`: `z.string().uuid()`.
- `want`: `z.enum(['on', 'off'])`.
- Anything else (missing field, wrong type) gives `invalid`. There is no idempotency key: the wanted state itself makes every request safe to repeat.

**Result** (`VoteResult`, exported from `src/lib/schemas.ts`, never throws for expected failures):

| Result | When |
|---|---|
| `{ ok: true, count, voted }` | The vote is now in the wanted state. `count` and `voted` are the server's numbers after the change |
| `{ ok: false, code: 'invalid' }` | Wrong shape |
| `{ ok: false, code: 'no_voter' }` | Missing or malformed `nb_voter` cookie (`isVoterId()` fails) |
| `{ ok: false, code: 'idea_unavailable' }` | The idea is hidden or does not exist (the same code for both, so a visitor cannot tell which) |
| `{ ok: false, code: 'rate_limited' }` | Reserved for feature 9 (`checkVote`), never returned in this slice |
| `{ ok: false, code: 'server' }` | Database or other unexpected error (caught and logged) |

**Code, copy key and where it shows** (strings are in spec 0003's copy table unless marked new; the keys live in `src/lib/copy.ts`, and its `satisfies Record<VoteErrorCode, string>` check makes a code without a string fail the type check):

| Code | Copy key | Text | Where it shows |
|---|---|---|---|
| `idea_unavailable` | Idea hidden while voting | This idea is no longer on the board. | `ErrorMessage` in the row, no Try again (retrying cannot help); the board refreshes and the row goes |
| `no_voter` | Reload needed | Please reload the page and try again. | `ErrorMessage` in the row with Try again |
| `rate_limited` | Vote rate limited (new) | You're voting too fast. Wait a moment and try again. | `ErrorMessage` in the row with Try again |
| `invalid`, `server`, and anything thrown or malformed | Vote failure | Couldn't save your vote. | `ErrorMessage` in the row with Try again |

Try again sends the same wanted state (and for `no_voter` first runs `await fetch('/', { credentials: 'same-origin' })`, exactly as in spec 0004). Success messages ("Vote added. Now N votes." and "Vote removed. Now N votes.") are in spec 0003 and are built from the returned `count`.

**Order inside the action**:
1. Read the voter id with `getVoterId()`. Missing or failing `isVoterId()` gives `no_voter`.
2. Parse the input. Failure gives `invalid`.
3. Run `checkVote({ voterId, ip })` (the seam, below). In this slice it always passes.
4. Run the `setVote` query (below). A hidden or missing idea gives `idea_unavailable`.
5. Log one line with exactly `{ event, code, voter8, errorName }`: `event` is `vote_set`, `vote_refused` or `vote_failed`; `code` is the result code (`ok` on success); `voter8` is the first 8 characters of the voter id; `errorName` is `error.name` for a caught error and absent otherwise. Never the full voter id, `error.message` or `error.cause`.
6. Return `{ ok: true, count, voted }`.

### The `setVote` query

In `src/db/queries.ts`, server only, through `getDb()`. It follows the "Set vote" rules of spec 0002 and closes the gap between "check the idea is visible" and "write the vote" (a hide could land in between) by doing both in one D1 batch, which D1 runs as one transaction:

1. **Write**, conditional on the idea being visible:
   - `on`: `insert into votes (idea_id, voter_id, created_at) select :idea, :voter, :now where exists (select 1 from ideas where id = :idea and hidden_at is null) on conflict do nothing`.
   - `off`: `delete from votes where idea_id = :idea and voter_id = :voter and exists (select 1 from ideas where id = :idea and hidden_at is null)`.
2. **Read back**, in the same batch: `select (select count(*) from ideas where id = :idea and hidden_at is null) as visible, (select count(*) from votes where idea_id = :idea) as count, (select count(*) from votes where idea_id = :idea and voter_id = :voter) as voted`.

If `visible` is 0 the query returns `idea_unavailable` (the write did nothing). Otherwise it returns `{ count, voted }` where `voted` is true or false from the read back. The primary key (`idea_id`, `voter_id`) makes a second vote impossible, so parallel `on` requests end with one row. `created_at` is `Date.now()`. No schema change.

### The seam for feature 9 (abuse protection)

`src/lib/abuse.ts` (created by spec 0004) gets a second function, `checkVote(input: { voterId: string; ip: string | null }): Promise<{ ok: true } | { ok: false; code: 'rate_limited' }>`. In this slice it returns `{ ok: true }`, and a test pins that, so feature 9 changes the test on purpose. `setVote` already calls it at step 3 with the client IP (`CF-Connecting-IP`, `null` when absent), and the result type and page handling for `rate_limited` already exist.

Toyin chose hourly vote limits per visitor for feature 9. The numbers are feature 9's to decide, but one fact belongs in front of that spec now: the Workers Rate Limiting binding of spec 0001 only counts over short windows (10 or 60 seconds), so an hourly cap per visitor cannot use it alone. It needs a count kept in D1. Taking a vote back deletes its row, so counting rows would let someone toggle without limit; a per visitor counter would be needed, which is a schema change for feature 9 to plan (one schema PR at a time). Slice 2 does not depend on any of this.

### Client behaviour (fills the gaps in spec 0003's `VoteButton`)

- `IdeaRow` passes `ideaId`, `count` and `voted` (from the board query) to `VoteButton`, replacing the static chip of spec 0004. The layout does not move.
- `VoteButton` is a client component. On press, inside one `startTransition`: set the optimistic value to the wanted state, call `setVote({ ideaId, want })` with the wanted state the opposite of what is shown, then `router.refresh()`. The optimistic value stays until the refreshed props arrive (spec 0003).
- The call is wrapped in `try` and `catch`. Anything thrown, a missing result, or a result that is not one of the six shapes counts as `server`.
- While a request is pending for a row, presses on that button are ignored and the button has `aria-disabled="true"` (not `disabled`, so focus stays).
- On `{ ok: true }` the announcement uses the returned `count`. On any failure the optimistic value is dropped and the code table above decides the message. On `idea_unavailable` the board is refreshed too.
- Because the server action is idempotent, nothing needs the previous state of the request: a retry after a lost response simply sends the same wanted state again.
- `VoteButton` never calls `reset()` or `unstable_retry()`; those belong to `error.tsx`.

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| `setVote` | Which idea | `ideaId` input |
| `setVote` | Wanted state | `want` input (the opposite of the state shown, chosen by the page) |
| `setVote` | Voter | `getVoterId()` (the `nb_voter` cookie, set by middleware, spec 0002 and 0004) |
| `setVote` | Vote `created_at` | `Date.now()` on the server |
| `setVote` | Is the idea votable | `ideas.hidden_at is null`, checked inside the batch |
| `setVote` | New count and voted | The read back in the same batch |
| `setVote` | Client IP for the seam | `CF-Connecting-IP` header (`null` if absent) |
| Board | Count and voted per row | `getBoard()` (spec 0002) |
| Announcement | "Now N votes" | `count` returned by `setVote` |
| Button name | "Upvote idea, N votes" | Visible count from props, fixed words from `copy.ts` (spec 0003) |
| Row message | All strings | `src/lib/copy.ts` (one new key: vote rate limited) |

### Key invariants

- A voter has at most one vote per idea, enforced by the primary key, and a request only ever changes the voter named by the cookie.
- Only visible ideas can be voted on or unvoted, and that check and the write happen in one batch.
- A request is idempotent: repeating it never changes the result.
- Counts are never stored, always counted (spec 0002), and the page always shows the server's numbers in the end.

### Security model

Anyone with the voter cookie can vote, and only on their own behalf: the voter id comes from the cookie, never from the input. The input is validated with zod. Next.js' built in Origin check for server actions stays on. Clearing cookies gives a new voter, which is the accepted limit in spec 0002; feature 9 limits the rate. No new environment variables or secrets.

### Critical test scenarios

Test approach, as in spec 0004: Vitest with `getDb()` replaced through `vi.mock` (a local D1 for normal cases, a throwing one for failures); component tests for `VoteButton`; Playwright with two browser contexts for the cross browser cases.

- Happy path: vote, then unvote; count and `voted` come back right each time, verifies **AC-1**, **AC-2**.
- Query: `on` twice returns count 1 and one row; `off` twice returns count 0; `off` with no vote returns count unchanged and `voted` false, verifies **AC-3**.
- Query: two concurrent `on` requests from one voter leave one row; two voters each add one, verifies **AC-3**.
- Query: a hidden idea returns `idea_unavailable` for `on` and for `off`, and the table is unchanged; a missing idea does the same; a hide that lands between request and write cannot leave a new vote on a hidden idea, verifies **AC-6**.
- Action: missing or malformed cookie returns `no_voter` and writes nothing; bad `ideaId` or `want` returns `invalid`, verifies **AC-7**.
- Action: a throwing database returns `server`; the logged line contains only the four keys, and a database error whose message holds the voter id is not in the log, verifies **AC-8**, **AC-10**.
- Action: `checkVote` is called after validation and before the write, and always passes; `rate_limited` is handled by the page (a test injects it), verifies **AC-14**.
- `VoteButton`: a press sends the opposite of the shown state, repeat presses while pending send nothing, the count read in the announcement is the returned one, and props from the refresh replace a different optimistic guess, verifies **AC-1**, **AC-4**, **AC-9**.
- `VoteButton` failures: each code shows its message and Try again as in the table (none for `idea_unavailable`); Try again sends the same wanted state; the `no_voter` retry waits for a delayed `fetch('/')` before sending, verifies **AC-7**, **AC-8**.
- `copy.ts` has a string for every vote error code (type check), verifies **AC-6**, **AC-8**.
- Playwright: vote, reload, still voted; a second browser context sees the count but not the voted state; the list re-sorts and focus stays on the pressed button; keyboard only vote with Enter and Space, verifies **AC-1**, **AC-5**, **AC-11**, **AC-12**.
- Playwright axe on `/` with voted and not voted rows and a row error, in light, dark, desktop and phone, verifies **AC-12**.
- Preview deploy: vote on the deployed URL, reload, still voted, verifies **AC-13**.

## Build plan

Approach: Tracer Bullet (the project default). First a thin thread from a plain button to the database on the preview deploy, then the real button behaviour from spec 0003. No migration is needed (the `votes` table shipped in Slice 1), so this slice does not take the schema lane.

1. **Query** (satisfies **AC-3**, **AC-6**): `setVote` in `src/db/queries.ts` with the tests above on a local D1 through the injected `getDb()`: repeated `on`, repeated `off`, two voters, concurrent requests, hidden idea, missing idea.
2. **Action and seam** (satisfies **AC-7**, **AC-10**, **AC-14**): `setVote` action and `VoteResult` and the input schema in `src/lib/schemas.ts`, `checkVote` in `src/lib/abuse.ts`, the copy keys with the `satisfies` check, and the logging rule, with action tests.
3. **The thin thread** (satisfies **AC-1**, **AC-2**, **AC-11**, **AC-13**): a plain, unstyled vote button in `IdeaRow` that sends the wanted state, calls `router.refresh()` and nothing else (no optimism, no messages). Deploy the preview and prove a vote is stored and survives a reload.
4. **`VoteButton` behaviour** (satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-9**, **AC-12**): the chip from spec 0003 as a real button, `useOptimistic` held until the refreshed props arrive, the pending guard, the announcements from the returned count, and focus staying on the button. Component tests.
5. **Failure states** (satisfies **AC-6**, **AC-7**, **AC-8**): the row `ErrorMessage` for each code, Try again with the same wanted state, the `no_voter` retry through `fetch('/')`, and the refresh after `idea_unavailable`. Component tests.
6. **Browser proof** (satisfies **AC-5**, **AC-11**, **AC-12**, **AC-13**): the Playwright runs above (two contexts, keyboard, reload, axe in both themes and widths) and the preview check, with screenshots of voted and not voted rows, light and dark, desktop and phone, in the PR.

Each task is a commit or small group of commits in one PR, `/develop upvoting`.

## Consequences

**Positive**:
- The slice has no open decisions left for the builder: input, codes, copy, order of steps, the exact write and the failure behaviour are all named.
- No migration, so the slice can run in parallel with schema work.
- The wanted state design means no idempotency key is needed and a retry is always safe.
- Feature 9 turns on one function and nothing else.

**Negative / tradeoffs**:
- One more query per vote (the read back in the batch) and a board refresh after every vote. Fine at this size.
- A visitor whose idea is hidden while they vote sees a message and a vanishing row. That is intended, and rare.
- Clearing cookies still gives a fresh vote. Accepted in spec 0002.
- An hourly per visitor limit cannot be built on the rate limit binding alone (see the seam). That may cost feature 9 a small schema change.

**Neutral**:
- `actions.ts` and `abuse.ts` each gain a second function with the same shape as the first.

## Follow-up

- [ ] Feature 9 (abuse protection): fill `checkVote`. Toyin's hourly limit per visitor needs a count in D1 because the Rate Limiting binding only covers 10 or 60 second windows, and taking a vote back deletes its row, so plan a per visitor counter (a schema change, one schema PR at a time). Michael to tell Toyin.
- [ ] Slice 3: hiding an idea must keep its votes (spec 0002); `setVote` already treats a hidden idea as unavailable.
- [ ] `/audit` after this slice: note `setVote`, `checkVote` and the `VoteButton` pattern in `AGENTS.md`.
- [ ] Questions for Toyin: none open besides the hourly limit design above, which belongs to feature 9.

## Rationale

**Options considered**

| Option | Idea | Why not (or why) |
|---|---|---|
| 1. One `setVote` action with the wanted state and a one batch write (chosen) | `on` or `off` in, `{ count, voted }` out | Idempotent by design, no new table, same shape as `postIdea` |
| 2. A `toggleVote` action | The server flips the current state | A double tap or a retry after a lost response can flip the vote back. Spec 0002 already rejected this |
| 3. Check visibility first, then write in a second call | Simpler SQL | A hide can land between the two calls, leaving a vote on a hidden idea. The conditional write in one batch costs nothing extra |
| 4. Store a running `vote_count` on `ideas` | Faster board | A migration and a drift risk. Spec 0002 chose counting by query; revisit only if the board gets slow |

Why `idea_unavailable` is one code for hidden and missing: the visitor needs the same message and the same outcome either way, and one code leaks nothing about moderation.

Why validate before the abuse check, as in spec 0004: a malformed request should not use up a rate limit slot.

**References**

- Spec 0001 (stack, server actions, rate limiting), spec 0002 (vote rules and queries), spec 0003 (`VoteButton`), spec 0004 (action style, logging, voter id), all in this repo.
- Cloudflare Workers Rate Limiting binding: the `period` is 10 or 60 seconds (named from memory of the documentation, not re-fetched; feature 9 should confirm it).
- OWASP input validation guidance (validate on the server, treat the browser as untrusted).
