# Slice 1 Mobbin references

These are screen references for the Slice 1 screens (spec 0004): the idea form, the board rows, the empty state and the error state. They were pulled from the Mobbin MCP on 2026-11-17. The design language itself is in [design.md](design.md) and spec 0003. Use these to check the shape of each pattern, not to copy styling.

## Idea form

| Reference | What to take from it |
|---|---|
| Digg, Give Feedback: https://mobbin.com/screens/0270f6df-cdad-4d2e-ba37-dc90c5195df4 | One short text box, one clear Send button underneath. This is the closest match to a one line idea form. |
| Zapier, feature request form: https://mobbin.com/screens/643c68df-d195-4803-89b8-19757e1da35d | A visible label, a hint line under the field, and a full width submit button. Good model for where the "n / 140" counter and its message sit. |

Not copied: the multi field forms (name, age, date, attachments). Our form has one field.

## Board rows

| Reference | What to take from it |
|---|---|
| Peerlist, Project Spotlight: https://mobbin.com/screens/7345ce03-b10b-41f5-87fb-ae4b0a766874 | A single column list with a bordered vote chip on the right (arrow over the count) and the text taking the rest of the width. Closest to our row. |
| Featurebase, feedback posts list: https://mobbin.com/screens/16cc75ad-3a5b-4895-9eef-220892a1f41f | Dense rows with the vote count first, then the title, then the date. Shows how little meta a row needs. |

Not copied: status badges, tags, priority labels, avatars and side navigation (none exist on our board).

## Empty state

| Reference | What to take from it |
|---|---|
| Productboard, Collect feedback at scale: https://mobbin.com/screens/209665bb-42c4-4730-89a5-75dd0d3d2a0f | A short heading, one sentence, one button. This is the shape of our "No ideas yet" state. |
| Canny, empty board (also in spec 0003): https://mobbin.com/screens/7becac2a-231f-4f41-af27-a60ee3dcadd5 | A quiet icon, a heading and one line of help. Calm and low noise. |
| Hotjar, No feedback available: https://mobbin.com/screens/29d2e8c4-9d66-4d76-8d7e-2ed66ab3f0f1 | Same pattern with a small icon above the text and one outlined button. |

Not copied: illustrations and the grid of recommended actions (Featurebase), which are too heavy for a board with one next step.

## Error state

| Reference | What to take from it |
|---|---|
| Notion, Something went wrong: https://mobbin.com/screens/e00ca642-dcfd-4797-aec7-9ae0d780ec3d | A plain sentence with a small Try again button, shown in place of the content. Fits our board load error. |
| Revolut Business, Connection issue: https://mobbin.com/screens/b719158e-0a19-4b2e-8cc0-5217648ea20a | An icon, one short line and a Try again button. Shows the icon plus text pairing that spec 0003 asks for. |
| Buffer, failed post: https://mobbin.com/screens/af871c1d-00d1-4c74-a4a4-87ae2e9455c8 | An inline message that sits on the item that failed, with a retry action beside it. This is the pattern for a row level error such as a failed vote (Slice 2). |

Not copied: the mascot illustration (Care.com), the contact support wording, and any colour fills beyond the error colour in spec 0003.

## Where these go next

Link the ones you use in the PR body for FSD-T07 and add them to the Mobbin section of design.md when the screens are built.
