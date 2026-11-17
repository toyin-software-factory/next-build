# Verify: coding standards and tooling (scope feature 2)

**Verdict: PASS**.
**Date**: 2026-11-17. **Checked on**: `main` at `0c1324f`.
**Done when** (scope): root `AGENTS.md` reflects the real stack, and lint, format and typecheck run clean in CI.

## Evidence

| Behavior | How you can see it | Result |
|---|---|---|
| `pnpm lint` is clean | Exit 0 (ESLint 9, typescript-eslint `strictTypeChecked`, jsx-a11y) | Met |
| `pnpm format:check` is clean | Exit 0 (Prettier with the Tailwind plugin) | Met |
| `pnpm typecheck` is clean | Exit 0 (`next typegen && tsc --noEmit`) | Met |
| `pnpm test` is green | Exit 0, `Test Files 2 passed (2)`, `Tests 10 passed (10)` (`src/lib/env.test.ts`, `src/lib/csp.test.ts`) | Met |
| The same checks run clean in CI | [CI run 44067199518](https://github.com/toyin-software-factory/next-build/actions/runs/44067199518): Lint, Format, Typecheck, Unit tests all `success` | Met |
| `AGENTS.md` matches the real stack | Pins in `AGENTS.md` (Next.js 16.4.5, React 19.3.1, Drizzle 0.45.4, zod 4.6.7, Vitest 5.1.0, pnpm 12.18.0, wrangler 4.158) match `package.json` and the install output. Commands listed there all exist as scripts in `package.json` | Met |
| Pre commit hook exists | `package.json` has `prepare: simple-git-hooks` (lint-staged on staged files) | Met by config |

## Noted, not a failure

- `eslint.config.mjs` has no `no-restricted-*` rules today. The conventions in `AGENTS.md` that a check could enforce (env only through `getAppEnv()`, `D1` only through `src/db/client.ts`, named exports) rely on review. `no any` and `no @ts-ignore` come from typescript-eslint strict. The upcoming admin sign in build adds the first project rules, each with a test, so I added no lint tests here.
- The commit hook itself was not triggered in this run (no commit of code files).
