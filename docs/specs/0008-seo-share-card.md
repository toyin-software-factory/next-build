# 0008. Slice 4: SEO and share card

**Date**: 2026-11-17
**Status**: Accepted
**Feature**: scope feature 10, "SEO and share card" (Slice 4)

## Summary

The board page gets a proper title, description, canonical link, Open Graph and Twitter tags, and one share image, so a link looks right in Slack, X and search. `robots.ts` and `sitemap.ts` already exist from the scaffold (spec 0001) and stay as they are.

## Decision

**The share image is a static PNG (1200 by 630), not a generated one.** The card never shows live data, so there is nothing to generate. `next/og` would add WebAssembly to the Worker (the size gate is 3 MiB gzip) and a runtime cost for no gain. The PNG lives at `src/app/opengraph-image.png` with `opengraph-image.alt.txt`, and Next adds the `og:image`, size, type and alt tags itself. Twitter falls back to the same image. The source markup is kept in `scripts/share-card.html` so the image can be redrawn with Playwright (`scripts/share-card.mjs`). The card uses the light design tokens from `globals.css` and the Inter font.

**Metadata** (in `src/app/layout.tsx`): title "Next Build: suggest and vote on what we build next", a description under 160 characters, `alternates.canonical: "/"`, `openGraph` (type website, siteName, url, title, description), `twitter` (`summary_large_image`), all resolved against `metadataBase` from `NEXT_PUBLIC_SITE_URL`. `/admin` keeps `noindex` and is disallowed in robots (spec 0006).

## Acceptance criteria

- **AC-1**: `/` has a `<title>`, a meta description of 50 to 160 characters, and a canonical link to the site root.
- **AC-2**: `/` has `og:title`, `og:description`, `og:type`, `og:url`, `og:site_name`, `og:image` (absolute URL, 1200 by 630, with alt), and `twitter:card=summary_large_image` with an image.
- **AC-3**: The `og:image` URL returns a PNG of 1200 by 630 with a 200 status and a cache header.
- **AC-4**: `/robots.txt` allows `/`, disallows `/admin`, and names the sitemap. `/sitemap.xml` lists the root URL.
- **AC-5**: No new runtime dependency, and the worker size gate still passes.
- **AC-6**: The page has one `h1` and passes axe (already covered by e2e).

## Build plan

1. Metadata in the layout.
2. Static share image and its source script.
3. e2e for the head tags, image and robots, plus the feature map and scope.
