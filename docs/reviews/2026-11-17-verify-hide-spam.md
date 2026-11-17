# Check verify: hide spam (specs 0006, 0002, 0003)

**Verdict: PASS. Hide and Unhide work end to end in the local Workers runtime, hidden ideas leave the public board, and the one spec criterion this feature owns (AC-5) is met. Production Access (AC-13) and the preview Host smoke test (AC-10) belong to feature 7 and are not part of this check.**

Next: `/test hide spam`. The feature stays `in-progress` until Michael marks it `done`.

## How it was run

- Local Workers runtime (`pnpm preview`, real workerd, local D1) with Playwright in Chromium, on four projects: desktop, mobile, admin-desktop and admin-mobile. The admin projects send a signed `Cf-Access-Jwt-Assertion` header from the local test key set (`pnpm access:token`).
- `pnpm exec vitest run`: 161 tests passed, including `HideButton.test.tsx`, `AdminIdeaList.test.tsx` (with axe) and `admin-queries.test.ts`.
- Screenshots and a short video of hide and unhide are published on the PR under `## Proof`.
- Every idea created for this check has a unique name (for example `Buy my pills now desktop 0438`). They stay in the local D1 only.

## Per behavior

| Behavior | Result | Evidence |
|----------|--------|----------|
| `/admin` lists every idea, visible and hidden | met | admin e2e: table on desktop, labelled list on phone, count line "113 ideas, 1 hidden." (`admin-list-desktop.png`, `admin-list-phone.png`). |
| Hide | met | Pressing Hide on a row set the badge to Hidden with the eye off icon, the button to Unhide, announced "Idea hidden." in `#status`, and kept keyboard focus on the button (admin e2e "hide removes an idea from the public board and unhide brings it back"). |
| Hidden idea gone from the public board | met | The same test loads `/` and the idea text is absent (`board-without-spam-desktop.png`, `board-without-spam-phone.png`). A hidden idea also cannot be voted on, proven by the query tests of feature 6. |
| Unhide | met | The same test presses Unhide, the badge returns to Visible and the idea is back on the public board. |
| Failure and ended sign in | met by tests | `HideButton.test.tsx` proves the error message with Try again resending the same state, and the session ended message with Reload for `forbidden` or a thrown call. Not driven in a browser. |
| Phone layout | met | At 390 px wide `scrollWidth` is 390, so there is no sideways scroll (`admin-list-phone.png`, `admin-hidden-phone.png`). |
| Accessibility | met | axe reports 0 violations on `/admin` on desktop and phone with seeded rows, and in the component test. |

## Spec 0006 criteria this feature touches

| AC | Result | Evidence |
|----|--------|----------|
| AC-5 `setHidden` with no token is `forbidden`, writes nothing | met | A real POST to `/` with the `setHidden` action id, no token and a same site `Origin` (`admin.actions.spec.ts`). The response did not contain `"ok":true`, and after a reload the seeded idea was still on the board. Note: Next does not run an action from another route's bundle, so the body is `{}` rather than `"code":"forbidden"`. The test accepts either, and the guard coverage unit test proves `forbidden` first, before validation and before any database read. |
| AC-6 admin queries need the `Admin` proof | met | `listIdeasForAdmin`, `countIdeasForAdmin` and `setIdeaHidden` all take `Admin`. The page and the action call `requireAdmin` first. ESLint blocks any import of `admin-queries` outside admin code. |
| AC-1 and AC-2 | met | Unchanged since feature 7. The new page sits behind the same middleware gate, and the existing 403 tests still pass. |

## Specced surfaces

All built: the `AdminRow` (table row and list item), the table and list from one data set, the Hide and Unhide button, the status badge, the capped note, the empty state and the back link. No migration was specced. None missing, none unapplied.

## Not exercised

- The failure and session ended states in a browser (component tests only).
- Screen reader output (the status text is asserted in the DOM, not heard).
- AC-13 on production and AC-10 on a preview, both owed by feature 7.
- `agent-browser` could not be installed in this sandbox, so the proof uses Playwright for screenshots and video.

## Worth a look in review

- The list holds at most 500 ideas (`ADMIN_LIST_LIMIT`), with a note when there are more. The counts in the summary line are not capped.
- Six new copy rows were added to the spec 0003 copy table, which is outside the task's file list. It follows the rule that copy lives in that table.

## Files ticked

Scope: ticked `Build it` and its two sub tasks on feature 8, set the status to `in-progress`, and ticked `Build it inside the slices` on Foundations 3 and 4 (features 5, 6 and 8 are built). `Verify it` ticked on feature 8. The full Playwright run passed (70 tests) and `pnpm build:worker` succeeded.
