# E2E Test: Connection Indicator Scope

Checks that the Realtime connection indicator exists only on the dashboard routes (`/projects` and
the project pages), where the channel is opened, that the summary at `/` shows none, that the pill
reaches `live` again after a round trip through `/`, and that the old `/summary` address redirects
to `/` with its query string.

## User Story

As a person watching ADW runs
I want the connection indicator to appear only where the dashboard holds a live connection
So that the summary at `/`, a cached report, never shows a pill stuck at `connecting`

## Test Steps

1. Navigate to the `Application URL` (`/`).
2. **Verify** the `Summary` heading (level 1) is present, there is no `navigation` named `Projects`
   (the sidebar) and no element with role `status` in the accessibility snapshot.
3. Take a screenshot of the summary page.
4. Click `Projects` in the header's `Sections` navigation.
5. **Verify** the URL is `/projects`, the `Projects` navigation (the sidebar) and the
   `Select a project` heading are present.
6. **Verify** an element with role `status` is present and within 15 seconds its text is `live`
   (in development it may read `connecting` once before that; wait and re-snapshot).
7. Take a screenshot of the project overview.
8. Click the first project link in the sidebar's `Projects` navigation and note its `href`.
9. **Verify** the URL is `/projects/<owner>/<repo>` (the noted `href`) and the `status` element
   reads `live` (wait up to 15 seconds).
10. Click `ADW Dashboard` (the header brand).
11. **Verify** the URL is `/` and the `Summary` heading is present.
12. **Verify** the accessibility snapshot contains no element with role `status`, and no text
    `connecting`, `live` or `reconnecting` outside the summary content.
13. Click `Projects` in the header's `Sections` navigation, then the same project link as in step 8.
14. **Verify** the URL is the project page from step 9 and a `status` element is present and within
    15 seconds reads `live` again.
15. Take a screenshot of the project page.
16. **Verify** the header's `Sections` navigation contains no `Summary` link.
17. Navigate directly (full page load) to `/summary?days=7`.
18. **Verify** the final URL is `/?days=7`, the `Summary` heading is present, the Window select
    shows `Last 7 days`, and the accessibility snapshot contains no element with role `status`.

## Success Criteria

- The pill is absent on `/`, both after a client navigation and on a full page load.
- The `status` pill reaches `live` on `/projects` and on a project page.
- The pill reaches `live` again after returning from `/` to a project page.
- `/summary?days=7` lands on `/?days=7`.
- 3 screenshots are taken.
