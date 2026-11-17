# Test report: suggest an idea and see the board

Date: 2026-11-17 · Task FSD-T19 · Spec [0004](../specs/0004-suggest-idea-board.md)

## Result

All checks pass: `pnpm lint`, `format:check`, `typecheck` and `pnpm test` (21 files, 222 tests). No application code changed.

## What was already covered (PR #12 and later)

Text rules, the post action, idempotent submission ids, board ordering and hidden ideas, the form and its counter, the board list, and Playwright pages with axe on desktop and phone.

## What this task added

| Spec 0004 area | Test | File |
|---|---|---|
| AC-6 empty board | heading, body, and the button moves focus to the idea field, axe clean | `src/components/EmptyState.test.tsx` |
| AC-7 board error | plain message with no technical detail, Try again calls `retry`, focus goes to the Ideas heading or the idea field after a retry, no focus theft without one, axe clean | `src/app/error.test.tsx` |
| AC-8 and AC-11 failed post | field is editable again and keeps the text | `src/components/IdeaForm.test.tsx` |
| AC-11 pending state | field is read only and busy, button says Adding…, a double press sends once, unlocks afterward | `src/components/IdeaForm.test.tsx` |
| AC-9 missing voter cookie | Try again loads the page first, then resends the same text with the same submission id | `src/components/IdeaForm.test.tsx` |
| AC-9 voter cookie | set on a page GET and an RSC GET, Secure except on localhost and 127.0.0.1, a valid cookie is kept, a bad one is replaced | `src/middleware.test.ts` |

## Not added

- An empty board browser test: the database is shared in e2e, so the component test covers it.
- A double click browser test: the component test pins it with a controlled pending promise, which is steadier.

## Heads up

None. No bugs found.
