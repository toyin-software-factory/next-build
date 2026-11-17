# Check verify: SEO and share card (spec 0008)

**Verdict: PASS. All 6 acceptance criteria are met. AC-1 to AC-4 and AC-6 were checked on production at https://next-build.jnr4u2.workers.dev after the b9b2ffa deploy. AC-5 comes from CI.**

Next: `/test seo and share card` (report below).

## How it was run

- `curl` against production for the home page head, `robots.txt`, `sitemap.xml` and the share image. The image was downloaded and its PNG header read.
- The share image was opened and looked at.
- Production first answered with the old title right after the merge, because the deploy was still building. The check was repeated once Workers Builds finished.

## Per criterion

| AC | Result | Evidence on production |
|----|--------|------------------------|
| AC-1 title, description, canonical | met | Title "Next Build: suggest and vote on what we build next". Description is 112 characters. `canonical` is `https://next-build.jnr4u2.workers.dev`. |
| AC-2 Open Graph and Twitter | met | `og:title`, `og:description`, `og:type` (website), `og:url` (`https://next-build.jnr4u2.workers.dev`), `og:site_name`, `og:image` (absolute, same host), width 1200, height 630, type PNG and alt text. `twitter:card` is `summary_large_image`, and `twitter:image` is the same URL as `og:image`. |
| AC-3 image | met | The `og:image` URL answers 200, `image/png`, `cache-control: public, max-age=0, must-revalidate`. The PNG header says 1200 by 630. The card reads "What should we build next?" with the sample idea row and is not cropped or clipped. |
| AC-4 robots and sitemap | met | `robots.txt` allows `/`, disallows `/admin` and names `https://next-build.jnr4u2.workers.dev/sitemap.xml`. `sitemap.xml` lists `https://next-build.jnr4u2.workers.dev/`. |
| AC-5 no new dependency, size gate | met by CI | The #23 diff does not touch `package.json`. The worker size gate passed in CI (1344 KiB gzip against a 3 MiB limit). |
| AC-6 one h1, axe | met | One `h1` in the production HTML. axe runs on the home page in the existing e2e suite. |

## Not exercised

- **Lighthouse** was not run (no Lighthouse in this sandbox). The scope's "Done when" mentions a basic Lighthouse SEO and accessibility check. The tags, robots, sitemap and axe results above cover the same ground, but the score itself is unmeasured.
- How the card looks inside Slack or X was not checked. The tags are correct, but no link was pasted into those apps.
- The `?opengraph-image.<hash>` part of the image URL comes from Next for cache busting. It is expected.

## Files ticked

Scope: `Verify it` on feature 10. Spec 0008 status set to `Accepted` with the feature.
