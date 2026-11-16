# Scope: Next Build

One public page where anyone can suggest what we build next (one text box, 140 characters) and upvote ideas. Ideas are sorted by votes, each browser gets one vote per idea, and Toyin can hide spam from a private admin page. Runs on Cloudflare Workers, like the portfolio.

**Build approach:** Tracer Bullet (each slice is built end to end, storage to live page, and works on its own).
**Workflow:** Beta (after `/develop`: `/check verify`, then `/test` where it matters). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | planned |
| 2 | Coding standards & tooling | Foundation | planned |
| 3 | Data model | Foundation | planned |
| 4 | Design system & UI foundation | Foundation | planned |
| 5 | Suggest an idea and see the board | Slice 1 | planned |
| 6 | Upvoting | Slice 2 | planned |
| 7 | Admin sign in | Slice 3 | planned |
| 8 | Hide spam | Slice 3 | planned |
| 9 | Abuse protection | Slice 4 | planned |
| 10 | SEO and share card | Slice 4 | planned |

## Foundations

### 1. Stack & architecture · needs a decision
Pick the framework, storage and hosting setup on Cloudflare Workers (matching the portfolio), then scaffold a runnable app with CI that deploys.
**Done when:** the stack is recorded in a spec, the empty app runs locally, CI runs lint, typecheck, test and build, and a deploy to the free `workers.dev` address works (no custom domain for now).
- [ ] Decide the stack (spec): `/architect stack & architecture`
- [ ] Scaffold from the decision: `/develop stack & architecture`

### 2. Coding standards & tooling
Capture the conventions from the real scaffold into root `AGENTS.md`, then install the matching lint and format tooling.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format and typecheck run clean in CI.
- [ ] Capture conventions + tooling choices: `/audit`

### 3. Data model · needs a decision
Ideas (text, created time, hidden flag, vote count) and votes (one per idea per browser), shaped so sorting by votes stays fast and counts stay correct.
**Done when:** the model supports posting, voting, unvoting, hiding and sorting by votes without a breaking change later.
- [ ] Design it (spec): `/architect data model`

### 4. Design system & UI foundation · needs a decision
A small, clean visual language for one page: type, color, spacing, the idea row, the vote button, the input. Backed by Mobbin references.
**Done when:** `design.md` covers tokens and the few components, with light and dark, keyboard focus and WCAG AA contrast.
- [ ] Design it (spec): `/architect design system & UI foundation`

## Slice 1: Suggest an idea and see the board

### 5. Suggest an idea and see the board · needs a decision
The public page: one text box (140 characters max, counter shown) and the list of visible ideas. This is the walking skeleton, live on Workers end to end.
**Done when:** a visitor can post an idea of 1 to 140 characters, sees it on the list right away, empty and over limit input are refused with a clear message, and the empty board and error states render.
- [ ] Design it (spec): `/architect suggest an idea and see the board`

## Slice 2: Upvoting

### 6. Upvoting · needs a decision
A vote button on each idea. One vote per idea per browser, tapping again removes it, and the list is sorted by votes.
**Done when:** a browser can vote once per idea, a second tap removes the vote, the count updates right away, the same browser can't double count by repeated requests, and the list is ordered by votes (newest first on ties).
- [ ] Design it (spec): `/architect upvoting`

## Slice 3: Moderation

### 7. Admin sign in · needs a decision
A private admin area only Toyin can reach.
**Done when:** `/admin` and every admin action are refused for anyone but Toyin, checked on the server.
- [ ] Design it (spec): `/architect admin sign in`

### 8. Hide spam
An admin page listing every idea, visible and hidden, with Hide and Unhide.
**Done when:** Toyin can hide or unhide any idea in one click; hidden ideas disappear from the public list and can't be voted on.
- [ ] Build it: `/develop hide spam`

## Slice 4: Hardening and polish

### 9. Abuse protection · needs a decision
Keep counts honest and the board clean without sign up: per visitor limits on posting and voting, and an invisible bot check on posting.
**Done when:** bursts of posts or votes from one visitor are refused with a friendly message, and scripted posts without the bot check pass are rejected.
- [ ] Design it (spec): `/architect abuse protection`

### 10. SEO and share card
Title, description and a share image so links look good in Slack, X and search.
**Done when:** the page has a proper title, meta description and Open Graph card, and passes a basic Lighthouse SEO and accessibility check.
- [ ] Build it: `/develop seo and share card`

## Deferred
Out of scope for the first launch, kept so the plan stays honest.
- **Product analytics**: page views and votes over time · needs a decision
- **Auto hold suspicious ideas**: hold ideas with links or banned words for review · needs a decision
- **Mark as building / shipped**: show which ideas we picked

## Legend

**The decision box.** Every feature carries exactly one, the sub-task whose label ends with `(spec)`. Skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Workflow tier tag** beside a heading (e.g. `· GA`) sets that one feature's rigor; no tag inherits the default. **Beta** = `/check verify` then `/test`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
