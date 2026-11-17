# Test: hide spam (specs 0006, 0002, 0003)

**Result: all 223 Vitest tests pass and the admin Playwright specs pass. The feature already had good tests, so this run added 4 unit tests and 1 browser test where the checklist had a gap. No bugs found.**

## What was checked

You asked for hiding to be tested: counts, hiding, and hidden ideas gone from the board and not votable.

| Behavior | Where it is tested | Status |
|---|---|---|
| Admin list shows every idea, newest first, with votes and hidden time | `admin-queries.test.ts` | covered |
| Counts cover every idea and the hidden ones | `admin-queries.test.ts` | covered |
| Hide keeps the first hidden time, unhide clears it, not found is reported | `admin-queries.test.ts` | covered |
| Hide never touches votes | `admin-queries.test.ts` | covered |
| Hidden ideas are not on the public board | `queries.test.ts`, `admin-queries.test.ts`, e2e hide and unhide flow | covered |
| A hidden idea refuses a vote | `queries.test.ts`, `actions.test.ts` (set by a direct update) | covered, and now also after a real admin hide (added) |
| Hide with no token writes nothing (AC-5) | `actions.test.ts`, e2e POST to `/` with the real `setHidden` id | covered |
| Hide and Unhide button states, error, retry, session ended | `HideButton.test.tsx` (13 admin component tests with axe) | covered |
| Row and list render from one data set | `AdminIdeaList.test.tsx` | covered |
| Full flow in a browser, focus and announcement | `admin.signed-in.spec.ts` | covered |
| Admin list cap with the full count still shown | none | **added** |
| Session ended in a real browser | component tests only | **added** |

## Added

Four tests in `src/db/admin-queries.test.ts`:

1. After the admin hides an idea, a vote on it is refused with `idea_unavailable`, and after unhide the same vote is accepted and counted.
2. An existing vote survives hide and unhide, and the idea returns to the board with its vote and `voted` flag.
3. Hiding twice changes nothing, and showing a visible idea changes nothing (counts stay right).
4. With one more idea than `ADMIN_LIST_LIMIT`, the list holds exactly the limit, newest first, drops the oldest, and the counts still cover every idea (this is what the "Showing the newest 500 ideas" note depends on).

One Playwright test in `tests/e2e/admin.signed-in.spec.ts`: a failed hide call shows the sign in ended message and Reload, and changes nothing (see the admin sign in report).

## Not covered

- The `AdminRow` table and list switch is a CSS choice by width. The e2e queries pick whichever one is visible, so a break in one layout would show only in the phone or desktop project, which both run.
- Real production data and the feature 9 dashboard check belong to Michael.

## Commands

```
pnpm exec vitest run                       # 223 passed
pnpm exec playwright test admin.signed-in --project=admin-desktop --project=admin-mobile   # 8 passed
```
