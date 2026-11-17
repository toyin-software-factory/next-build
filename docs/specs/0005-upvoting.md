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
- **AC-1**: Pressing the vote button on an idea you have not voted for adds your vote. The count goes up by one, the button shows the voted state (`aria-pressed="true"`, filled arrow), the status region says "Voted. Now N votes." (chosen from the returned `voted`, which is true), and the list re-sorts without a reload.
- **AC-2**: Pressing it again removes your vote. The count goes down by one, the button returns to not voted, and the status region says "Not voted. Now N votes." (chosen from the returned `voted`, which is false).
- **AC-3**: One browser can never count twice on one idea. Repeating the same wanted state (`on` twice, or `off` twice, in any number of requests, including parallel ones) leaves exactly the same result as sending it once. Two different browsers each add one vote.
- **AC-4**: A double tap or a press while a request is pending does nothing extra: only one request is sent for the press, and repeating the same request (a double tap, a duplicate delivery) can never flip the vote back.
- **AC-5**: The board order stays votes (highest first), then newest first, then `ideas.id` descending, after every change. Focus stays on the pressed vote button even when its row moves.
- **AC-6**: Voting on an idea that is hidden or does not exist is refused with the code `idea_unavailable`. Nothing changes in the database. The row shows "This idea is no longer on the board." briefly, the board refreshes, and the row disappears. Because the row (and any alert inside it) goes away on the refresh, this one message is announced through the status region instead of an alert, and focus moves to the "Ideas" heading (or to the idea field when the board is now empty), as `error.tsx` does. This is the one exception to spec 0003's rule that failures use the alert only.
- **AC-7**: A vote sent without a valid `nb_voter` cookie is refused with `no_voter` and stores nothing. Try again waits for `await fetch('/')` (which sets the cookie) and then sends the same wanted state again. A visitor who blocks cookies cannot vote: they get this message every time, and the message stays the same after a second `no_voter`. There is no automatic retry, so there is no loop, only one retry per press of Try again.
- **AC-8**: If saving fails (database error, network down, a malformed answer), the optimistic change is dropped, the row shows "Couldn't save your vote." in an `ErrorMessage` with Try again, and Try again sends the same wanted state again. The failure is announced once by the alert, not also in the status region (except `idea_unavailable`, see AC-6). The board is refreshed once after a thrown or malformed answer and after a returned `server` (the outcome is unknown), and not after `no_voter`, `rate_limited` or `invalid`.
- **AC-9**: The server's numbers always win. The count and voted state shown after a refresh are the board's own, even if the optimistic guess was different (someone else voted meanwhile). The announcement is built from the returned `voted` and `count`, not from the wanted state: "Voted. Now N votes." when `voted` is true, "Not voted. Now N votes." when it is false, and the count is always the server's. The wording describes the state after the request, so it stays true even when the write changed nothing (a stale tab sends `on` for a vote that already exists).
- **AC-10**: Logs hold only `{ event, code, voter8, errorName }` (as in spec 0004): never the full voter id, `error.message` or `error.cause`. Refusals are logged too. `voter8` is present only when `isVoterId()` passed: with a missing or garbage cookie, no part of the cookie value reaches the log.
- **AC-11**: A voted idea still shows as voted after a reload in the same browser, and a different browser sees it as not voted.
- **AC-12**: The vote button keeps the stable name "Upvote idea, N votes" with the idea text as its description, measures at least 44 by 56 px, and the page has zero axe violations in light and dark, on desktop and phone widths. A keyboard only visitor can vote and unvote with Enter or Space.
- **AC-13**: Voting works on the Workers preview deploy of the PR: the vote is stored in the preview D1 and survives a reload. The preview check also confirms that `serverActions.allowedOrigins` in `next.config` matches the deployed host (a vote from the preview URL works, and a request with a foreign `Origin` header is refused).
- **AC-14**: `setVote` calls the abuse check `checkVote` after it validates the input and before it writes. In this slice `checkVote` always passes. `VoteResult` with the `rate_limited` code, the "vote rate limited" copy and the row handling for it are new in this slice (built now, never returned yet), and a test injects `rate_limited` and checks the row message and Try again. Feature 9 then only turns the check on.

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
| `idea_unavailable` | Idea hidden while voting | This idea is no longer on the board. | Status region announcement (no alert, no Try again, since the row goes away); the board refreshes, the row goes and focus moves to the "Ideas" heading |
| `no_voter` | Reload needed | Please reload the page and try again. | `ErrorMessage` in the row with Try again |
| `rate_limited` | Vote rate limited (new) | You're voting too fast. Wait a moment and try again. | `ErrorMessage` in the row with Try again |
| `invalid`, `server`, and anything thrown or malformed | Vote failure | Couldn't save your vote. | `ErrorMessage` in the row with Try again |

Try again sends the same wanted state (and for `no_voter` first runs `await fetch('/', { credentials: 'same-origin' })`, exactly as in spec 0004). Success messages ("Voted. Now N votes." and "Not voted. Now N votes.") are in spec 0003 and are built from the returned `voted` and `count`. `idea_unavailable` is announced through the status region and moves focus to the "Ideas" heading (an exception to the alert only rule, explained in AC-6); every other failure uses the row alert only.

**Order inside the action**:
1. Read the voter id with `getVoterId()`. Missing or failing `isVoterId()` gives `no_voter`.
2. Parse the input. Failure gives `invalid`.
3. Run `checkVote({ voterId, ip })` (the seam, below). In this slice it always passes.
4. Run the `setVote` query (below). A hidden or missing idea gives `idea_unavailable`.
5. Log one line with exactly `{ event, code, voter8, errorName }`: `event` is `vote_set`, `vote_refused` or `vote_failed`; `code` is the result code (`ok` on success); `voter8` is the first 8 characters of the voter id, and only when `isVoterId()` passed (with no cookie or a garbage one the key is left out, so nothing from the cookie is logged); `errorName` is `error.name` for a caught error and absent otherwise. Never the full voter id, `error.message` or `error.cause`.
6. Return `{ ok: true, count, voted }`.

### The `setVote` query

In `src/db/queries.ts`, server only, through `getDb()`. It follows the "Set vote" rules of spec 0002 and closes the gap between "check the idea is visible" and "write the vote" (a hide could land in between) by doing both in one D1 batch, which D1 runs as one transaction:

1. **Write**, conditional on the idea being visible:
   - `on`: `insert into votes (idea_id, voter_id, created_at) select :idea, :voter, :now where exists (select 1 from ideas where id = :idea and hidden_at is null) on conflict do nothing`.
   - `off`: `delete from votes where idea_id = :idea and voter_id = :voter and exists (select 1 from ideas where id = :idea and hidden_at is null)`.
2. **Read back**, in the same batch: `select (select count(*) from ideas where id = :idea and hidden_at is null) as visible, (select count(*) from votes where idea_id = :idea) as count, (select count(*) from votes where idea_id = :idea and voter_id = :voter) as voted`.

If `visible` is 0 the query returns `idea_unavailable` (the write did nothing). Otherwise it returns `{ count, voted }` where `voted` is true or false from the read back. The primary key (`idea_id`, `voter_id`) makes a second vote impossible, so parallel `on` requests end with one row. `created_at` is `Date.now()`. No schema change.

### The seam for feature 9 (abuse protection)

`src/lib/abuse.ts` (created by spec 0004) gets a second function, `checkVote(input: { voterId: string; ip: string | null }): Promise<{ ok: true } | { ok: false; code: 'rate_limited' }>`. In this slice it returns `{ ok: true }`, and a test pins that, so feature 9 changes the test on purpose. `setVote` already calls it at step 3 with the client IP (`CF-Connecting-IP`, `null` when absent), and the `rate_limited` result, copy and row handling are built in this slice (AC-14).

Toyin chose hourly vote limits per visitor for feature 9. The numbers are feature 9's to decide, but one fact belongs in front of that spec now: the Workers Rate Limiting binding of spec 0001 only counts over short windows (10 or 60 seconds), so an hourly cap per visitor cannot use it alone. It needs a count kept in D1. Taking a vote back deletes its row, so counting rows would let someone toggle without limit; a per visitor counter would be needed, which is a schema change for feature 9 to plan (one schema PR at a time). Slice 2 does not depend on any of this.

### Client behaviour (fills the gaps in spec 0003's `VoteButton`)

- `IdeaRow` passes `ideaId`, `count` and `voted` (from the board query) to `VoteButton`, replacing the static chip of spec 0004. The layout does not move.
- `VoteButton` is a client component. On press, inside one `startTransition`: set the optimistic value to the wanted state, call `setVote({ ideaId, want })` with the wanted state the opposite of what is shown, then `router.refresh()` on `ok`, `idea_unavailable`, a returned `server`, or a thrown or malformed answer, and not on `no_voter`, `rate_limited` or `invalid`. For `ok` and `idea_unavailable`, the optimistic value stays until the refreshed props arrive (spec 0003). For a returned `server`, or a thrown or malformed answer, the optimistic value is dropped as described under Unknown outcome.
- The call is wrapped in `try` and `catch`. Anything thrown, a missing result, or a result that is not one of the six shapes counts as `server`.
- While a request is pending for a row, presses on that button are ignored and the button has `aria-disabled="true"` (not `disabled`, so focus stays).
- On `{ ok: true }` the announcement is built from the returned `voted` ("Voted" if true, "Not voted" if false) and the returned `count`. `router.refresh()` runs on `ok`, on `idea_unavailable` and on an unknown outcome (below, which includes a returned `server`). On a returned `no_voter`, `rate_limited` or `invalid` the server refused before any write, so nothing was stored: the optimistic value is dropped with no refresh, and the code table above decides the message.
- **Unknown outcome.** If the call throws, the answer is malformed, or the server returns `server` (a D1 error can arrive after the batch committed), the client cannot know what was stored. It shows "Couldn't save your vote." with Try again, drops the optimistic value, and also calls `router.refresh()` once so the row shows the stored truth (the props win).
- On `idea_unavailable` the message is announced through the status region, the board refreshes (the row goes), and focus moves to the "Ideas" heading, or to the idea field if the board is now empty, as `error.tsx` does.
- `IdeaList` renders each row with `key={idea.id}`, so when a refresh re-sorts the board each row keeps its own optimistic and pending state and its focus follows the idea, not the position.
- **Lost response and other tabs.** The server action is idempotent for the same wanted state, so Try again after a lost response sends the same wanted state and lands on the same result. Try again is the only retry (no automatic one). There is no version or ordering token: if the same browser has two tabs open and the second tab changes the vote after the first tab's request was lost, pressing Try again in the first tab is a new request, and the last request to arrive at the server wins. There is no ordering token, so a slow earlier request can overwrite a later one from another tab. This is an accepted limit: it costs at most one vote the visitor chose to flip, so no extra machinery is added.
- `VoteButton` never calls `reset()` or `unstable_retry()`; those belong to `error.tsx`.
- Pressing the vote button again on a row that shows an error clears that error and sends the new wanted state (the opposite of what the row shows now), without needing Try again.
- The optimistic count never goes below 0: the optimistic value for `off` is `Math.max(0, count - 1)`.
- `VoteButton` reaches the status region by importing `announce(text)` from `src/lib/announce.ts` (specs 0003 and 0004). There is no context or provider: it is a plain helper that writes to the one polite status region in `layout.tsx`. All vote announcements, including `idea_unavailable`, go through it.
- Ids are strict UUIDs. `z.string().uuid()` in zod 4 is strict (it checks the version and variant bits), and `crypto.randomUUID()`, which creates every idea id, complies, so a real id is never rejected as `invalid`.

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
- A request is idempotent: repeating the same request, with nothing else written in between, gives the same result. Across two tabs of one browser the last request to arrive wins (see "Lost response and other tabs").
- Counts are never stored, always counted (spec 0002), and the page always shows the server's numbers in the end.

### Security model

Anyone with the voter cookie can vote, and only on their own behalf: the voter id comes from the cookie, never from the input. The input is validated with zod. Next.js' built in Origin check for server actions stays on, and `serverActions.allowedOrigins` is verified on the preview deploy (AC-13). `SameSite=Lax` on `nb_voter` is the CSRF defence: a cross site POST does not carry the cookie, so it gets `no_voter`. Clearing cookies gives a new voter, which is the accepted limit in spec 0002; feature 9 limits the rate. No new environment variables or secrets.

### Critical test scenarios

Test approach, as in spec 0004: Vitest with `getDb()` replaced through `vi.mock` (a local D1 for normal cases, a throwing one for failures); component tests for `VoteButton`; Playwright with two browser contexts for the cross browser cases.

- Happy path: vote, then unvote; count and `voted` come back right each time, verifies **AC-1**, **AC-2**.
- Query: `on` twice returns count 1 and one row; `off` twice returns count 0; `off` with no vote returns count unchanged and `voted` false, verifies **AC-3**.
- Query: two concurrent `on` requests from one voter leave one row; two voters each add one, verifies **AC-3**.
- Query: a hidden idea returns `idea_unavailable` for `on` and for `off`, and the table is unchanged; a missing idea does the same; a hide that lands between request and write cannot leave a new vote on a hidden idea, verifies **AC-6**.
- Action: missing or malformed cookie returns `no_voter` and writes nothing; bad `ideaId` or `want` returns `invalid`, verifies **AC-7**.
- Action: with a garbage cookie value, the logged line has no `voter8` key and the cookie text appears nowhere in the log output, verifies **AC-10**.
- Action: a throwing database returns `server`; the logged line contains only the four keys, and a database error whose message holds the voter id is not in the log, verifies **AC-8**, **AC-10**.
- Action: the exact log keys for each event (`vote_set`, `vote_refused` for `invalid`, `no_voter`, `idea_unavailable` and `rate_limited`, and `vote_failed`) are `event`, `code`, `voter8` (when allowed) and `errorName` (when an error was caught), nothing more, verifies **AC-10**.
- Action: `checkVote` is called after validation and before the write, and always passes; `rate_limited` is handled by the page (a test injects it), verifies **AC-14**.
- `VoteButton` with an injected `rate_limited`: the row shows "You're voting too fast. Wait a moment and try again." with Try again, the optimistic value is dropped and the board is not refreshed, verifies **AC-14**.
- `VoteButton`: a press sends the opposite of the shown state, repeat presses while pending send nothing, the count read in the announcement is the returned one, and props from the refresh replace a different optimistic guess; the announcement follows the returned `voted` (a mocked result with `voted` false after a wanted `on` announces "Not voted. Now N votes.", and a no-op `on` for an existing vote announces "Voted. Now N votes."), verifies **AC-1**, **AC-4**, **AC-9**.
- `VoteButton` failures: each code shows its message and Try again as in the table (none for `idea_unavailable`); Try again sends the same wanted state; the `no_voter` retry waits for a delayed `fetch('/')` before sending; a second `no_voter` shows the same message with no loop; `router.refresh()` is called for `ok`, `idea_unavailable`, a returned `server` and a thrown or malformed answer, and not for `no_voter`, `rate_limited` or `invalid` (a spy checks each); a status region spy proves failures are not also announced there, verifies **AC-7**, **AC-8**.
- `VoteButton` with `idea_unavailable`: the status region receives "This idea is no longer on the board.", no alert is rendered, the board refreshes, and focus ends on the "Ideas" heading (the idea field when the board is empty), verifies **AC-6**.
- `IdeaList`: after a re-sort, a pending row keeps its own state and focus stays on its vote button (rows keyed by `idea.id`), verifies **AC-5**.
- `copy.ts` has a string for every vote error code (type check), verifies **AC-6**, **AC-8**.
- Playwright: vote, reload, still voted; a second browser context sees the count but not the voted state; the list re-sorts and focus stays on the pressed button; keyboard only vote with Enter and Space; `boundingBox()` of the vote button is at least 44 wide and 56 high on desktop and phone, verifies **AC-1**, **AC-5**, **AC-11**, **AC-12**.
- Playwright axe on `/` with voted and not voted rows and a row error, in light, dark, desktop and phone, verifies **AC-12**.
- Preview deploy: vote on the deployed URL, reload, still voted; confirm `serverActions.allowedOrigins` accepts the deployed host and a foreign `Origin` is refused, verifies **AC-13**.

## Build plan

Approach: Tracer Bullet (the project default). First a thin thread from a plain button to the database on the preview deploy, then the real button behaviour from spec 0003. No migration is needed (the `votes` table shipped in Slice 1), so this slice does not take the schema lane.

1. **Query** (satisfies **AC-3**, **AC-6**): `setVote` in `src/db/queries.ts` with the tests above on a local D1 through the injected `getDb()`: repeated `on`, repeated `off`, two voters, concurrent requests, hidden idea, missing idea.
2. **Action and seam** (satisfies **AC-7**, **AC-10**, **AC-14**): `setVote` action and `VoteResult` and the input schema in `src/lib/schemas.ts`, `checkVote` in `src/lib/abuse.ts`, the copy keys with the `satisfies` check, and the logging rule, with action tests.
3. **The thin thread** (satisfies **AC-1**, **AC-2**, **AC-11**, **AC-13**): a plain, unstyled vote button in `IdeaRow` that sends the wanted state, calls `router.refresh()` and nothing else (no optimism, no messages). Deploy the preview and prove a vote is stored and survives a reload.
4. **`VoteButton` behaviour** (satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-9**, **AC-12**): the chip from spec 0003 as a real button, `useOptimistic` held until the refreshed props arrive, the pending guard, the announcements from the returned count, and focus staying on the button. Component tests.
5. **Failure states** (satisfies **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-14**): the row `ErrorMessage` for each code, Try again with the same wanted state, the `no_voter` retry through `fetch('/')`, the status region announcement, refresh and focus move for `idea_unavailable`, the `rate_limited` row, and `key={idea.id}` in `IdeaList`. Component tests.
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

- [ ] Feature 9 (abuse protection): fill `checkVote`. The limit key must include the client IP, not only the voter id, because a new voter id costs nothing (clear cookies). `ip` can be `null` (header missing), so feature 9 needs a policy for it (for example share one strict bucket for all null IPs). Toyin's hourly limit per visitor needs a count in D1 because the Rate Limiting binding only covers 10 or 60 second windows, and taking a vote back deletes its row, so plan a per visitor counter (a schema change, one schema PR at a time). Michael to tell Toyin.
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
