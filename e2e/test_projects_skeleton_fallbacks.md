# E2E Test: Projects Skeleton Fallbacks

Checks that while the request-time islands of the projects side stream in, every Suspense fallback
is a skeleton (a placeholder wireframe in a `role="status"` container with `aria-busy="true"` and an
`aria-label`), not a "Loading..." text line or nothing, that the page does not jump when the rows
arrive, and that the skeleton blocks stand still under reduced motion. The hosted database is read
only: the journey never writes to it. It slows the network in the test browser only (Chrome
DevTools Protocol), which changes nothing outside that browser.

## User Story

As a person watching ADW runs on the dashboard
I want the projects pages to show the shape of their sections while data streams in
So that the page does not flash nearly empty and then jump when the rows arrive

## Test Steps

1. Navigate to the `Application URL` plus `/projects`.
2. **Verify** an element with role `status` whose text is `live` appears within 15 seconds (in
   development it may read `connecting` once before that; wait and re-snapshot). Read the `href` of
   the first link in the sidebar's `Projects` navigation (`/projects/<owner>/<repo>`).
3. With `browser_evaluate`, `fetch` that href and read the full response text (the streamed
   document: the fallbacks plus the hidden segments that replace them).
   **Verify** it contains `aria-busy="true"`, `aria-label="Loading runs"`,
   `aria-label="Loading queue"` and `aria-label="Loading history"` (or `aria-label="Loading pages"`),
   and that it contains none of `Loading runs...`, `Loading queue...`, `Loading history...` or
   `Loading project...`. **Verify** it still contains the `Active`, `Queue` and `History` headings
   and, when the project has runs, at least one `<code` holding an `adw_id` (the rows streamed in
   the same document).
4. With `browser_run_code_unsafe`, open a CDP session (`page.context().newCDPSession(page)`) and
   send `Network.enable`, then `Network.emulateNetworkConditions` with `offline: false`,
   `latency: 2000`, `downloadThroughput: 50000`, `uploadThroughput: 50000`. In the same call,
   `page.addInitScript` a script that sets `window.__cls = 0` and installs a `PerformanceObserver`
   for `layout-shift` (`buffered: true`) adding the `value` of every entry without `hadRecentInput`
   to `window.__cls`.
5. Navigate to the project href from step 2 and take a `browser_snapshot` right away.
   **Verify** at least one element with `aria-busy="true"` is present (the sidebar's
   `Loading projects`, the Active section's `Loading runs`, `Loading queue`, `Loading history`,
   `Loading pages` or the segment's `Loading project`) and the pane is not a single text line.
6. Take a screenshot of the loading state at 1920x1080.
7. Wait (re-snapshot up to 60 seconds) until no element with `aria-busy="true"` remains and either
   a `<code>` holding an `adw_id` or a History empty state (`No completed runs yet.`) is visible.
   With `browser_evaluate` read `window.__cls`.
   **Verify** it is below `0.1`.
8. Resize to 375x667, reload the project page (still throttled) and take a screenshot of the
   loading state right away. **Verify** with a `browser_snapshot` that an `aria-busy="true"`
   element is present.
9. Remove the throttling with `browser_run_code_unsafe` (`Network.emulateNetworkConditions` with
   `offline: false`, `latency: 0`, `downloadThroughput: -1`, `uploadThroughput: -1`) and resize back
   to 1920x1080.
10. With `browser_run_code_unsafe`, call `page.emulateMedia({ reducedMotion: "reduce" })`. Then, in
    the page, parse the document text of step 3 with `DOMParser`, take the first element whose
    class list contains `motion-safe:animate-pulse`, append a clone of it to `document.body` and
    read its `getComputedStyle(el).animationName`.
    **Verify** it is `none`. Call `page.emulateMedia({ reducedMotion: "no-preference" })`, read it
    again and **Verify** it is not `none`. Remove the clone.

## Success Criteria

- The streamed project page holds `aria-busy="true"` skeleton containers labelled `Loading runs`,
  `Loading queue` and `Loading history` (or `Loading pages`), and no `Loading ...` text line.
- Under throttling, a skeleton is on screen before the rows arrive, at 1920x1080 and at 375x667.
- The cumulative layout shift while the project page loads under throttling is below 0.1.
- Skeleton blocks have no animation under `prefers-reduced-motion: reduce` and pulse otherwise.
- 2 screenshots are taken.
