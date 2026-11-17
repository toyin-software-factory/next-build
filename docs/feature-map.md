# Feature map

Every page and user facing feature, by the name used in `docs/scope/scope.md`, with its route, who can reach it, how to get there, and where its code will live. Update it in any PR that adds, renames, moves or removes a page or feature, or changes who can reach it. Status `built` means the code exists; `planned` means the path is where it will live.

| Feature (scope #) | Route | Who | How to get there | Code | Status |
| --- | --- | --- | --- | --- | --- |
| Stack & architecture (1): robots and sitemap | `/robots.txt`, `/sitemap.xml` | Anyone | Direct URL | `src/app/robots.ts`, `src/app/sitemap.ts` | built |
| Stack & architecture (1): security headers and CSP | every route | n/a | n/a | `src/middleware.ts`, `src/lib/csp.ts`, `next.config.ts` | built |
| Coding standards & tooling (2) | n/a (no page) | Developers | `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | `eslint.config.mjs`, `.prettierrc`, root `AGENTS.md` | planned |
| Data model (3) | n/a (no page) | Server only | n/a | `src/db/schema.ts`, `src/db/queries.ts`, `drizzle/` | built (ideas and votes tables, post, board and vote queries; admin list and hide queries built) |
| Design system & UI foundation (4) | n/a (no page) | Everyone | n/a | `docs/design/design.md`, `src/components/`, `src/app/globals.css` | built (tokens, form, list, empty and error states; vote button built; admin row and table built) |
| Suggest an idea and see the board (5) | `/` (the board and the idea form; failures show `error.tsx`) | Anyone | Open the site, type an idea, press Enter or Add idea | `src/app/page.tsx`, `src/app/actions.ts`, `src/app/error.tsx`, `src/components/` | built |
| Upvoting (6) | `/` (vote button on each idea) | Anyone, one vote per idea per browser | Tap the vote button | `src/components/VoteButton.tsx`, `src/app/actions.ts`, `src/db/queries.ts` | built (vote, unvote, optimistic count, row errors; the `checkVote` limits come with feature 9) |
| Admin sign in (7) | `/admin` and every admin action | Toyin's email only | Cloudflare Access login, then `/admin` | `src/lib/access.ts`, `src/lib/admin-refusal.ts`, `src/db/admin-queries.ts`, `src/middleware.ts`, `src/app/admin/` | built (verifier, 403 in middleware, `requireAdmin`, `setHidden` action, thin page; production Access setup pending) |
| Hide spam (8) | `/admin` | Toyin's email only | Sign in, then Hide or Unhide on an idea | `src/app/admin/page.tsx`, `src/components/admin/`, `src/db/admin-queries.ts` | built (admin list of every idea, Hide and Unhide with optimistic UI and a session ended state; hidden ideas leave the board) |
| Abuse protection (9) | `/` (posting and voting) | Anyone | n/a (invisible check, friendly refusal) | `src/lib/turnstile.ts`, `src/lib/rate-limit.ts` | planned |
| SEO and share card (10) | `/` (metadata, share image) | Anyone | Share a link | `src/app/layout.tsx`, `src/app/opengraph-image.tsx` | planned |
