# E2E Test: Landing Page Without Filters

Checks that the summary at `/` has no Project or Window filter: it shows the heading, the intro,
the reading note directly under the intro and the day cards for all projects over the fixed
30-day window, ignores `?days` and `?project`, and that the old `/summary` address lands on a bare
`/`.

## User Story

As a visitor reading the ADW public ledger
I want the landing page to show every project's finished runs without a form to fill in
So that the report reads straight through and old filtered links still land on it

## Test Steps

1. Navigate to the `Application URL` (`/`).
2. **Verify** the `What an AI developer workflow gets done` heading (level 1) is present, followed
   by the intro paragraph starting `ADW is an autonomous pipeline`.
3. **Verify** the text `Times are UTC. Tokens and cost count runs that published metrics.` follows
   the intro paragraph and precedes the first day card.
4. **Verify** at least one past day card is present (an `article` with a level-2 date heading,
   below the today card whose heading starts `Today,`) and that it holds a per-project table whose `Project` cells are plain text (no links in the Project
   column).
5. **Verify** the window line above the day cards ends with `all projects`.
6. **Verify** the snapshot contains no `combobox`, no `button` named `Apply` and no `form`.
7. Take a screenshot of the landing page.
8. Navigate directly (full page load) to `/?days=7&project=x`.
9. **Verify** the same content as in steps 2 to 6: the window line says `30 days`, there is no
   error panel and no `No public project named` text.
10. Take a screenshot of the landing page with ignored parameters.
11. Navigate directly (full page load) to `/summary?days=7`.
12. **Verify** the final URL is exactly `/` (no `?`) and the
    `What an AI developer workflow gets done` heading is present.
13. Take a screenshot of the redirected page.

## Success Criteria

- `/` shows the heading, the intro, the reading note directly under the intro and the day cards.
- No `<select>`, no Apply button and no form on `/`.
- Project names in the per-project tables are plain text.
- `/?days=7&project=x` renders the same 30-day, all-projects report as `/`.
- `/summary?days=7` ends at `/` with no query string.
- 3 screenshots are taken.
