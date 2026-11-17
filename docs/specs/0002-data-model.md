# 0002. Data model: ideas and votes in D1

**Date**: 2026-11-16
**Status**: Accepted

## Summary

Two tables in D1, defined with Drizzle: `ideas` and `votes`. A vote is one row per (idea, browser), and that pair is the primary key, so the database itself makes double votes impossible. The board counts votes with a query instead of storing a running total, so the count can never drift. A browser is recognised by a random id in a private cookie. Hiding an idea sets a timestamp; nothing is ever deleted.

## Requirements

From scope feature 3 and the features it serves (5 suggest, 6 upvote, 8 hide spam):

- An idea is one line of text, 1 to 140 characters after trimming.
- One vote per idea per browser. Tapping again removes the vote.
- The board is sorted by votes, newest first on ties.
- Hidden ideas disappear from the public board and can be unhidden. Their votes are kept.
- Stack and migration rules from spec 0001: D1 binding `DB`, Drizzle schema in `src/db/schema.ts`, generated migrations in `drizzle/`, migrations only add until launch.

## Decision

**Chosen option**: Option 1, normalized tables with votes counted by query.

## Schema

`src/db/schema.ts` (Drizzle, `sqlite-core`):

**`ideas`**

| Column | Type | Rules |
|---|---|---|
| `id` | `text` primary key | `crypto.randomUUID()`, set by the server |
| `text` | `text` not null | Trimmed, then 1 to 140 characters. SQL check: `length(text) between 1 and 140` |
| `author_voter_id` | `text` not null | The poster's voter id (see *Voter identity*). Never shown publicly; kept for spam work later (scope deferred item "Auto hold suspicious ideas") |
| `created_at` | `integer` (`mode: 'timestamp_ms'`) not null | Set by the server |
| `hidden_at` | `integer` (`mode: 'timestamp_ms'`) null | `null` means visible. Hide sets it to now; unhide sets it back to `null` |

Index: `ideas_visible_created_idx` on (`hidden_at`, `created_at`).

**`votes`**

| Column | Type | Rules |
|---|---|---|
| `idea_id` | `text` not null | References `ideas.id`, `on delete cascade` |
| `voter_id` | `text` not null | The voter's id |
| `created_at` | `integer` (`mode: 'timestamp_ms'`) not null | Set by the server |

Primary key: (`idea_id`, `voter_id`). This is the one vote rule. Index: `votes_voter_idx` on (`voter_id`), used to show which ideas this browser has already voted for.

Export the inferred types (`Idea`, `NewIdea`, `Vote`) from the schema file, and use zod schemas (`drizzle-zod` or hand written) for the inputs.

## Text rules

- Normalize to Unicode NFC, trim the ends, then collapse runs of whitespace (including new lines) into one space.
- Length counts characters as people see them in the input: count code points (`[...text].length`), which matches SQLite's `length()` on text. The UI counter uses the same count.
- Reject empty after trimming. Do not reject duplicates for launch; Toyin hides repeats if they become a problem.
- Store plain text only. React escapes it on output; never render it as HTML.

## Voter identity

- Cookie `nb_voter`: a random UUID, `HttpOnly`, `Secure` (except on `localhost`), `SameSite=Lax`, `Path=/`, `Max-Age` 400 days (the most browsers allow).
- Set by `middleware.ts` on the first page load (any `GET` of a page) when the cookie is missing or not a valid UUID, so the browser holds one id before it can post or vote. Two quick first votes then share that id.
- Server actions never create the id. If an action arrives without a valid cookie (cookies blocked, or a direct request), it is rejected with "Please reload the page and try again". Test: two concurrent `on` requests right after the first page load create one voter and one vote per idea.
- Accepted limit: if two tabs open at the same instant in a brand new browser, the later response can replace the cookie, so a vote cast in that first second may belong to the earlier id. This is rare, costs at most one extra vote, and needs no locking.
- Clearing cookies or switching browsers gives a new voter. That is the accepted limit of "one vote per browser"; Turnstile and rate limits (feature 9) handle floods.
- Logs show only the first 8 characters of a voter id.

## Queries

All live in `src/db/queries.ts`, server only, each with a test against a local D1.

- **Board**: visible ideas with their vote count and whether this voter voted:
  `select ideas.id, ideas.text, ideas.created_at, count(votes.voter_id) as votes, coalesce(max(votes.voter_id = :voter), 0) as voted from ideas left join votes on votes.idea_id = ideas.id where ideas.hidden_at is null group by ideas.id order by votes desc, ideas.created_at desc, ideas.id desc limit 500` (`ideas.id` last makes ties in the same millisecond deterministic, matching spec 0004).
  The 500 cap keeps the page bounded; paging is out of scope until the board grows that big.
- **Post**: insert one idea. Returns the new row.
- **Set vote**: the button sends the state the person wants (`on` or `off`, from what they see), not a blind "toggle", so every request is idempotent and a double tap or a retry can't flip it back. First check that the idea exists and is visible (else reject). `on`: `insert into votes ... on conflict do nothing`. `off`: delete the (idea, voter) row. Each is one atomic statement, and the primary key makes a second vote impossible. Return the new count and whether this voter now has a vote. Return the new count and whether the voter now has a vote.
- **Admin list**: every idea, hidden or not, newest first, with vote count and `hidden_at`.
- **Hide / unhide**: update `hidden_at`. Idempotent.

## Build plan

The schema and first migration ship with Slice 1 (scope feature 5), not the scaffold:

1. Slice 1 (`/develop suggest an idea`): `ideas` and `votes` tables, first migration, `post` and `board` queries with tests, voter cookie helper.
2. Slice 2 (`/develop upvoting`): `set vote` query with tests (repeated on, repeated off, two browsers, hidden idea).
3. Slice 3 (`/develop hide spam`): admin list and hide or unhide queries with tests.

## Consequences

**Positive**:
- The database makes double votes impossible, even with replayed or parallel requests.
- Counts are always exact, because nothing stores a running total.
- Hiding is reversible, and nothing is ever lost.

**Negative / tradeoffs**:
- Counting votes on every board load costs more as votes grow. Fine up to tens of thousands of votes on D1. If the board gets slow, add a stored `vote_count` kept in the same batch as the vote (an add only migration).
- A determined person can vote again by clearing cookies. That's accepted; feature 9 limits the rate.

## Follow-up

- [ ] Revisit the 500 idea cap and counting by query if the board grows past a few thousand ideas.

## Rationale

**Options considered**

1. **Normalized tables, count by query (chosen).** Exact counts and the simplest code. Slower only at a scale this app won't reach soon.
2. **Stored `vote_count` on `ideas`, kept in step with the votes table.** Faster reads, but the count can drift if any write path forgets to update it, and the toggle becomes harder to get right. Easy to add later without breaking anything.
3. **Votes as a JSON list on each idea.** No database level one vote rule, and every vote rewrites the row. Rejected.

Voter id in a cookie beats browser fingerprinting (unreliable, and a privacy problem) and beats local storage (the server can't read it, so the server can't enforce the rule). An HttpOnly cookie also keeps page scripts from reading it.
