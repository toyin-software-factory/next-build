# Feature map

Every page and user facing feature, by the name used in `docs/scope/scope.md`, with its route, who can reach it, how to get there, and where its code will live. Update it in any PR that adds, renames, moves or removes a page or feature, or changes who can reach it. Status `built` means the code exists; `planned` means the path is where it will live.

| Feature (scope #) | Route | Who | How to get there | Code | Status |
| --- | --- | --- | --- | --- | --- |
| Stack & architecture (1): placeholder home page | `/` | Anyone | Open the site | `src/app/page.tsx`, `src/app/layout.tsx` | built |
| Stack & architecture (1): robots and sitemap | `/robots.txt`, `/sitemap.xml` | Anyone | Direct URL | `src/app/robots.ts`, `src/app/sitemap.ts` | built |
| Stack & architecture (1): security headers and CSP | every route | n/a | n/a | `src/middleware.ts`, `src/lib/csp.ts`, `next.config.ts` | built |
| Coding standards & tooling (2) | n/a (no page) | Developers | `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | `eslint.config.mjs`, `.prettierrc`, root `AGENTS.md` | planned |
| Data model (3) | n/a (no page) | Server only | n/a | `src/db/schema.ts`, `drizzle/` | planned |
| Design system & UI foundation (4) | n/a (no page) | Everyone | n/a | `design.md`, `src/components/`, `src/app/globals.css` | planned |
| Suggest an idea and see the board (5) | `/` | Anyone | Open the site | `src/app/page.tsx`, `src/components/` | planned |
| Upvoting (6) | `/` (vote button on each idea) | Anyone, one vote per idea per browser | Tap the vote button | `src/app/`, `src/components/`, `src/db/` | planned |
| Admin sign in (7) | `/admin` and every admin action | Toyin's email only | Cloudflare Access login, then `/admin` | `src/lib/access.ts`, `src/app/admin/` | planned |
| Hide spam (8) | `/admin` | Toyin's email only | Sign in, then Hide or Unhide on an idea | `src/app/admin/`, `src/db/` | planned |
| Abuse protection (9) | `/` (posting and voting) | Anyone | n/a (invisible check, friendly refusal) | `src/lib/turnstile.ts`, `src/lib/rate-limit.ts` | planned |
| SEO and share card (10) | `/` (metadata, share image) | Anyone | Share a link | `src/app/layout.tsx`, `src/app/opengraph-image.tsx` | planned |
