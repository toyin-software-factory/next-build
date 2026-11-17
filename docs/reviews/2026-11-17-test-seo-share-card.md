# Test: SEO and share card (spec 0008)

**Result: Playwright `seo.spec.ts` passes, 10 tests (5 on desktop and 5 on phone). Added 1 test and 1 assertion where something was missing. No bugs found.**

## Per criterion

| AC | Where it is tested | Status |
|----|--------------------|--------|
| AC-1 | `tests/e2e/seo.spec.ts`: title, description length 50 to 160, canonical is a site root URL | covered |
| AC-2 | `seo.spec.ts`: every `og:` tag, image size and alt, `twitter:card`, `twitter:image` | covered |
| AC-2 (one origin) | `seo.spec.ts`: canonical, `og:url` and `og:image` share one origin, `twitter:image` equals `og:image`, `twitter:image:alt` is set | **added** |
| AC-3 | `seo.spec.ts`: 200, PNG, 1200 by 630 | covered |
| AC-3 (cache header) | `seo.spec.ts`: a `cache-control` header is present | **added** (one assertion) |
| AC-4 | `seo.spec.ts`: robots allows `/`, disallows `/admin`, names the sitemap; sitemap lists the root | covered |
| AC-5 | CI worker size gate | covered by CI |
| AC-6 | `seo.spec.ts` (one `h1`), axe in the existing page specs | covered |

## Not covered

- The real production host (`https://next-build.jnr4u2.workers.dev`) is only checked by the verify report. A local run cannot know the production build variable, so the tests check the tags agree with each other, not the exact host.
- The look of the link preview in Slack or X (see the verify report). Lighthouse is done: 100 for SEO and accessibility, mobile and desktop.

## Commands

`pnpm exec playwright test tests/e2e/seo.spec.ts`: 10 passed. `pnpm lint` and `pnpm format:check` are clean.
