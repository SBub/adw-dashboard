# E2E Test: Active Runs Shared Entry

Checks that `/projects` lists every active run (running, and failed that can be resumed) grouped
by project, and that the sidebar's `running` and `failed` counts and a project page's Active
section show the same runs, because all three read one shared Active entry.

## User Story

As an operator watching several projects
I want one place that lists every run in progress, with counts and project pages that agree with it
So that I never see a run in one view and miss it, or count it twice, in another

## Test Steps

1. Navigate to the `Application URL` with the path `/projects`.
2. **Verify** an element with role `status` is present and within 15 seconds its text is `live`
   (in development it may read `connecting` once before that; wait and re-snapshot).
3. **Verify** the `Active` heading (level 2) is present in the main pane.
4. If the main pane shows `No runs in progress.`:
   - **Verify** every project in the sidebar's `Projects` navigation shows `0 running` and
     `0 failed`.
   - Take a screenshot of the empty overview and stop here: the hosted database is read-only for
     this run, so no run can be created to exercise the rest.
5. Take a screenshot of the overview with its groups.
6. Take the first group: note its project name (the level-3 heading's link text), the `href` of
   that link, every run's `adw_id` (the `code` element of each row) and how many of its rows show
   status `running` and how many `failed`.
7. **Verify** the sidebar entry for that project (in the `Projects` navigation) shows the same
   `running` number and the same `failed` number as noted in step 6.
8. **Verify** every other sidebar project that has no group on the overview shows `0 running` and
   `0 failed`.
9. Click the noted project link in the group heading.
10. **Verify** the URL is the noted `href`, the project name is the level-1 heading, and the
    `status` element reads `live` (wait up to 15 seconds).
11. **Verify** the project page's `Active` section lists exactly the `adw_id`s noted in step 6, in
    the same order.
12. **Verify** the sidebar entry for that project still shows the same `running` and `failed`
    numbers as in step 7.
13. Take a screenshot of the project page.

## Success Criteria

- `/projects` shows an `Active` heading and either `No runs in progress.` or one group per project
  with active runs, each headed by a link to its project page.
- For every project, the sidebar's `running` and `failed` counts equal the number of that
  project's rows on the overview with that status.
- A project page's Active section lists the same runs, in the same order, as its overview group.
- The connection indicator reads `live` on both pages.
- 2 screenshots are taken (1 when the overview is empty).
