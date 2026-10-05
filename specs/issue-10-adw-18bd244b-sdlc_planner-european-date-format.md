# Feature: Format dates on the dashboard in European format

## Metadata

issue_number: `10`
adw_id: `18bd244b`
issue_json: `{"number":10,"title":"Format dates on the dashboard in European format","body":"## Problem\n\nTimestamps across the dashboard (sidebar \"Last run\", run rows \"Started\", \"Updated\", \"Finished\") render as `YYYY-MM-DD HH:MM UTC`, produced by `src/components/Timestamp.tsx`from the ISO string by substring.\n\n## Expected\n\nEuropean date format:`DD.MM.YYYY HH:MM`(24-hour clock), still UTC and still labelled as such, e.g.`03.10.2026 14:51 UTC`.\n\n## Constraints\n\n- Keep the rendering deterministic between server and client: no locale-dependent `toLocaleString`and no clock reads. Format from the ISO string (or a fixed UTC parse) so server HTML and hydration agree. See AGENTS.md on clocks under cacheComponents.\n- Keep the`<time dateTime=...>`attribute as the ISO value.\n- One formatting function, unit-tested with fixed inputs, used by`Timestamp` only.\n\n## Where\n\n`src/components/Timestamp.tsx`; add `src/lib/format-date.ts`with a test.\n\n## Acceptance\n\n- Every timestamp on`/`and`/projects/[...slug]`shows`DD.MM.YYYY HH:MM UTC`.\n- Tests cover a normal value, a midnight value and a single-digit day/month.\n- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass."}`

## Feature Description

Every absolute timestamp on the dashboard goes through one component, `src/components/Timestamp.tsx`,
which today slices the ISO string into `YYYY-MM-DD HH:MM UTC`. The feature changes the visible text to
the European form `DD.MM.YYYY HH:MM UTC` (24-hour clock, still UTC, still labelled `UTC`), for example
`03.10.2026 14:51 UTC`. The `<time>` element keeps `dateTime={value}` and `title={value}` with the raw
ISO string, so machine readers and the hover tooltip are unchanged.

The formatting moves out of the component into one pure helper, `formatTimestamp(iso)` in a new
`src/lib/format-date.ts`, unit-tested with fixed inputs. `Timestamp` is its only caller. The four
places that render a timestamp (sidebar "Last run" in `ProjectNav`, run row "Updated", "Started" and
"Finished" in `RunRow`) pick the change up without being touched.

## User Story

As a dashboard user in Europe
I want timestamps shown as `DD.MM.YYYY HH:MM UTC`
So that dates read in the order I am used to, without guessing which number is the day and which the month

## Problem Statement

`YYYY-MM-DD` is unambiguous but not the format the team reads naturally. The formatting is also an
inline substring expression inside a component, which has no test and cannot gain one (there is no
component test layer, see the profile's Tests section).

## Solution Statement

Add a pure function `formatTimestamp(iso: string): string` in `src/lib/format-date.ts` that:

1. Parses the ISO string with `Date.parse(iso)` (a fixed parse of the input, not a clock read; the same
   call `durationLabel` in `src/lib/run-view.ts` already uses), then reads the parts with the UTC getters
   (`getUTCDate`, `getUTCMonth() + 1`, `getUTCFullYear`, `getUTCHours`, `getUTCMinutes`) of
   `new Date(ms)`, zero-padding day, month, hours and minutes to two digits.
2. Returns `` `${dd}.${mm}.${yyyy} ${HH}:${MM} UTC` ``.

Why a UTC parse rather than a substring: Supabase returns `timestamptz` as e.g.
`2026-10-03T14:51:07.123456+00:00`; the substring approach silently shows the wrong wall time if a value
ever carries a non-zero offset, while the UTC getters normalise it. Both are deterministic: the result
depends only on the input string, never on the runtime's locale or time zone, so server HTML and client
hydration agree. No `toLocaleString`, no `Intl.DateTimeFormat`, no `Date.now()`, no argument-less
`new Date()`.

An unparseable input (`Date.parse` returns `NaN`) returns the input string unchanged rather than
`NaN.NaN.NaN NaN:NaN UTC`; the columns are non-null `timestamptz`, so this is defensive only, and it is
tested.

`Timestamp` then renders `{formatTimestamp(value)}` inside the same `<time dateTime={value} title={value}
className="tabular-nums">`. This keeps the AGENTS.md rule that a component may only call a pure helper
from `src/lib/` on its own props.

## Relevant Files

Use these files to implement the feature:

- `src/components/Timestamp.tsx` - The one component that renders timestamps; its substring body and
  doc comment are replaced by a call to `formatTimestamp`.
- `src/components/ProjectNav.tsx` - Renders "Last run `<Timestamp value={project.last_run_at} />`" in the
  sidebar on `/` and every project page. Read only, no change.
- `src/components/RunRow.tsx` - Renders "Updated", "Started" and "Finished" through `Timestamp`. Read only,
  no change.
- `src/lib/run-view.ts` and `src/lib/run-view.test.ts` - Existing pure helper and its test; the model for
  style (module comment, `pad2`, fixed-timestamp test cases, `describe`/`it` from vitest).
- `AGENTS.md` - The rule "`Timestamp` renders ISO strings by substring on purpose ..." (around line 174)
  becomes stale and must be rewritten to describe the new helper; also the clock rules this change must
  obey.
- `README.md` - "Labels: no clock in the UI" quotes the old format (`"Updated 2026-10-03 11:52 UTC"`,
  around line 141); update the example and mention `formatTimestamp`.
- `vitest.config.ts` - Confirms `src/**/*.test.ts` is picked up; no change.
- `knip.json` - `src/**` is scanned; the new export must be used (by `Timestamp`) so knip stays clean.

### New Files

- `src/lib/format-date.ts` - `formatTimestamp(iso: string): string`, pure, no clock, no locale.
- `src/lib/format-date.test.ts` - Fixed-input unit tests.

## Implementation Plan

### Phase 1: Foundation

Create the pure formatter in `src/lib/format-date.ts` with a short module comment in the voice of
`run-view.ts` (why it is pure, why UTC getters, why no locale formatting). A local `pad2` (do not export
or import it from `run-view.ts`; that one is module-private and exporting it only for reuse would widen
that module's API for two lines).

### Phase 2: Core Implementation

Write `src/lib/format-date.test.ts` with the cases listed under Testing Strategy, then make them pass.

### Phase 3: Integration

Switch `Timestamp` to the helper, update its doc comment, and update the two documentation files. No
change to any caller, the data layer, types or query keys.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the formatter

- Create `src/lib/format-date.ts` exporting `formatTimestamp(iso: string): string` as described in the
  Solution Statement: `Date.parse`, `NaN` returns the input unchanged, otherwise build
  `DD.MM.YYYY HH:MM UTC` from `new Date(ms)`'s UTC getters with a module-private `pad2`.
- No `toLocaleString`, `Intl`, `Date.now()` or argument-less `new Date()`. No em-dashes in comments.

### 2. Add the unit test

- Create `src/lib/format-date.test.ts` modelled on `src/lib/run-view.test.ts` (fixed inputs, a one-line
  comment that nothing depends on when the suite runs). Cases:
  - normal value: `"2026-10-03T14:51:07Z"` gives `"03.10.2026 14:51 UTC"`;
  - Supabase shape with microseconds and offset: `"2026-10-03T14:51:07.123456+00:00"` gives
    `"03.10.2026 14:51 UTC"`;
  - midnight: `"2026-12-25T00:00:00Z"` gives `"25.12.2026 00:00 UTC"`;
  - single-digit day and month, single-digit hour and minute: `"2026-01-05T09:07:00Z"` gives
    `"05.01.2026 09:07 UTC"`;
  - a non-UTC offset is converted to UTC, crossing a day boundary: `"2026-03-01T01:30:00+02:00"` gives
    `"28.02.2026 23:30 UTC"`;
  - unparseable input is returned unchanged: `"not a date"` gives `"not a date"`.
- Run `yarn test` and confirm the new file passes.

### 3. Use it in `Timestamp`

- In `src/components/Timestamp.tsx`, import `formatTimestamp` from `@/lib/format-date` and render
  `{formatTimestamp(value)}` as the `<time>` element's only child. Keep `dateTime={value}`,
  `title={value}` and `className="tabular-nums"` exactly as they are. No `"use client"`.
- Rewrite the doc comment: renders an ISO 8601 timestamp as `DD.MM.YYYY HH:MM UTC` through
  `formatTimestamp`, a pure UTC parse with no locale or time zone of the runtime involved, so server and
  client markup agree.

### 4. Update documentation

- `AGENTS.md`: replace the rule "`Timestamp` renders ISO strings by substring on purpose ..." with: the
  visible text of every timestamp comes from `formatTimestamp` in `src/lib/format-date.ts`
  (`DD.MM.YYYY HH:MM UTC`, UTC getters on a parse of the input, unit-tested in
  `src/lib/format-date.test.ts`), called only by `Timestamp`; the `<time>` keeps the ISO value in
  `dateTime`; do not introduce `toLocaleString`, `Intl` or runtime-time-zone formatting, and every change
  to the format goes with a test case.
- `README.md`, "Labels: no clock in the UI": change the example to `"Updated 03.10.2026 11:52 UTC"` and
  say in one sentence that `Timestamp` formats through the pure `formatTimestamp` helper.
- `.adw/project.md` needs no change (no script, port, env file or doc location changes).

### 5. Browser evidence for the review phase

- E2E is `none` in the profile, so no spec is added. The review phase opens, at desktop 1920x1080 and
  mobile 375x667, full page:
  - `/`: every sidebar entry's "Last run" reads `DD.MM.YYYY HH:MM UTC` (e.g. `03.10.2026 14:51 UTC`).
  - `/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar lists if that is 404):
    sidebar "Last run", Active rows' "Updated", and History rows' "Started" and "Finished" all read
    `DD.MM.YYYY HH:MM UTC`; no `YYYY-MM-DD` text remains in any row.
  - A `browser_snapshot` (or DOM inspection) shows each `<time>` still carries the ISO string in
    `datetime` and `title`.
  - The browser console shows no hydration mismatch warning.

### 6. Run the validation commands

- Run every command in `Validation Commands`, in order, and fix anything that fails without weakening a
  rule, type or test.

## Testing Strategy

### Unit Tests

`src/lib/format-date.test.ts` exercises `formatTimestamp` with fixed ISO inputs only (normal value,
Supabase microsecond/offset shape, midnight, single-digit day/month/hour/minute, non-UTC offset crossing
a day boundary, unparseable input). No clock, no locale, no time zone dependence: the suite gives the
same result on a machine set to any `TZ`.

### Test Coverage

- `src/lib/format-date.test.ts` (unit, vitest `src/**/*.test.ts`, the profile's one test layer): catches
  any regression of the European format, the zero padding, the midnight `00:00` hour, and the
  conversion of an offset to UTC. Fails without this feature because the module does not exist; nothing
  currently tests timestamp formatting at all.
- `Timestamp.tsx` itself gets no test: the profile has no component test layer, and the component is
  now a one-line wrapper around the tested helper. Its rendered output is checked by the review phase's
  screenshots (task 5).

### Edge Cases

- Midnight renders `00:00`, not `24:00` or `0:00`.
- Single-digit day, month, hour and minute are zero-padded.
- Microsecond precision and a `+00:00` suffix (the Supabase shape) parse correctly.
- A non-zero offset is converted to UTC, including across a day and month boundary.
- An unparseable string is returned as is.
- The runtime's `TZ` must not affect the output (UTC getters only).
- `ProjectNav` only renders `Timestamp` when `last_run_at` is non-null; that guard is unchanged.

## Acceptance Criteria

- Every timestamp on `/` and `/projects/[...slug]` shows `DD.MM.YYYY HH:MM UTC`, e.g. `03.10.2026 14:51 UTC`.
- Each `<time>` keeps the original ISO value in `dateTime` (and `title`).
- `formatTimestamp` in `src/lib/format-date.ts` is the one formatting function and `Timestamp` its only
  caller; it reads no clock and uses no locale API.
- `src/lib/format-date.test.ts` covers a normal value, a midnight value and a single-digit day/month,
  plus the offset and invalid-input cases, and passes.
- `AGENTS.md` and `README.md` describe the new format and helper; no em-dashes added.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint over the new helper, its test and the edited component.
- `yarn typecheck` - `next typegen` then `tsc --noEmit`; confirms the new import and signature type-check.
- `yarn knip` - confirms `formatTimestamp` is used and nothing is left dead.
- `yarn format:check` - Prettier on the new and edited files (run `yarn format` if it fails).
- `yarn test` - runs `src/lib/format-date.test.ts` alongside the existing suites.
- `yarn build` - proves the prerender still succeeds under `cacheComponents` (no clock read introduced)
  and the pages render with the new labels; needs `.env.local`.

## Notes

- No new dependency. No date library: five UTC getters and a pad cover the format.
- `Date.parse` and `new Date(ms)` with an argument are not clock reads and are allowed under the
  AGENTS.md clock rules (`durationLabel` already uses `Date.parse`); only `Date.now()` and argument-less
  `new Date()` are restricted.
- The relative labels of issue #3 are out of scope and unaffected.
