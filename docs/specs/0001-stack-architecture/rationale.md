# 0001. Rationale: Next Build stack

## Context

Next Build is a single public page where anyone suggests what to build next (140 characters) and upvotes ideas, one vote per idea per browser, sorted by votes. Toyin hides spam from a private admin page. Toyin asked for it to deploy to Cloudflare Workers like the portfolio, which is a Next.js app on Workers through OpenNext with a mature CI, test and deploy setup.

Unlike the portfolio, this app stores data that changes every second: ideas and votes. Counts must be right (a vote must never be counted twice for one browser), the board must stay fast, and test data from previews must never leak onto the real board. There are no user accounts, so the only sign in is Toyin's admin access.

The team is small (three agents and Toyin), traffic is small, and there is no deadline beyond a lean first launch.

## Options considered

### Option 1: Next.js on Workers (portfolio stack) with D1 and Drizzle

The portfolio's exact setup, plus a D1 database through Drizzle, Cloudflare Access for admin, Turnstile and the rate limit binding for abuse.

**Pros**:
- Reuses a proven setup, conventions and CI; the team already knows it.
- Relational database with a unique rule for votes; typed queries.
- Everything on one Cloudflare account, free at this scale.

**Cons**:
- Next.js through an adapter is heavier than this one page needs and may hit the Free plan bundle limit.

### Option 2: A lighter Workers app (Hono API plus a small React or plain HTML front end) with D1

A smaller framework built for Workers.

**Pros**:
- Tiny bundle, fast cold starts, no adapter.

**Cons**:
- A second set of conventions, CI and tests to build from scratch, against Toyin's "like the portfolio".

### Option 3: Portfolio stack with Durable Objects instead of D1

One Durable Object holds the whole board in memory with strong consistency.

**Pros**:
- Strongly consistent counters, realtime updates possible later.

**Cons**:
- Custom storage code for what is a simple table; harder to query, inspect and migrate. Toyin chose D1.

### Option 4: Portfolio stack with KV

**Pros**:
- Cheap and simple.

**Cons**:
- Eventually consistent and last write wins: concurrent votes can be lost. Wrong tool for counters.

## Rationale

Option 1 wins because reuse beats a theoretically leaner stack here: the portfolio's CI, test setup and conventions are already proven on Workers, and Toyin asked for exactly that. The only missing piece is storage, and a relational database is the right default for ideas and votes: a unique rule on (idea, voter) makes the one vote rule impossible to break, and sorting by votes is a single query. D1 is Cloudflare's relational option and needs no new account. Drizzle adds typed queries and generated migrations that wrangler applies the same way everywhere.

For admin, Cloudflare Access gives Toyin a real login with no password code for us to own, and Cloudflare's docs (checked 2026-11-16) confirm a self hosted application can protect only a path on a `workers.dev` hostname. Verifying the Access token inside the Worker is cheap defence in depth: it keeps admin safe even if the Access rule is misconfigured or the Worker is reached through a preview URL.

Option 2's bundle advantage only matters if the Worker outgrows the Free plan, and then Workers Paid at about 5 USD a month is cheaper than maintaining a second stack.

## References

- Portfolio stack spec: `toyin-software-factory/toyinog-portfolio`, `docs/specs/0001-stack-architecture/index.md`
- [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) (path based Access on `workers.dev`)
