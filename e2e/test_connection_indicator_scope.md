# E2E Test: Connection Indicator Scope

Checks that the Realtime connection indicator exists only on the dashboard routes, where the
channel is opened, and that it reaches `live` again after a round trip through `/summary`.

## User Story

As a person watching ADW runs
I want the connection indicator to appear only where the dashboard holds a live connection
So that `/summary`, a cached report, never shows a pill stuck at `connecting`

## Test Steps

1. Navigate to the `Application URL` (`/`).
2. Take a screenshot of the overview.
3. **Verify** an element with role `status` is present in the accessibility snapshot.
4. **Verify** within 15 seconds the `status` element's text is `live` (in development it may read
   `connecting` once before that; wait and re-snapshot).
5. Click the first project link in the sidebar's `Projects` navigation and note its `href`.
6. **Verify** the URL is `/projects/<owner>/<repo>` (the noted `href`).
7. **Verify** the `status` element is present and reads `live` (wait up to 15 seconds).
8. Click `Summary` in the header's `Sections` navigation.
9. **Verify** the URL is `/summary` and the `Summary` heading is present.
10. **Verify** the accessibility snapshot contains no element with role `status`, and no text
    `connecting`, `live` or `reconnecting` outside the summary content.
11. Take a screenshot of the summary page.
12. Click `Projects` in the header's `Sections` navigation, then the same project link as in step 5.
13. **Verify** the URL is the project page from step 6.
14. **Verify** a `status` element is present and within 15 seconds reads `live` again.
15. Take a screenshot of the project page.
16. Navigate directly (full page load) to `/summary`.
17. **Verify** the accessibility snapshot contains no element with role `status`.

## Success Criteria

- The `status` pill reaches `live` on `/` and on a project page.
- The pill is absent on `/summary`, both after a client navigation and on a full page load.
- The pill reaches `live` again after returning from `/summary` to a project page.
- 3 screenshots are taken.
