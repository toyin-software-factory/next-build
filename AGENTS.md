# Next Build

One public page where anyone suggests what to build next (140 characters) and upvotes ideas. Admin hides spam.

## Stack

- **Runtime**: TypeScript 6.0 strict, Node 26.13 (`.nvmrc`), Cloudflare Workers (`compatibility_date` 2026-11-01, `nodejs_compat`)
- **Framework**: Next.js 16.4.5 App Router and React 19.3.1, deployed by `@opennextjs/cloudflare` 1.20.17 (wrangler 4.158)
- **Data**: Cloudflare D1 through Drizzle ORM 0.45.4 and drizzle-kit 0.31.11. Validation with zod 4.6.7
- **UI and tests**: Tailwind 4.3.5; Inter (`@fontsource-variable/inter` 5.3.0, loaded with `next/font/local`, system stack as fallback); Vitest 5.1.0 with Testing Library and vitest-axe 0.1.0; Playwright 1.65.0 with axe 4.14.0
- **Tooling**: pnpm 12.18.0, ESLint 9 (typescript-eslint strict type checked, jsx-a11y), Prettier 3.9 with the Tailwind plugin
- Exact pins live in `package.json`. Decisions and reasons: `docs/specs/0001-stack-architecture/index.md`.

## Build approach

Tracer Bullet (each slice is built end to end, storage to live page, and works on its own).

## Commands

```bash
pnpm install --frozen-lockfile
pnpm dev               # migrates local D1, then next dev
pnpm preview           # OpenNext build, local D1, real Workers runtime on :8787
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test              # Vitest (src/**/*.test.ts)
pnpm test:e2e          # Playwright + axe, desktop and mobile, runs pnpm preview
pnpm build:worker      # opennextjs-cloudflare build (the real build gate)
pnpm db:generate       # after editing src/db/schema.ts; commit drizzle/
pnpm db:migrate:local    # apply migrations to the local D1
pnpm db:migrate:remote   # production D1 (Workers Builds runs it on deploy)
pnpm db:migrate:preview  # shared preview D1 (Workers Builds runs it for previews)
pnpm db:reset:preview  # drops app tables in the shared preview DB; owner of the open schema PR only
```

## Layout

`src/app` routes · `src/components` shared UI · `src/lib` env, CSP, helpers · `src/db` schema and `getDb()` · `src/middleware.ts` nonce CSP, and (from slice 1, spec 0002) the `nb_voter` cookie · `drizzle/` generated SQL (never edit by hand) · `tests/e2e` Playwright · `docs/` scope, specs, `feature-map.md` (update when a route or feature changes) · `scripts/` · `wrangler.jsonc` (has a `previews` block) · `wrangler.preview-migrations.jsonc`.

## Rules

- TypeScript strict: no `any`, no `@ts-ignore`, exhaustive unions. Named exports, except where Next requires a default (pages, layouts, route files).
- zod validates every input: server actions, route handlers, form data and env. Parse at the edge, then pass typed values inward. Read env only through `getAppEnv()` in `src/lib/env.ts`.
- Small focused components. One job each, props typed, server components by default, `"use client"` only where needed.
- Accessibility to WCAG AA: semantic HTML, visible keyboard focus, contrast, labels. axe runs on every page in e2e. Design tokens: `docs/specs/0003-design-system/index.md`. Design system: build all UI to `docs/design/design.md`; token values live in `src/app/globals.css`.
- Functional style: pure functions, immutable data, side effects at the edges, explicit error returns for expected failures.
- Database: only `src/db/client.ts` touches D1, server only (`import "server-only"`). Pages that read D1 are `force-dynamic`.
- D1 schema: one open schema PR at a time (the lead sequences them). Migrations only add (new tables, new nullable columns) until launch. Run `pnpm db:generate` and commit `drizzle/`; CI fails on drift.
- Config names only, never values, in the repo. Names are in `.env.example` and `.dev.vars.example`: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXTJS_ENV`, `APP_ENV`, `ACCESS_AUD`, `ADMIN_EMAIL`, `TURNSTILE_SECRET_KEY`, `ABUSE_SALT`. Secrets go in `.dev.vars` (git ignored) or Cloudflare.
- Logs never carry idea text, the full voter id or error messages. `logPost` and `logVote` add `voter8` only when `isVoterId()` passed (`src/lib/log.ts`); vote logs hold only `event`, `code`, `voter8` and `errorName`.
- Tests focus on logic that matters (vote counts, one vote per browser, hiding). Vitest sits next to the code. Playwright covers pages, headers and accessibility.
- Checks before commit: simple-git-hooks runs lint-staged (ESLint and Prettier on staged files). Keep `pnpm lint`, `format:check`, `typecheck` and `test` green.

## CI contract

`.github/workflows/ci.yml` on every PR and push to `main`: install, lint, format check, typecheck, migration drift check, local migrate, Vitest, `build:worker`, worker size gate (gzip at most 3 MiB, raw at most 64 MiB, from `wrangler deploy --dry-run`), Playwright. The Workers Builds check and `pr-sync` are also required. PRs carry a filled `## Sync` section.

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md` (or a folder with `index.md`). Scope: `docs/scope/scope.md`.

## Agent skills

- [skills](.claude/skills/): `jsmastery-pro/skills`, the workflow skills (scope, architect, audit, develop, check, test, document, sync, debug), pinned in `skills-lock.json`

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
