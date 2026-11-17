# Verify: stack and architecture (scope feature 1)

**Verdict: PASS** (with one item noted below).
**Date**: 2026-11-17. **Checked on**: `main` at `0c1324f`. **Spec**: [0001](../specs/0001-stack-architecture/index.md).
**Done when** (scope): the stack is recorded in a spec, the empty app runs locally, CI runs lint, typecheck, test and build, and a deploy to `workers.dev` works.

## Evidence

| Behavior | How you can see it | Result |
|---|---|---|
| The stack is recorded in a spec | `docs/specs/0001-stack-architecture/index.md` (status In Progress, rationale beside it) | Met |
| Exact pins match the spec | `pnpm install --frozen-lockfile` on Node 26.13.0 and pnpm 12.18.0 printed `+ vitest 5.1.0`, `+ wrangler 4.158.0`, `Done in 25.4s`, exit 0 | Met |
| The app runs locally in the real Workers runtime | `pnpm preview` (OpenNext build, local D1, `wrangler`), then `curl -i http://localhost:8787/` gave `200`, title `Next Build`, a nonce CSP header, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy`. `/robots.txt` and `/sitemap.xml` gave `200` | Met |
| CI runs every step of the contract | [CI run 44067199518](https://github.com/toyin-software-factory/next-build/actions/runs/44067199518) on `main`: Install, Lint, Format, Typecheck, Migration drift check, Migrate local D1, Unit tests, OpenNext build, Worker size gate, Playwright, report upload, all `success` | Met |
| The size gate runs and passes | Same run: `Worker size: 5186.21 KiB raw, 1105.40 KiB gzipped` (limits 65536 and 3072 KiB) | Met |
| CI is green on recent merges | Last five `main` runs (#10, #13, #14, #15, #16) all `success` | Met |
| `main` deploys to `workers.dev` | `curl -I https://next-build.jnr4u2.workers.dev` gave `HTTP/2 200` with the nonce CSP and security headers. `/robots.txt` gave `200` | Met |
| Every PR gets a preview that uses the separate preview database | PR 15 check `Workers Builds: next-build` passed, with its build log under `production/previews/spec-0007-abuse-protection/`. `wrangler.jsonc` `previews` block binds `DB` to `next-build-preview` (not the production database) | Met by build and config |

## Noted, not a failure

- I did not open a preview URL in a browser. The proof that a preview shows different data from production is tracked separately (spec 0004 AC-13, Michael's commitment C-3, using Jim's PR #12). This report covers that a preview builds and is bound to the preview database.
- The required checks on `main` (`ci`, Workers Builds, `pr-sync`) are a Toyin dashboard action, not something I can read from here.

Ran via `pnpm preview`, `curl`, and `gh run view`. Local output was captured in the scratch area, not committed.
