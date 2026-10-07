# E2E Test: Day Card Column Charts

Checks that every day card on the summary at `/` shows two column charts directly under its header,
runs by class and tokens by model, side by side on one baseline, in place of the old stacked class
bar and legend; that the model columns reveal their token split on hover and keyboard focus; and
that the per-project table keeps its compact class bars.

## User Story

As a visitor reading the ADW public ledger on `/`
I want to see at a glance how a day's runs split by issue class and how its tokens split by model
So that I can compare days and spot which model carried the work without reading the table

## Test Steps

1. Navigate to the `Application URL` (`/`).
2. Take the first day card that has runs (the today card when it has runs, else the first past
   card). **Verify** directly below its header there is a `figure` captioned `Runs by class` and
   one captioned `Tokens by model`, side by side at 1920x1080.
3. **Verify** the class chart has one column per class with a non-zero count, each with an
   `aria-label` like `/feature: N runs`, the count above and the class name below, and that the
   counts add up to the header's `N runs`. **Verify** each class name below a column is shown in
   full: the visible text of the `/feature` column's name is `/feature`, not `/feat…`, and with
   `browser_evaluate` the name span's `scrollWidth <= clientWidth`.
4. **Verify** the model chart shows columns with a short name (`Opus`, `Sonnet` or `Haiku`, or
   another short id) and a token label above (such as `4.6M`), or the text
   `No per-model usage published.`
5. When the model chart has a column, focus it (`browser_press_key` Tab until it is focused, or
   `browser_hover` over it) and **Verify** the split with `Input`, `Cache read`, `Cache creation`
   and `Output` (and the full model id next to `Model`) becomes visible.
6. **Verify** the card's area between the header and the per-project table holds no class legend
   (no `li` with a swatch and a class name outside the two figures), and that the per-project
   table below still has its compact class bars (an `svg` with an `aria-label` starting
   `Issue classes:` inside the table).
7. **Verify** the server-rendered HTML (`browser_evaluate` `fetch("/").then((r) => r.text())`)
   contains `Runs by class` and `Tokens by model`.
8. Take a screenshot at 1920x1080.
9. Resize to 375x667 and **Verify** both charts are visible without horizontal page overflow
   (`document.documentElement.scrollWidth <= window.innerWidth`).
10. Take a screenshot at 375x667.

## Success Criteria

- Every day card with runs shows a `Runs by class` and a `Tokens by model` chart under its header,
  side by side on desktop and wrapped without overflow on mobile.
- Class columns carry their counts as text and as `aria-label`s, and add up to the day's runs,
  with the class name shown in full below each column.
- Model columns show a short name and a token label, and their split is visible on hover or focus;
  a day without per-model metrics says `No per-model usage published.`
- No class legend under the header; the per-project table keeps its compact class bars.
- Both charts are in the server HTML.
- 2 screenshots are taken.
