# E2E Test: Worker Status Widget

Checks that the dashboard sidebar shows whether the ADW queue worker is alive, from the
`adw.workers` heartbeat: the served HTML carries the clock-free server snapshot next to the run
rows, the widget reaches a known state against the live database, sits at the bottom of the
sidebar on desktop and after the project strip on mobile, and is absent on `/`. The hosted
database is read only; this journey never writes.

## User Story

As the operator watching ADW runs
I want to see from the dashboard sidebar whether the queue worker is running
So that I know why labelled issues sit in the Queue when nothing picks them up

## Test Steps

1. Fetch the raw HTML of `/projects` (for example `browser_evaluate` with
   `fetch('/projects').then(r => r.text())`). **Verify** it contains `Worker status...` and at
   least one run row's `adw_id` in a `<code>` (or `No runs in progress.` when none), so the
   client prerender was not aborted.
2. Resize the browser to 1920x1080, navigate to `/projects` and wait up to 15 seconds for the
   sidebar's connection pill to read `live`.
3. **Verify** within 30 seconds the widget text is `Worker online` or `Worker offline`, followed
   by `last beat DD.MM.YYYY HH:MM UTC` or `never seen`, and never a host name, a pid or
   `started`. Note which. When the worker LaunchAgent is running on the machine, it must be
   `Worker online`.
4. **Verify** with `getBoundingClientRect` that the widget is the last area of the `aside` (its
   bottom within 1px of the aside's bottom minus its padding) and fully inside the viewport.
   Take a screenshot.
5. Click the first project link in the sidebar. **Verify** the widget is still present at the
   bottom of the sidebar.
6. Resize to 375x667. **Verify** the widget renders after the project strip (its `top` is
   greater than the strip's `bottom`). Take a screenshot.
7. Navigate to `/`. **Verify** the accessibility snapshot has no `Worker online`,
   `Worker offline` or `Worker status...` text. Judge this from `browser_snapshot`, not a DOM
   query: Next keeps the previous route's hidden `Activity` subtree in the document.

## Success Criteria

- The served HTML of `/projects` holds `Worker status...` and the run rows.
- A known state (`Worker online` or `Worker offline`) appears within 30 seconds.
- The widget sits at the sidebar's bottom on desktop and after the project strip on mobile.
- `/` has no widget.
- 2 screenshots are taken.
