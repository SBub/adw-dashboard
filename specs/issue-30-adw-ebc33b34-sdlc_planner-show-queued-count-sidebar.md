# Feature: Show the queued count per project in the sidebar

## Metadata

issue_number: `30`
adw_id: `ebc33b34`
issue_json: `{"number":30,"title":"Show the queued count per project in the sidebar","body":"## Context\n\nThe toolkit will add `queued`to`adw.project_summaries`(SBub/adw-toolkit issue \"Publish the queue ledger to the ADW UI\"). Depends on that change being merged and its migration applied; do not start before.\n\n## What to build\n\n-`ProjectSummary`gains`queued: number`; `getProjects`reads it from the view (it selects`*`, so only the type and any explicit column list change).\n- `ProjectNav`: a fourth count, queued, next to running, completed and failed, emphasised when above zero like running, with the same label style.\n- The projects reducer (`applyProjectChange`) keeps `queued`through updates like the other counts; add one test case. No queue listener in this issue.\n- README: one sentence.\n\n## Acceptance\n\n- The sidebar shows`N queued`per project from the view on first paint.\n-`yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass.\n\n## Out of scope\n\nA Queue section on the project page and live updates of the count (filed separately)."}`

## Feature Description

The toolkit adds a `queued` column to the `adw.project_summaries` view: the number of issues waiting in the project's queue ledger. The dashboard's sidebar already shows each project's `running`, `completed` and `failed` counts read from that view; this feature adds a fourth count, `N queued`, rendered with the same `Count` label style and emphasised (bold emerald with the pulsing dot) when it is above zero, the way `running` is. The value arrives with the server-prefetched project list, so it is in the first paint (and in the prerendered HTML) with no extra read.

## User Story

As a person watching ADW work across projects
I want to see how many issues are queued for each project in the sidebar
So that I can tell at a glance which projects have work waiting, not only work running

## Problem Statement

The sidebar shows what is running and what has finished, but nothing about work that is waiting. Once the toolkit publishes a queue ledger, a project with an empty `running` count may still have issues lined up, and the dashboard gives no sign of it.

## Solution Statement

Extend the `ProjectSummary` view model with `queued: number`. `getProjects` (and `getActiveRuns`'s project read) already `select("*")` from `adw.project_summaries`, so the column flows through the existing cast in `src/data/index.ts` with no query change. `ProjectNav` renders one more `Count`. `applyProjectChange` seeds `queued: 0` on INSERT (a new project has no queue) and keeps it through UPDATE by its existing spread merge (`queued` is not a column of `adw.projects`, so it is never in the event); a test case pins that. `applyRunChangeToSummaries` indexes counts by `RunStatus`, which does not include `queued`, so it leaves the count alone without change. The realtime catch-up writes `getProjects()` output on every `SUBSCRIBED`, so a reconnect refreshes `queued` from the view; live updates of the count are out of scope.

## Relevant Files

Use these files to implement the feature:

- `README.md`: the "Data: projects and runs from the database" section lists the view's counts; it gets one sentence (and the intro bullet the count list).
- `AGENTS.md`: read in full for the invariants (one data boundary, casts only in `src/data/index.ts`, components render props only, reducers pure and tested, no clock reads). No rule changes.
- `.adw/project.md`: profile; commands, Review paths, Protected rules.
- `src/types/adw.ts`: `ProjectSummary` gains `queued: number` in the view-model section; its doc comment mentions the counts.
- `src/data/index.ts`: `getProjects` and `getActiveRuns` `select("*")` from the view and cast to `ProjectSummary`; confirm no explicit column list for the view exists (the `RUN_COLUMNS` list is for `adw.runs` and does not change).
- `src/components/ProjectNav.tsx`: renders the counts with `Count`; add the queued count.
- `src/data/apply-project-change.ts`: the INSERT branch builds a `ProjectSummary` literal with zero counts and must add `queued: 0`; the doc comment lists the kept counts.
- `src/data/apply-project-change.test.ts`: `summary()` fixture and the INSERT expectation gain `queued`; add the UPDATE case.
- `src/data/apply-run-change.ts`: read only, to confirm `next[ev.new.status]` cannot touch `queued`.
- `src/data/apply-run-change.test.ts`: its `summary()` fixture builds a full `ProjectSummary` and needs `queued` to typecheck.
- `src/data/realtime.ts`: read only, to confirm the catch-up writes `getProjects()` output whole (so `queued` refreshes on reconnect) and no new listener is needed.

## Implementation Plan

### Phase 1: Foundation

Add `queued: number` to `ProjectSummary`. This makes `tsc` point at every place that builds a summary literal (the INSERT branch of `applyProjectChange`, both test fixtures).

### Phase 2: Core Implementation

Seed `queued: 0` in `applyProjectChange`'s INSERT branch, add the reducer test, and render the fourth `Count` in `ProjectNav`.

### Phase 3: Integration

No wiring changes: the view column arrives through `select("*")`, the existing cast and the layout prefetch. Update README, then verify against the live view through the build and the review-phase screenshots.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Confirm the dependency is in place

- The issue must not start before the toolkit migration adding `queued` to `adw.project_summaries` is applied. Check read-only, with the publishable key from `.env.local` (never print it): a REST `GET` of `project_summaries?select=queued&limit=1` with `Accept-Profile: adw`. A 200 with a numeric `queued` means proceed; an error naming the column means stop and report that the dependency is not applied. Never write to the database.

### 2. Extend the view model

- In `src/types/adw.ts`, add `queued: number;` to `ProjectSummary` before `running` (queue order: queued, running, then the finished states), and update its doc comment ("the per-status counts, the queued count and last-run time").

### 3. Confirm the data boundary needs no query change

- In `src/data/index.ts`, confirm every read of `project_summaries` is `select("*")` and is cast to `ProjectSummary` only there. No code change expected; if an explicit column list for the view exists, add `queued` to it.

### 4. Keep `queued` in the projects reducer

- In `src/data/apply-project-change.ts`, add `queued: 0` to the INSERT literal (a just-created project has nothing queued) and mention `queued` in the doc comment alongside the counts the UPDATE branch keeps. The UPDATE branch's `{ ...project, ...ev.new }` already keeps it; do not change that logic.

### 5. Tests for the reducer

- In `src/data/apply-project-change.test.ts`: add `queued: 4` to `summary()` (a value distinct from the other counts), add `queued: 0` to the INSERT expectation, and add one case: "keeps the queued count through an update", an UPDATE of a renamed row on a summary with `queued: 7` whose result has `queued: 7` and the new `display_name`.
- In `src/data/apply-run-change.test.ts`: add `queued: 0` to `summary()` so it typechecks. Optionally assert in the existing counts test that `queued` is unchanged by a run event; no new behaviour there.

### 6. Render the count in the sidebar

- In `src/components/ProjectNav.tsx`, add `<Count label="queued" value={project.queued} emphasised={project.queued > 0} />` as the first count in the counts row (before `running`), reusing `Count` unchanged so the label style, zero-greying and emphasis match. No new component, no computation beyond the `> 0` comparison that `running` already uses.

### 7. README

- In "Data: projects and runs from the database", add one sentence: the view also carries `queued`, the number of issues waiting in the project's queue ledger (the toolkit's), shown in the sidebar as the first count, emphasised when above zero; it is refreshed by a page load or the realtime catch-up, not live. Adjust the intro bullet's list of counts to include queued.

### 8. Review-phase browser evidence

- The profile has no E2E suite, so evidence comes from the review screenshots. Open `/` and `/projects/SBub/issebya-homes-ai-system` (or the first listed project if 404) at desktop 1920x1080 and mobile 375x667. Each sidebar card must show four counts, `N queued` first, with the same label style; a project with a non-zero queue shows it bold emerald with the pulsing dot, a zero shows it grey. Check the served HTML of `/` (`curl`) contains `queued` inside the sidebar, proving it is in first paint, not filled in by the browser.

### 9. Run the validation commands

- Run every command in `Validation Commands` below; all must pass.

## Testing Strategy

### Unit Tests

- `applyProjectChange`: INSERT seeds `queued: 0`; UPDATE keeps an existing `queued` value while merging the new row.
- `applyRunChangeToSummaries`: unchanged behaviour; fixture updated for the type.

### Test Coverage

- `src/data/apply-project-change.test.ts`, "keeps the queued count through an update" (vitest unit layer): catches a reducer that rebuilds the summary from the event and drops `queued`, which would blank the sidebar count on any project rename; without this feature the case fails (no `queued` on the type or in the result).
- The INSERT expectation with `queued: 0` (same file) catches a new project rendering `undefined queued`.
- `ProjectNav` rendering has no test: the profile has no component test layer; the review screenshots cover it.

### Edge Cases

- `queued = 0`: grey, not emphasised, like any zero count.
- `queued > 0` with `running = 0`: queued emphasised, running grey.
- A project inserted live: `queued` shows 0 until the next catch-up or page load.
- Run events (`applyRunChangeToSummaries`) never alter `queued`.
- A view without the column (dependency not applied): would render `undefined queued`; step 1 prevents starting in that state.

## Acceptance Criteria

- `ProjectSummary` has `queued: number`; no new cast outside `src/data/index.ts`.
- The sidebar shows `N queued` per project, from the view, in the server HTML of `/`.
- `queued` is emphasised when above zero with the same style as `running`, grey at zero.
- `applyProjectChange` seeds `queued: 0` on INSERT and keeps it on UPDATE, with a test case.
- README has the one sentence.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint over the changed component, reducer and tests.
- `yarn typecheck`: proves every `ProjectSummary` literal carries `queued`.
- `yarn knip`: no unused exports or files introduced.
- `yarn format:check`: Prettier on the changed files and the spec.
- `yarn test`: the reducer cases, including the new UPDATE case.
- `yarn build`: reads the live view at build time and prerenders the sidebar with `queued`.

## Notes

- Blocked on the toolkit change (SBub/adw-toolkit, "Publish the queue ledger to the ADW UI") and its migration; step 1 checks it read-only.
- Out of scope: a Queue section on the project page and live updates of the count (no queue listener, no reducer for queue events).
- Placement: queued is listed first because it precedes running in a run's life; the issue only asks for it "next to" the others.
- No new dependency. No `AGENTS.md` rule change: the existing rules (casts in the boundary, components render props, reducers tested) already cover the change.
