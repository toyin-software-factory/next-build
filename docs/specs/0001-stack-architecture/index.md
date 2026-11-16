# 0001. Next.js on Cloudflare Workers with D1 as the Next Build stack

**Date**: 2026-11-16
**Status**: Proposed

## Summary

Next Build is one Next.js app in strict TypeScript, styled with Tailwind CSS, running on Cloudflare Workers through the OpenNext adapter (a tool that lets Next.js run on Cloudflare). It copies the portfolio's setup ([toyinog-portfolio spec 0001](https://github.com/toyin-software-factory/toyinog-portfolio/blob/main/docs/specs/0001-stack-architecture/index.md)) so the team reuses what already works. The new part is a database: ideas and votes live in Cloudflare D1 (Cloudflare's SQL database), reached through Drizzle (a typed query library that also writes the migration files). The admin area sits behind a Cloudflare Access login that only Toyin's email passes, and the app checks that login itself as well.

## Requirements

This is a decision spec: it records the stack. The scaffold sub task of scope feature 1 builds it, and `/develop` works out the scaffold steps from `## Proposed stack` at build time.

**Done when** (from scope feature 1): the stack is recorded here; the empty app runs locally against a local D1; CI runs lint, typecheck, test and build on every PR; `main` deploys to the free `workers.dev` address and every PR gets a preview link that uses the separate preview database.

## Decision

**Chosen option**: Option 1: Next.js (App Router) on Cloudflare Workers via OpenNext, with D1 through Drizzle, Cloudflare Access for admin, and the portfolio's toolchain.

You build one Next.js monolith (a single deployable app). The public board is rendered on the server per request from D1; posting, voting and hiding are server actions that validate input with zod and write to D1.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture | One Next.js app (monolith). The board page (`/`) and admin page (`/admin`) render on the server per request; writes are server actions | One page and one admin screen need the simplest thing that ships. Votes change constantly, so the board is never prebuilt |
| Language | TypeScript, `strict` on, Node.js current LTS for tooling (`.nvmrc`, `engines`) | Team rule, same as the portfolio |
| Framework | Next.js, newest major that `@opennextjs/cloudflare` supports, App Router, React version Next.js pins | Same as the portfolio, so conventions and fixes carry over |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare`, configured in `wrangler.jsonc`, served at the free `next-build.<account>.workers.dev` address (no custom domain for now) | Toyin's pick. Free tier, same account as the portfolio |
| Deploys and previews | Cloudflare Workers Builds (Git integration): `main` deploys to production; every PR branch uploads a preview version with its own URL | Same as the portfolio, no deploy token in GitHub |
| Primary database | Cloudflare D1 (SQLite), binding `DB`. Two databases: `next-build` (production) and `next-build-preview` (shared by every PR preview) | Toyin's pick. Relational, so a unique rule can enforce one vote per idea per browser and sorting by votes is one query. Previews never touch real ideas (Toyin's pick) |
| Data access and migrations | Drizzle ORM (`drizzle-orm/d1`) with the schema in `src/db/schema.ts`; `drizzle-kit generate` writes SQL migrations into `drizzle/`, set as `migrations_dir` in `wrangler.jsonc`; migrations are applied with `wrangler d1 migrations apply` | Toyin's pick. Typed queries and generated migrations; wrangler applies them the same way locally, in CI and on deploy |
| Auth | Public visitors: none (anonymous). Admin: a Cloudflare Access self hosted application on the `workers.dev` hostname for the paths `/admin` and below, allowing only Toyin's email. The Worker also verifies the `Cf-Access-Jwt-Assertion` header (signature against the team's public keys, audience tag, expiry) with `jose` on every admin page load and admin action | Toyin's pick (no passwords for us to store). Access protects just that path on `workers.dev` (Cloudflare docs, checked 2026-11-16). Verifying the token in the Worker means a misconfigured Access rule or a preview URL can never expose admin |
| Abuse protection | Cloudflare Turnstile (verified server side) on posting, plus the Workers Rate Limiting binding keyed by client IP (`CF-Connecting-IP`) on posting and voting | Toyin's pick, and the same tools the portfolio uses. The exact limits are decided in scope feature 9 |
| Input validation | zod on every server action input and on environment variables | Team rule |
| Styling | Tailwind CSS (current major, configured in CSS through `@tailwindcss/postcss`), tokens defined once in the theme | Same as the portfolio. Tokens come from the design system spec (scope feature 4) |
| Analytics | None | Toyin's pick for the first launch |
| Observability | Cloudflare Workers Logs (`observability.enabled: true`) with structured `console` logs from server actions. Never log the voter id or IP in full | Enough for a small app; add an error tracker later if errors appear |
| Testing | Vitest plus Testing Library (unit and component; query logic tested against a real local D1 through wrangler's local runtime, not mocks), Playwright with `@axe-core/playwright` (end to end, accessibility, desktop and phone screenshots) | Same as the portfolio. Vote counting and the one vote rule must be tested against real SQL |
| Package manager | pnpm (version pinned in `packageManager`) | Same as the portfolio |
| Lint and format | ESLint flat config (Next.js core web vitals, `jsx-a11y`, `typescript-eslint` strict) plus Prettier with the Tailwind plugin; light pre commit hook on staged files | Same as the portfolio |

## Versions

Pin exact versions in `package.json` when you scaffold, and record them in root `AGENTS.md` through `/audit`. Order: the latest `@opennextjs/cloudflare`, then the newest Next.js major it supports, then the React that Next.js pins. Drizzle ORM and `drizzle-kit` take their current stable versions that support D1. The portfolio's pins (Next 16.4, OpenNext 1.20, wrangler 4.158 as of 2026-11-16) are a good starting point.

## Directory layout and scripts

```
src/app/                 routes: / (board), /admin (moderation)
src/components/          shared UI components
src/db/schema.ts         Drizzle schema (the data model spec fills it)
src/db/client.ts         getDb(): Drizzle over the D1 binding from getCloudflareContext().env
src/lib/                 server and shared helpers (env, access token check, rate limit, turnstile)
drizzle/                 generated SQL migrations (committed, never edited by hand)
tests/e2e/               Playwright specs
src/**/*.test.ts(x)      Vitest tests next to the code
wrangler.jsonc, open-next.config.ts, next.config.ts, drizzle.config.ts, .nvmrc
```

`package.json` scripts, same names as the portfolio plus database ones: `dev`, `build`, `build:worker`, `preview`, `deploy`, `upload`, `lint`, `format`, `format:check`, `typecheck`, `test`, `test:e2e`, `cf-typegen`, and `db:generate` (`drizzle-kit generate`), `db:migrate:local` (`wrangler d1 migrations apply DB --local`), `db:migrate:remote` (`wrangler d1 migrations apply DB --remote`, production), `db:migrate:preview` (`wrangler d1 migrations apply DB --remote --env preview`), `upload:preview` (`opennextjs-cloudflare upload -- --env preview`).

## Rendering and data rules

- Voter identity (how "one vote per browser" is recognised: a cookie name, its flags and lifetime) is not decided here. The data model spec (scope feature 3) decides it. The current lean is a random id in a server set, HttpOnly cookie.

- `/` and `/admin` are dynamic (`export const dynamic = 'force-dynamic'`); nothing that reads D1 is prerendered.
- All database access goes through `getDb()` in `src/db/client.ts`, server only (`import 'server-only'`). Client components never import `src/db/`.
- Server code reads bindings and secrets through `getCloudflareContext().env`, typed by `cf-typegen`. `next.config.ts` calls `initOpenNextCloudflareForDev()` so bindings (including a local D1) work in `next dev`.
- `open-next.config.ts` uses the default (static assets) incremental cache. No R2, no KV.

## Cloudflare configuration

`wrangler.jsonc` (committed, no personal data): `name` `next-build`, `main` `.open-next/worker.js`, recent `compatibility_date`, `compatibility_flags: ["nodejs_compat"]`, `assets` (`.open-next/assets`, binding `ASSETS`), `observability.enabled: true`, `d1_databases` with binding `DB` (`database_name` `next-build`, its `database_id`, `migrations_dir` `drizzle`), `ratelimits` bindings for posting and voting (limits set by feature 9).

**Preview database.** Preview versions must bind `DB` to `next-build-preview`, never to production. Mechanism: an `env.preview` block in `wrangler.jsonc` that sets `name` back to `next-build` (so previews stay versions of the same Worker and keep the normal preview URL host), repeats the non inheritable keys (`vars`, `ratelimits`) and has its own `d1_databases` entry (binding `DB`, `database_name` `next-build-preview`, its id, `migrations_dir` `drizzle`). Every non production migrate and upload passes `--env preview`. Production commands never pass `--env`. The scaffold PR proves it: the preview deploy log shows the preview database id, and a test idea added on the preview does not appear in production.

**Workers Builds settings** (Toyin action):
- Production branch `main`. Build command `pnpm opennextjs-cloudflare build`. Deploy command: `pnpm db:migrate:remote && pnpm opennextjs-cloudflare deploy`.
- Non production branches enabled. Deploy command: `pnpm db:migrate:preview && pnpm upload:preview` (a preview version with its own URL, bound to the preview database).
- The Workers Builds API token needs D1 edit permission (on top of the default Workers permissions) so migrations can run during deploy.
- `workers.dev` and preview URLs enabled.

**Production vs preview (`APP_ENV`)**: resolved at build time in `next.config.ts` exactly like the portfolio (explicit `APP_ENV`, else `production` when `WORKERS_CI_BRANCH` is `main`, else `preview`), read only through `getAppEnv()` in `src/lib/env.ts`. Outside production, `getAppEnv()` makes the app use Cloudflare's published Turnstile test keys (they are public, so they live in code), so previews, local runs and CI never need real Turnstile values. Real keys are only set for production.

**Admin access outside production**: deployed previews keep the Access token check (protect preview URLs with Access too, Previews only option). Locally and in CI there is no Access in front, so the admin sign in spec (scope feature 7) decides how tests reach `/admin`; it must never be possible on a deployed Worker. If `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is missing, `/admin` fails closed (403), never open.

## Configuration required

Names only, never values in the repo.

| Name | Kind | Where it is set |
|---|---|---|
| `DB` | D1 binding (database ids are not secret) | `wrangler.jsonc`; preview id per the preview rule above |
| `ACCESS_TEAM_DOMAIN` | Plain var, e.g. `<team>.cloudflareaccess.com` | `wrangler.jsonc` `vars` |
| `ACCESS_AUD` | Worker secret (Access application audience tag) | Cloudflare secret, set once on the Worker (previews of the same Worker share it). Local: `.dev.vars`. Unset means `/admin` returns 403 |
| `TURNSTILE_SECRET_KEY` | Worker secret, used only when `APP_ENV` is `production` | Cloudflare secret. Elsewhere the code uses the public test secret |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public, inlined at build, used only when `APP_ENV` is `production` | Workers Builds build variable. Elsewhere the code uses the public test site key |
| `APP_ENV` | Build time value | Resolved in `next.config.ts` (see above) |
| `NEXT_PUBLIC_SITE_URL` | Public, inlined at build (canonical URL for SEO) | Workers Builds build variable, `https://next-build.<account>.workers.dev`. Defaults to `http://localhost:3000` when unset, so the first deploy and local runs still build |

`.dev.vars` and `.env.local` are git ignored; committed `.dev.vars.example` and `.env.example` list the names. Turnstile and the rate limit bindings are only needed once scope feature 9 is built.

## CI contract

GitHub Actions `ci.yml`, on every PR and push to `main`, Node from `.nvmrc`, pnpm with cache:
1. `pnpm install --frozen-lockfile`
2. `pnpm lint`, `pnpm format:check`, `pnpm typecheck`
3. A migration drift check: `pnpm db:generate` must produce no changes (schema and committed migrations agree)
4. `pnpm db:migrate:local`, then `pnpm test` (Vitest)
5. `pnpm build:worker`, then a bundle size gate: `wrangler deploy --dry-run --outdir dist-check`, gzip the output Worker script and fail if it is over 3 MiB (the Workers Free limit), printing the size. CI uses the committed `database_id` values; local mode never contacts them
6. Playwright (`pnpm test:e2e`, desktop and mobile projects, axe on every page) against `pnpm preview` (the real Workers runtime with a local D1 migrated fresh), HTML report uploaded

Required checks on `main` (a Toyin action, added after the scaffold): `ci` and the Workers Builds check, alongside the existing `pr-sync`.

## SEO and security basics

- `src/app/sitemap.ts` and `src/app/robots.ts` come with the scaffold (robots disallows `/admin`). Canonical URL from `NEXT_PUBLIC_SITE_URL`.
- Content security policy set per request in `middleware.ts` with a nonce (Next.js applies it to its own inline scripts; pages are dynamic anyway): `script-src 'self' 'nonce-…' 'strict-dynamic' https://challenges.cloudflare.com`, `frame-src https://challenges.cloudflare.com`, `object-src 'none'`, `base-uri 'self'`. Other security headers from `next.config.ts` `headers()`: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. `/admin` responses send `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

## Consequences

**Positive**:
- One vendor account (Cloudflare) covers hosting, database, admin login and bot checks, all free at this scale.
- The team reuses the portfolio's conventions, CI and fixes, so the scaffold is quick.
- The database itself enforces one vote per idea per browser, so a bug or a replayed request can't double count.

**Negative / tradeoffs**:
- Next.js on Workers goes through an adapter; pin versions OpenNext supports and check before upgrading. The Worker may outgrow the 3 MiB Free plan bundle limit (then Workers Paid, about 5 USD a month, Toyin's call).
- D1 is SQLite: one primary location, so writes from far away are a little slower. Fine for this traffic.
- All previews share one test database, so a test idea from one PR shows on another PR's preview. Acceptable; production is never touched.
- The rate limiter is approximate (per Cloudflare location). Turnstile and the database rules are the real defence.
- Vendor concentration: a Cloudflare outage takes out everything.

**Neutral**:
- Two pipelines: GitHub Actions for checks, Workers Builds for deploys.
- Migrations run on every deploy before the new code goes live, so each migration must be safe for the code already running (add before remove).

## Follow-up

- [ ] Toyin action at scaffold time: create the D1 databases `next-build` and `next-build-preview` and share both ids; connect the GitHub repo through Workers Builds with the settings above (token with D1 edit); enable preview URLs; share the account's `workers.dev` subdomain so `NEXT_PUBLIC_SITE_URL` can be set.
- [ ] Toyin action at admin sign in time (feature 7): create the Access application for `/admin` on the `workers.dev` hostname, allow only Toyin's email, protect preview URLs, add `ACCESS_AUD` as a secret, and share the team domain for `ACCESS_TEAM_DOMAIN`.
- [ ] Toyin action at abuse protection time (feature 9): create the Turnstile widget and add its keys.
- [ ] Toyin action after scaffold: add `ci` and the Workers Builds check as required checks on `main`.
- [ ] If the bundle size gate fails on the Free plan, Toyin decides on Workers Paid. The scaffold PR reports the measured size.
- [ ] `/audit` after the scaffold: record these commands and conventions in root `AGENTS.md`.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
