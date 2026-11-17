# Check verify: data model (spec 0002)

**Verdict: PASS. Every rule in spec 0002 holds in the real local D1 built from the committed migrations. Voting, hiding and the text rules were also driven through the running app by the slice verifications and the full Playwright run.**

Next: nothing owed for feature 3. Features 5, 6 and 8 own the slice level checks, listed below.

## How it was run

- `pnpm exec vitest run`: 23 files, 265 tests passed. The database tests use `createTestDb()`, which applies every file in `drizzle/` to a real local D1 (workerd through wrangler), not a mock.
- New this task: `src/db/schema.test.ts` (13 tests) reads the migrated schema directly.
- Live local D1 after the Playwright run, with `wrangler d1 execute DB --local`:
  - `select type, name from sqlite_master ...` listed tables `ideas`, `votes`, `rate_events` and indexes `ideas_visible_created_idx`, `votes_voter_idx` and the three `rate_events` ones.
  - `select count(*) ideas, hidden, votes, duplicate votes, bad length` returned 170 ideas, 0 hidden, 36 votes, 0 duplicate (idea, voter) pairs and 0 ideas outside 1 to 140 characters.
- `pnpm exec playwright test`: 84 of 88 passed in a sandbox with no `.dev.vars`. The 4 failures were the abuse burst tests, which need the Turnstile test settings CI copies from `.dev.vars.example`. After `cp .dev.vars.example .dev.vars` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (what CI sets), the abuse spec passed 10 of 10.

## Per requirement

| Requirement in spec 0002 | Result | Evidence |
|---|---|---|
| Idea text is 1 to 140 characters (SQL check) | met | `schema.test.ts`: 1, 140 and 140 emoji accepted; empty, 141 and 141 emoji rejected by the database itself. Live D1: 0 rows with a bad length. |
| Normalize NFC, trim, collapse whitespace, count code points | met | `idea.test.ts` and `actions.test.ts` (140 emoji accepted, 141 refused). Driven in a browser in the board verify report (`Verify ... first\nidea   here` stored as one line). |
| One vote per idea per browser, by primary key | met | `schema.test.ts` reads `pragma_table_info('votes')`: primary key is `idea_id, voter_id`. `queries.test.ts` refuses a second insert. Live D1: 0 duplicate pairs after the full e2e run. |
| Tapping again removes the vote, requests are idempotent | met | `queries.test.ts` and `actions.test.ts`: on, off, repeated and parallel requests. e2e `voting.spec.ts` "vote, reload and still voted, then take the vote back", desktop and mobile. |
| Board sorted by votes, then newest, then id | met | `queries.test.ts` "orders by votes, then newest, then id desc". e2e "a voted row moves up the board". |
| Board is capped at 500 | met | `queries.test.ts` "returns 500 of 501 ideas". |
| Hidden ideas leave the board, return on unhide, votes kept | met | `admin-queries.test.ts` "hides, keeps the first hidden time, and shows again" and "never touches votes". e2e `admin.signed-in.spec.ts` hide then unhide on the real board. |
| A hidden or missing idea cannot be voted on | met | `queries.test.ts` and `actions.test.ts` `idea_unavailable`. |
| Votes are deleted with their idea, and cannot point at a missing idea | met | `schema.test.ts` cascade and foreign key tests. |
| Counts come from a query, no stored total | met | `schema.test.ts` lists the `ideas` columns: `id, text, author_voter_id, created_at, hidden_at`. |
| `author_voter_id` is required, new ideas start visible | met | `schema.test.ts`. |
| Both indexes exist | met | `schema.test.ts` and `sqlite_master` on the live local D1. |
| Voter cookie: `nb_voter`, UUID, HttpOnly, Secure except localhost, 400 days, set on first page GET only | met | `voter-cookie.test.ts` (5 tests). Driven in a browser in the board verify report. |
| Actions reject a missing cookie | met | `actions.test.ts` `no_voter` for post and vote. |
| Logs carry only the first 8 characters of a voter id | met | `actions.test.ts` log tests (never the idea text, full id or error message). |
| Migrations only add, generated into `drizzle/` | met | Two migrations, both `CREATE` only. CI fails on drift. |

## Specced surfaces

All built and applied: tables `ideas` and `votes`, both indexes, the queries `getBoard`, `insertIdea`, `setVote`, `listIdeasForAdmin`, `countIdeasForAdmin` and `setIdeaHidden`, and the `nb_voter` middleware step. None missing, none unapplied. `rate_events` belongs to spec 0007.

## Not exercised

- The two tab first load cookie race, accepted in the spec as a rare limit.
- The production D1. This check used the local D1 only. The migrations run on deploy through Workers Builds.
- Slow board counts at scale (the spec's follow-up, not a launch need).

## Worth a look in review

- Spec 0002's query section repeats the sentence "Return the new count and whether the voter now has a vote." The spec is unchanged here because specs belong to `/architect`.

## Files ticked

Scope: feature 3 `Verify it` and `Test it`, status `done`.
