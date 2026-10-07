# E2E Test: Landing Page Today Refresh

Checks that the summary at `/` shows today's figures in their own card above the past days, that
the card is in the server-rendered HTML, and that its Refresh button refetches only today's rows
(and today's per-model and per-phase rows) from Supabase in the browser: no request to the app, no navigation, the past days untouched.

## User Story

As a visitor reading the ADW public ledger on `/`
I want to refresh today's figures in place
So that I can follow today's work without reloading the page

## Test Steps

1. Navigate to the `Application URL` (`/`).
2. **Verify** the `What an AI developer workflow gets done` heading (level 1) is present, followed
   by an `article` whose level-2 heading starts with `Today,` and which holds a `button` named
   `Refresh`, followed by past day cards (or the text `No finished runs in the previous 30 days.`).
   When the window line is present, **Verify** it ends with `all projects` and that the today
   card's date is the day after the window line's end date.
3. **Verify** the server-rendered HTML already holds the today card: `browser_evaluate`
   `fetch("/").then((r) => r.text())` and check the text contains `Today,` and `Refresh`.
4. Take a screenshot of the landing page before the refresh.
5. Note the text of the first past day card's heading, then call `browser_network_requests` to
   record the requests made so far.
6. Click the `Refresh` button.
7. Wait until the button is named `Refresh` again (it reads `Refreshing...` while pending).
8. Call `browser_network_requests` and **Verify** that the requests issued after the click are
   only Supabase REST reads: exactly one `GET` to `.../rest/v1/daily_summary` whose query holds
   `day=eq.<today>` (the today card's date as `YYYY-MM-DD`), exactly one `GET` to
   `.../rest/v1/daily_model_summary` whose query holds `day=eq.<today>`, exactly one `GET` to
   `.../rest/v1/daily_phase_summary` whose query holds `day=eq.<today>`, at most one `GET` to
   `.../rest/v1/projects`, and no request to the application origin (no document, no `_rsc`
   request, no `POST` server action).
9. **Verify** the URL is still exactly `/`, the button is named `Refresh`, there is no
   `Refresh failed` text, and the first past day card's heading is the one noted in step 5.
10. Take a screenshot of the landing page after the refresh.

## Success Criteria

- The today card (heading `Today, <date>`, button `Refresh`) is above the past days and in the
  server HTML.
- The today card's date is the day after the past window's end date.
- Refresh issues only browser Supabase reads for today's day (one `daily_summary`, one
  `daily_model_summary` and one `daily_phase_summary` read, plus at most the project list), no request to the application origin
  and no navigation.
- After the refresh the button is back to `Refresh`, no error line, past days unchanged.
- 2 screenshots are taken.
