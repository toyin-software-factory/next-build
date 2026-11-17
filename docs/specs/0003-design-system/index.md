# 0003. Design system and UI foundation for the Next Build board

**Date**: 2026-11-16
**Status**: In Progress

## Summary

Next Build gets a small, calm visual language: neutral greys, one blue accent, one font, light and dark modes that follow the visitor's device, and a handful of components (idea form with a 140 character counter, idea row with a vote button, empty state, error message, admin row with Hide and Unhide). Every colour pair is checked against WCAG AA contrast, every control has a visible keyboard focus ring, and nothing relies on colour alone. The tokens are written once as Tailwind v4 theme values, so later features reuse them instead of inventing a look. The brand feel (calm and neutral) is the recommended default; Toyin has been asked to confirm it, and swapping it only means changing the accent token values in section "Colour tokens".

## Structure

- This file: the build spec (tokens, components, accessibility rules, build plan).
- [rationale.md](rationale.md): Mobbin references, options considered, and the contrast checks.
- [docs/design/design.md](../../design/design.md): the human readable design language with the Mobbin references and component anatomy. Tokens live here in this spec; `design.md` points back to it.

## Requirements

This spec covers scope feature 4 (Design system and UI foundation). It is a design decision spec: it fixes the look and the component rules, so slices 1 to 3 do not invent them. `/develop` turns it into code inside the first UI slice (feature 5), see `## Build plan`.

**User stories**:
- As a visitor, I want a page that is easy to read and works on my phone, so I can add an idea or vote in seconds.
- As a keyboard or screen reader user, I want every action reachable and announced, so I can use the board without a mouse.
- As Toyin, I want a consistent look with a clear Hide and Unhide control, so I can clean up spam quickly.
- As a builder, I want named tokens and component rules, so every slice looks the same without redesign.

**Acceptance criteria**:
- **AC-1**: Light and dark colour tokens are defined once as CSS values and exposed as Tailwind v4 theme tokens; components use tokens only, never raw hex values.
- **AC-2**: Every text and icon colour pair listed in the contrast table meets WCAG AA (4.5:1 for text, 3:1 for icons, borders and focus rings that identify a control) in both modes.
- **AC-3**: The page follows the device colour scheme (`prefers-color-scheme`) with no flash of the wrong theme and no manual toggle at launch.
- **AC-4**: The idea input shows a live "n / 140" counter. The counter and the server both use one shared `normalizeIdea()` (`src/lib/idea.ts`, spec 0002 rules) and count code points. Empty and over limit submits show an inline message tied to the field, and nothing is cut off silently.
- **AC-5**: The idea row shows the idea text, the vote count and a vote button. The button's state (voted or not) is visible without colour alone, exposed with `aria-pressed`, and changing it causes no layout shift. The button sends the wanted state (on or off), so repeating the request is safe.
- **AC-6**: The empty board and the board error render with a clear message and one next step.
- **AC-7**: The admin row shows each idea's text, vote count, an absolute UTC date and a Hidden badge, with one Hide or Unhide button that names its idea. Hidden rows stay readable at AA contrast. Small screens use a labelled list, wide screens a table.
- **AC-8**: Every interactive element has a visible `:focus-visible` ring, a tap target of at least 44 by 44 px, and works with keyboard only (Tab order follows reading order; Enter submits the form; Space and Enter press buttons).
- **AC-9**: Successful results (idea added, vote changed, hidden or unhidden) are announced through one polite status region, and the same message is announced again when it repeats. Failures are announced once by the error message's own alert, never also through the status region. Focus stays on the control used, except when that control is removed or exists to move focus (and focus is never pulled from somewhere the user has already moved on to): after a successful Try again on a board render error, focus goes to the "Ideas" heading (or to the idea field if the board is empty); after a successful Try again on a failed submit, focus goes to the idea field; after a successful Try again on a failed vote or hide, focus goes back to that row's button; and the empty state's "Write an idea" button moves focus to the idea field.
- **AC-10**: The layout works from 320 px to desktop with no horizontal scroll, respects `prefers-reduced-motion`, and keeps working at 200 percent text zoom.

## Decision

**Chosen option**: Option 1: calm neutral system, one blue accent, built from Tailwind v4 theme tokens with `light-dark()` colours.

The board uses neutral surfaces, a single blue accent for actions and the voted state, system colour scheme only, one self hosted variable font, and a short list of components built on native HTML elements.

**Implementation skills**: `modern-web-guidance` (`.claude/skills/modern-web-guidance/`): guides `dark-mode`, `color`, `dynamic-sort`, `accessibility` shaped the dark mode, contrast, announcement and reorder rules below.

## Design system

### Visual direction

Quiet and content first: the ideas are the product, so the chrome stays out of the way. A single centred column, generous space, thin borders, no shadows except a small one on the form card. The vote control is the one strong element, taken from the Mobbin boards (a bordered chip with an up arrow and count, to the right of each row). See [rationale.md](rationale.md) for the references.

### Colour tokens

Tokens are raw CSS custom properties on `:root`, each with a light and dark value through `light-dark()`, with a `prefers-color-scheme` fallback for older browsers (per the dark mode guide). `<meta name="color-scheme" content="light dark">` and `:root { color-scheme: light dark }` are required.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#fafafa` | `#0a0a0a` | Page background |
| `--surface` | `#ffffff` | `#171717` | Cards, rows, inputs |
| `--text` | `#171717` | `#fafafa` | Body and headings |
| `--text-muted` | `#525252` | `#a3a3a3` | Secondary text, counter, dates |
| `--border` | `#e5e5e5` | `#262626` | Decorative dividers between rows (not the only cue for anything) |
| `--border-strong` | `#737373` | `#8a8a8a` | Input and button outlines (identifies a control, needs 3:1) |
| `--accent` | `#1d4ed8` | `#60a5fa` | Primary button, voted state, focus ring, links |
| `--accent-fg` | `#ffffff` | `#0a0a0a` | Text on an accent fill |
| `--accent-soft` | `#eff6ff` | `#172554` | Voted chip background |
| `--danger` | `#b91c1c` | `#f87171` | Error text and icon |
| `--success` | `#15803d` | `#4ade80` | Success text and icon |
| `--warning` | `#a16207` | `#facc15` | Counter near the limit |
| `--tint-hover` | 6% of `--text` over the control | same rule | Hover fill on buttons and chips |
| `--tint-press` | 12% of `--text` over the control | same rule | Pressed fill |

State rules (no layout shift, no size change): hover adds `--tint-hover`, pressed adds `--tint-press`, both as `color-mix(in srgb, var(--text) 6%, transparent)` and `12%` laid over the control's own fill. Disabled or sending (`aria-disabled="true"`) keeps the same colours at 70 percent opacity with `cursor: progress` (inactive controls are exempt from contrast rules, and the label stays readable). The primary button, when hovered, uses the same tints over `--accent`.

Contrast results (computed with the WCAG relative luminance formula; all pass):

| Pair | Light | Dark | Needed |
|---|---|---|---|
| `--text` on `--bg` | 17.18 | 18.97 | 4.5 |
| `--text` on `--surface` | 17.93 | 17.18 | 4.5 |
| `--text-muted` on `--bg` | 7.49 | 7.85 | 4.5 |
| `--text-muted` on `--surface` | 7.81 | 7.11 | 4.5 |
| `--accent` on `--surface` (links, icon, focus ring) | 6.70 | 7.05 | 4.5 and 3 |
| `--accent` on `--bg` | 6.42 | 7.79 | 4.5 |
| `--accent-fg` on `--accent` (primary button) | 6.70 | 7.79 | 4.5 |
| `--accent` on `--accent-soft` (voted chip) | 6.16 | 5.78 | 4.5 |
| `--text` on `--accent-soft` | 16.47 | 14.08 | 4.5 |
| `--danger` on `--surface` | 6.47 | 6.48 | 4.5 |
| `--success` on `--surface` | 5.02 | 10.29 | 4.5 |
| `--warning` on `--surface` | 4.92 | 11.71 | 4.5 |
| `--border-strong` on `--surface` | 4.74 | 5.19 | 3 |
| `--border-strong` on `--bg` | 4.54 | 5.73 | 3 |

If Toyin picks a different brand colour, re-run these pairs before merging; the table is the check.

Forced Colors Mode: components keep a real `border` or `outline` (never only a shadow or background), so state survives. Use system keywords (`CanvasText`, `Highlight`, `ButtonText`) in a `@media (forced-colors: active)` block for the vote chip's voted state and the focus ring.

### Tailwind v4 mapping

Per spec 0001 (Tailwind configured in CSS). The raw values live in the global stylesheet; `@theme inline` maps them to utilities so `bg-surface`, `text-muted`, `border-strong`, `bg-accent` and so on work and follow the colour scheme.

```css
:root {
  color-scheme: light dark;
  /* Light values: used where light-dark() is not supported. */
  --bg: #fafafa;
  --surface: #ffffff;
  --text: #171717;
  --text-muted: #525252;
  --border: #e5e5e5;
  --border-strong: #737373;
  --accent: #1d4ed8;
  --accent-fg: #ffffff;
  --accent-soft: #eff6ff;
  --danger: #b91c1c;
  --success: #15803d;
  --warning: #a16207;
  accent-color: var(--accent);
}
/* Dark values: used where light-dark() is not supported. */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0a0a0a;
    --surface: #171717;
    --text: #fafafa;
    --text-muted: #a3a3a3;
    --border: #262626;
    --border-strong: #8a8a8a;
    --accent: #60a5fa;
    --accent-fg: #0a0a0a;
    --accent-soft: #172554;
    --danger: #f87171;
    --success: #4ade80;
    --warning: #facc15;
  }
}
/* Browsers that parse light-dark(): these declarations replace the fallbacks above. */
@supports (color: light-dark(#fff, #000)) {
  :root {
    --bg: light-dark(#fafafa, #0a0a0a);
    --surface: light-dark(#ffffff, #171717);
    --text: light-dark(#171717, #fafafa);
    --text-muted: light-dark(#525252, #a3a3a3);
    --border: light-dark(#e5e5e5, #262626);
    --border-strong: light-dark(#737373, #8a8a8a);
    --accent: light-dark(#1d4ed8, #60a5fa);
    --accent-fg: light-dark(#ffffff, #0a0a0a);
    --accent-soft: light-dark(#eff6ff, #172554);
    --danger: light-dark(#b91c1c, #f87171);
    --success: light-dark(#15803d, #4ade80);
    --warning: light-dark(#a16207, #facc15);
  }
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-text: var(--text);
  --color-muted: var(--text-muted);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-accent: var(--accent);
  --color-accent-fg: var(--accent-fg);
  --color-accent-soft: var(--accent-soft);
  --color-danger: var(--danger);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --radius-control: 0.5rem;
  --radius-card: 0.75rem;
  --breakpoint-admin: 40rem;
}
```

`--breakpoint-admin` (40rem, 640 px) is the one breakpoint where the admin list becomes a table (Tailwind gives it an `admin:` variant). `@theme inline` is required so utilities point at the live `light-dark()` variable instead of a value frozen at build time. The scaffold or first UI PR proves a utility flips with the device scheme.

### Type

One family: Inter variable, loaded with `next/font` (self hosted at build, no request to a font host, so no CSP change). Fallback `ui-sans-serif, system-ui`. Numbers in counts and the counter use `font-variant-numeric: tabular-nums` so the layout does not jitter.

| Role | Size / line height | Weight | Tailwind |
|---|---|---|---|
| Page title | 28 / 36 px (24 / 32 under 400 px) | 650 | `text-3xl` (custom) |
| Section label | 14 / 20 | 600 | `text-sm font-semibold` |
| Body and idea text | 16 / 24 | 400 | `text-base` |
| Meta (date, counter, badge) | 14 / 20 | 400 or 500 | `text-sm` |
| Vote count | 16 / 24 | 600, tabular | `text-base font-semibold` |

Body text is never below 16 px (stops iOS zoom on input focus). Use `text-wrap: pretty` on idea text and `text-wrap: balance` on the page title. Long words wrap with `overflow-wrap: anywhere`.

### Spacing, size and shape

- Tailwind's default 4 px spacing scale; the page uses 4, 8, 12, 16, 24, 32 only.
- Content column: `max-w-2xl` (672 px), centred, side padding 16 px at every width.
- Radius: controls 8 px, cards 12 px. Borders 1 px. One shadow, `shadow-sm`, on the form card only.
- Tap targets: at least 44 by 44 px for the vote button, Hide and Unhide, and the submit button. Input height at least 44 px.
- Motion: 150 ms colour and transform transitions on press and hover, wrapped so `prefers-reduced-motion: reduce` turns them off. No page level animation.

### Components

All are built on native elements (`form`, `textarea`, `button`, `ul`, `li`) and live in `src/components/` (spec 0001). Each has one job.

**1. `PageShell`**: `<header>` with the product name and one line of purpose, `<main id="main">`, a "Skip to content" link as the first focusable element, and a visually hidden `role="status"` region (`<p id="status">`) that already exists in the DOM before any text is set.

**2. `IdeaForm`** (public):
- A `<form>` in a card. A visible `<label>` "Your idea" above a `<textarea>` (auto grows with `field-sizing: content`, 2 to 4 rows, `enterkeyhint="send"`, `autocomplete="off"`, `spellcheck` on). Ideas are one line, so Enter submits and Shift+Enter does nothing. Enter is ignored while `event.isComposing` is true (an input method is picking a character), so Japanese, Chinese and Korean users do not submit by accident. Pasted new lines become spaces through `normalizeIdea()`.
- `CharacterCounter` under the field, right aligned: "n / 140", tabular numbers. `n` is `ideaLength(value)` from `src/lib/idea.ts`, which counts code points of `normalizeIdea(value)`. Linked to the textarea with `aria-describedby`. States: normal (`--text-muted`); near limit at 120 or more (`--warning` plus the text "20 left", so colour is never the only cue); over limit (`--danger` plus a warning icon and the text "5 over the limit").
- No `maxlength` attribute: it would silently cut pasted text. Over limit text stays visible so the person can trim it.
- **One shared function.** `src/lib/idea.ts` exports `MAX_IDEA_LENGTH = 140`, `normalizeIdea(raw)` (Unicode NFC, trim the ends, collapse every run of whitespace including new lines into one space, as spec 0002 says) and `ideaLength(raw)` (`[...normalizeIdea(raw)].length`). The form and the server action both import it, so the counter cannot disagree with the server. A unit test pins it on emoji, combining accents and pasted new lines.
- The counter text changes on every key press, so it is not a live region. Instead the visually hidden status region says "20 characters left" each time the remaining count crosses from 21 or more down to 20 or fewer, and "5 characters over the limit" each time it crosses into over the limit (the crossing state resets when the count leaves the zone, so typing, deleting and typing again announces again). It stays quiet between crossings.
- Submit button "Add idea" (primary: `--accent` fill, `--accent-fg` text). It stays enabled when the field is empty or too long, so the refusal is explained instead of the button silently doing nothing. While sending it shows "Adding…", gets `aria-disabled="true"` (so focus is not lost), and ignores repeat presses.
- Validation messages (inline, under the field, with an icon and text, `id` linked through `aria-describedby`): the field gets `aria-invalid="true"` only after a submit attempt fails, and it clears (with the message) as soon as the value is valid again, while typing. Texts are in the copy table. A server or network failure shows the `ErrorMessage` below the button and keeps the typed text.
- On success: the field clears, focus stays on the control used (the field or the Add idea button), the status region says "Idea added", and the new idea appears in the list (position set by votes, newest first on ties, spec 0002).

**3. `IdeaList`**: a `<ul>` (semantic list, so screen readers say "list, 12 items") of `IdeaRow`. A heading above it, "Ideas", with the sort note "Most votes first" in `--text-muted`. Ordering is decided by the server; the client keeps DOM order equal to visual order (no CSS `order`). After a vote the board is refreshed (see Data flow) and the list re-sorts: the voted row moves, other rows keep their nodes, and the status region says one line such as "Voted. Now 4 votes." If animation is used it is a scoped view transition, disabled under reduced motion; without it the list just snaps. Focus stays on the vote button that was pressed, even when its row moves.

**4. `IdeaRow`**: an `<li>` card row with a 1 px `--border` bottom divider. Layout: idea text on the left (wraps, `text-base`, `id="idea-<id>-text"`), `VoteButton` on the right, vertically centred; on widths under 360 px the button keeps its place and the text wraps beside it. Meta line under the text: an absolute UTC date, "16 Nov 2026, 14:05 UTC", in a `<time datetime>` element, `--text-muted`. It is formatted on the server with a fixed locale and `timeZone: "UTC"` (`Intl.DateTimeFormat("en-GB", ...)`), never relative ("2 hours ago") and never from the browser's clock, so server and client render the same text and nothing mismatches on hydration. No avatars (visitors are anonymous).

**5. `VoteButton`**: a native `<button type="button">` shaped as a chip: up arrow icon over the count (vertical stack, 44 by 56 px minimum). The border is always 1 px `--border-strong`, so the size never changes.
- Not voted: transparent fill, `--text` count, outline arrow, `aria-pressed="false"`.
- Voted: `--accent-soft` fill, border colour `--accent`, plus an inset ring `box-shadow: inset 0 0 0 1px var(--accent)` (reads as a 2 px outline with no layout shift), filled arrow, `aria-pressed="true"`. The filled arrow and heavier ring mean the state is visible without colour. In Forced Colors Mode the box shadow is dropped, so the border switches to `Highlight` and the filled arrow carries the state.
- Accessible name is stable and short: "Upvote idea, 4 votes" (a visually hidden "Upvote idea" prefix, the visible count, a visually hidden "votes" or "vote" suffix, so the visible number is part of the name). The idea text is not in the name; the button has `aria-describedby="idea-<id>-text"`, so a screen reader reads the idea as the description. The state comes from `aria-pressed`, and the name never flips between "Upvote" and "Remove vote".
- Press: the button sends the wanted state, not a toggle. The wanted state is the opposite of what is shown (`on` when not voted, `off` when voted), and the server action "set vote" (spec 0002) is idempotent: repeating the same request cannot flip the vote back. The action returns `{ ok: true, count, voted }` on success (spec 0005).
- **Reconciling the optimistic state.** `VoteButton` uses `useOptimistic` over the `{ count, voted }` that came from the server render. On press, inside one `startTransition`, the optimistic value is set to the wanted state (count plus or minus one), then the action runs, then `router.refresh()` runs. The optimistic value stays until the refreshed board props arrive, then React drops it and the props (the server's truth) show. The returned `{ count, voted }` is used only for the announcement text ("Voted. Now 4 votes."), so the count read aloud is the server's. If the refreshed props differ from the optimistic guess (another person voted meanwhile), the props win, and no extra message is needed. Repeat presses while a request is pending are ignored.
- **Failure.** Vote failure handling: see spec 0005 Client behaviour (it overrides this section).
- Hover, pressed and sending states use the tints in the State rules above; they change the fill only, never size or border width.

**6. `EmptyState`**: shown when the list has no ideas. Centred in a dashed `--border-strong` card (as in the Basecamp and Productboard references): a small icon, a heading "No ideas yet", one line "Be the first to suggest what we build next.", and a button that moves focus to the idea field ("Write an idea"). It replaces the list region, it is not a live region (it is present on load).

**7. `ErrorMessage`**: `role="alert"` block with an icon, plain text and a "Try again" button when a retry makes sense. Colours: `--danger` text and icon on `--surface`, 1 px `--danger` border. Used for a board that failed to render (the App Router `error.tsx` boundary, whose Try again calls its `reset()`), for failed submits and votes, and for admin failures. It never shows technical details.

**8. `AdminRow`** (private `/admin`): admin compares rows (idea, votes, added, status, action), so wide screens get a real `<table>`. Small screens get a different element, a labelled list, not the same table restyled: CSS that turns table cells into blocks removes their table meaning for screen readers. The page renders both from the same data and shows one at a time with the `admin:` breakpoint (`--breakpoint-admin`, 40rem): the table has `class="hidden admin:table"` and the list `class="admin:hidden"`. `display: none` removes the inactive one from the accessibility tree, so users never meet both. The list is `<ul aria-label="Ideas, admin view">` with one `<li>` per idea; each value is labelled in text ("Votes: 4", "Added: 16 Nov 2026, 14:05 UTC", "Status: Hidden"). The table has a `<caption>` (visually hidden) and `scope` on its headers.
- Idea text, vote count (tabular), date (absolute UTC, "16 Nov 2026, 14:05 UTC", formatted on the server like the board), status, action.
- Status: "Visible" (plain text) or "Hidden" badge (icon plus text, `--text` on `--accent-soft`; never colour only). A hidden row keeps full text contrast (no opacity or greying out below AA); it is marked by the badge and an italic or struck style is NOT used, so text stays readable.
- Action: one button, "Hide" (secondary: transparent fill, `--border-strong` outline) for visible ideas and "Unhide" for hidden ones. Accessible name "Hide idea" or "Unhide idea", with `aria-describedby` pointing at the idea text cell, so the long text is a description and not the name. Where a short label is needed (the status message, a log), the idea is cut to its first 40 code points (`[...text].slice(0, 40).join("")`, never `slice` on the string, which can split an emoji) followed by an ellipsis only when something was cut. One click sets the wanted state (hide or unhide, idempotent like the vote), no confirm dialog because it is reversible; the board is refreshed, the row updates in place, focus stays on the same button (its label changes), and the status region says "Idea hidden" or "Idea shown again".
- Failure: row level `ErrorMessage` "Couldn't hide this idea." (or "Couldn't show this idea.") with Try again, state unchanged. Try again sends the same wanted state. A failed admin list render uses the `error.tsx` boundary with the admin load error text.
- Header of the page says "Admin" with the count of hidden ideas, and a link back to the board.

### Data flow (read and write path)

- **Read.** `/` and `/admin` are server components that read D1 (board and admin queries from spec 0002) on each request. Nothing is cached on the client.
- **Write.** Idea post, set vote, hide and unhide are server actions (spec 0001). Each action returns a small result (`{ ok: true }` or `{ ok: true, count, voted }` for a vote, `{ ok: false, code }` otherwise) and never throws for expected failures (validation, hidden idea).
- **After every successful action** the client calls `router.refresh()` inside the same transition, so the server components re-render with fresh data (new order, new counts). Optimistic values (`useOptimistic`) last until those props arrive.
- **Failed board render.** `src/app/error.tsx` (and the same for `/admin`) is the error boundary: it shows `ErrorMessage` with the board error text and a Try again button that calls `reset()`. After a successful reset, focus goes to the "Ideas" heading.
- **Announcements** go through `announce(text)` from `src/lib/announce.ts` (clear, then set on the next frame; see the accessibility rules).

### Copy table

Every user facing string lives in one file, `src/lib/copy.ts`, so wording changes in one place. `N` is a number.

| Key | Text |
|---|---|
| Product name | Next Build |
| Purpose line | Suggest what we build next, and vote for the ideas you want. |
| Page title, board | Next Build ideas board |
| Page title, admin | Next Build admin |
| Idea field label | Your idea |
| Submit button | Add idea |
| Submit button, sending | Adding… |
| Counter, normal | n / 140 |
| Counter, near limit | N left |
| Counter, over limit | N over the limit |
| Counter announcement, near | N characters left |
| Counter announcement, over | N characters over the limit |
| Validation, empty | Write an idea first. |
| Validation, too long | Ideas can be up to 140 characters. Yours is N over. |
| Server validation failure | That idea can't be added. Check it and try again. |
| Submit failure | We couldn't add your idea. Try again. |
| Idea added | Idea added |
| Votes label | 1 vote, N votes (0 votes uses the plural) |
| Vote added (state wording) | Voted. Now 1 vote. or Voted. Now N votes. |
| Vote removed (state wording) | Not voted. Now 1 vote. or Not voted. Now N votes. |
| Vote failure | Couldn't save your vote. |
| Idea hidden while voting | This idea is no longer on the board. |
| Empty board | No ideas yet. Be the first to suggest what we build next. |
| Empty board button | Write an idea |
| Board error | We couldn't load the ideas. Try again. |
| Try again button | Try again |
| Admin: hide, unhide result | Idea hidden, Idea shown again |
| Admin failure | Couldn't hide this idea. or Couldn't show this idea. |
| Admin empty | No ideas yet. New ideas will show up here. |
| Admin load error | We couldn't load the ideas. Try again. |
| Admin heading and count | Admin, N hidden |
| Admin refusal (403 page and page content) | This page is only for the site admin. |
| Admin sign in ended | Your admin sign in has ended. Reload this page to sign in again. |
| Reload button | Reload |

### Focus and keyboard behaviour

- Focus ring: `outline: 2px solid var(--accent); outline-offset: 2px;` on `:focus-visible` for every interactive element. Never `outline: none` without a replacement. The ring is 6.70 or 7.05 against `--surface`, above the 3:1 needed. In Forced Colors Mode it becomes `Highlight`.
- Tab order equals reading order: skip link, product name, idea field, Add idea, then vote buttons top to bottom (then, on `/admin`, Hide and Unhide buttons top to bottom). No positive `tabindex`.
- Keys: Tab and Shift+Tab move; Enter in the idea field submits unless an input method is composing text (`event.isComposing`); Enter or Space presses a button; Escape does nothing special (there are no dialogs or menus at launch).
- After a successful post, focus stays on the control used (the field or the Add idea button). After a vote or hide, focus stays on the pressed button. After a failed action, focus stays where it was and the message is announced.
- `scroll-margin-top` on the idea field and rows so the sticky nothing (there is no sticky header) never hides the focused element; if a sticky element is added later it must set `scroll-padding-top`.
- Pointer: `touch-action: manipulation` on buttons removes double tap zoom delay.

### Accessibility rules (apply to every component)

1. Semantic HTML first: `form`, `label`, `button`, `ul`, `table`, `time`, `h1` once per page, headings in order. ARIA only where native elements fall short (`aria-pressed`, `aria-describedby`, `aria-invalid`, `role="status"`, `role="alert"`).
2. Every control has a visible label or an accessible name. Names stay short ("Upvote idea", "Hide idea"), and the idea text is attached with `aria-describedby`, not put into the name.
3. Never use colour alone for state: pair it with an icon, text or shape (counter, voted chip, Hidden badge, errors).
4. One polite status region for outcomes; `role="alert"` only for failures. Do not put `aria-live` on the list or on the counter. Repeated identical messages must be re-announced: the `announce(text)` helper first sets the region's text to empty, then sets the real text on the next animation frame (`requestAnimationFrame`), because a screen reader ignores a live region whose text did not change.
5. Respect `prefers-reduced-motion` and `prefers-contrast: more` (borders move from `--border` to `--border-strong`).
6. Text can be zoomed to 200 percent and resized without loss; use `rem` for type and spacing in components.
7. Icons are inline SVG with `aria-hidden="true"` when text is next to them.
8. The page has a `lang` attribute and a descriptive `<title>` (feature 10 finishes SEO).
9. Automated check: `@axe-core/playwright` runs on `/` and `/admin` in light and dark, desktop and phone (spec 0001 CI contract). Zero violations is the bar.

## Build plan

Approach: Tracer Bullet (project default from the scope). This spec has no migration and no server code. It lands inside the first UI slice instead of as a separate "build the design system" task, so tokens and components are proven on a real page.

1. **Tokens and theme** (satisfies AC-1, AC-2, AC-3): in the first UI PR (`/develop suggest an idea and see the board`), add the `:root` tokens, `@theme inline` mapping, `color-scheme` meta and CSS, the Inter font through `next/font`, and a one off test that each contrast pair in the table meets its ratio (a small Vitest check over the token values), `src/lib/idea.ts` (`normalizeIdea`, `ideaLength`) with its unit test, `src/lib/copy.ts`, and `src/lib/announce.ts`.
2. **PageShell, IdeaForm, CharacterCounter, ErrorMessage, EmptyState, IdeaList, IdeaRow** (satisfies AC-4, AC-6, AC-8, AC-9, AC-10): built in the same PR as the public board. `IdeaRow` ships with a static vote chip (count shown, not interactive) until slice 2. Includes `error.tsx` for `/` and the server side date formatter.
3. **VoteButton behaviour** (satisfies AC-5, AC-8, AC-9): built in slice 2 (`/develop upvoting`) on top of the chip from task 2: the wanted state request, `useOptimistic` with `router.refresh()`, and the retry.
4. **AdminRow and admin table** (satisfies AC-7, AC-8, AC-9): built in slice 3 (`/develop hide spam`), including the table plus labelled list pair.
5. **Accessibility and visual checks** (satisfies AC-2, AC-8, AC-10): the Playwright axe run and desktop plus phone screenshots in light and dark are part of each slice's CI, not a separate task.

## Consequences

**Positive**:
- Slices 1 to 3 build against fixed tokens and component rules, so no one invents a look mid build.
- Tokens use the platform (`light-dark()`, `color-scheme`), so dark mode needs no extra JavaScript and no flash.
- Contrast is checked up front and again by a test, so the palette cannot drift below AA unnoticed.

**Negative / tradeoffs**:
- No manual theme toggle at launch; people who want a different theme than their device must change the device setting. A toggle can be added later without changing tokens.
- A near monochrome look is less memorable than a branded one. It is the cheapest thing to change later (only the accent values).
- Optimistic voting means a failed vote briefly shows the wrong count before it reverts. Retrying is safe because the request carries the wanted state.
- The admin page renders the idea list twice (table and list) and hides one with CSS. Fine for an admin page, and it keeps both accessible.

**Neutral**:
- Tailwind v4 `@theme inline` ties the utilities to CSS variables, so token values can only be changed in the stylesheet, not in a JS config.

## Follow-up

- [ ] Toyin: confirm the brand feel (calm neutral with a blue accent is the default). If it changes, update the accent rows of the colour table and re-run the contrast pairs. Michael relays the answer.
- [ ] Spec 0002 interplay: the "Vote count" shown in the chip comes from the board query; "set vote" returns the new count and voted state. Check wording in feature 6 (upvoting) matches the vote announcements here.
- [ ] Feature 9 (abuse protection) adds a rate limit message and a Turnstile widget to `IdeaForm`; its spec must reuse `ErrorMessage` and the status region rather than adding a new pattern.
- [ ] Feature 10 (SEO and share card) designs the share image using these colours and the product name.
- [ ] `/audit` after the first UI slice: record the token names and the "tokens only, no raw hex" rule in root `AGENTS.md`; this rule can be enforced by a lint check (Tailwind arbitrary colour values and hex in components), so tell Michael to make a task for it.
- [ ] `docs/feature-map.md` (scaffold task) lists the two pages `/` (Board) and `/admin` (Admin) that these components appear on.

## Rationale

Reasoning, options and the Mobbin references: see [rationale.md](rationale.md).
