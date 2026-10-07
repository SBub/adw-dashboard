# E2E Test: Day Card Chart Cards

Checks that every day card on the summary at `/` shows two separate chart cards directly under its
header, "Work by class" and "Tokens by model", side by side on desktop and stacked on mobile; that
classes and models come in a fixed order; that a bar's value sits inside it in white (or just above
a bar too short for it); that labels under the bars are text with a colour dot; that the tooltips
show the token split with cost and the class count with its share; and that the per-project table
keeps its compact class bars.

## User Story

As a visitor reading the ADW public ledger on `/`
I want each day's class split and model split shown as two clearly separated, consistently ordered
charts with the numbers on the bars
So that I can read a day at a glance and compare days without hunting for which label belongs to
which column

## Test Steps

1. Navigate to the `Application URL` (`/`). Take the first day card that has runs (the today card
   when it has runs, else the first past card).
2. **Verify** directly below its header there are two `figure`s, one captioned `Work by class` with
   the subtitle `Runs finished that day`, the other `Tokens by model` with the subtitle
   `All tokens, including cache reads`, side by side at 1920x1080 (with `browser_evaluate`, the
   same `getBoundingClientRect().top` for both).
3. **Verify** with `browser_evaluate` that the `aria-label`s of the class figure's `li`s (like
   `feature: 3 runs`) name classes that are a subsequence of `feature`, `chore`, `bug`, `patch`,
   `other` in that order, and that their counts add up to the header's `N runs`.
4. **Verify** the model figure's labels are a subsequence of `Haiku`, `Sonnet`, `Opus`, followed by
   any other model, or the figure says `No per-model usage published.`
5. **Verify** the tallest bar of either chart has its value inside: a
   `[data-value-placement="inside"]` element inside the bar whose computed `color` is
   `rgb(255, 255, 255)`; and any `[data-value-placement="above"]` element sits outside its bar
   (not a descendant of the coloured bar).
6. When the model figure has a column, hover it (`browser_hover`) or focus it (`browser_press_key`
   Tab) and **Verify** the tooltip shows `Model`, `Input`, `Cache read`, `Cache write`, `Output`
   and `Cost` with a `$` value. Hover a class column and **Verify** the tooltip shows `Runs` and
   `Share` with a `%` value.
7. **Verify** each label under a bar is text with a colour dot (no `img` or `svg` in the label
   row) and is shown in full (with `browser_evaluate`, its `scrollWidth <= clientWidth`).
8. **Verify** the per-project table below still has its compact class bars (an `svg` with an
   `aria-label` starting `Issue classes:` inside the table).
9. **Verify** the server-rendered HTML (`browser_evaluate` `fetch("/").then((r) => r.text())`)
   contains `Work by class` and `Tokens by model`.
10. Take a screenshot at 1920x1080.
11. Resize to 375x667 and **Verify** the two cards are stacked (the second figure's `top` is at or
    below the first figure's `bottom`) with no horizontal page overflow
    (`document.documentElement.scrollWidth <= window.innerWidth`).
12. Take a screenshot at 375x667. The colour scheme follows the OS; note which one the screenshots
    show, no toggle is needed.

## Success Criteria

- Every day card with runs shows a `Work by class` and a `Tokens by model` chart card under its
  header, each with its subtitle, side by side on desktop and stacked without overflow on mobile.
- Classes are in the order feature, chore, bug, patch, other and models Haiku, Sonnet, Opus, other;
  absent entries are omitted.
- The tallest bar shows its value in white inside it; a short bar shows it above.
- Labels under the bars are text with a colour dot, shown in full.
- Model tooltips show the token split and the cost; class tooltips show the runs and the share.
- The per-project table keeps its compact class bars.
- Both charts are in the server HTML.
- 2 screenshots are taken.
