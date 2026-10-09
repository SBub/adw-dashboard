# Chore: Run rows: show the phase as a friendly label instead of the raw step key

## Metadata

issue_number: `142`
adw_id: `0093e1de`
issue_json: `{"number":142,"title":"Run rows: show the phase as a friendly label instead of the raw step key"}`

## Chore Description

Run rows (`src/components/RunRow.tsx`, used by the Active section on `/projects` and on a project
page, and by History on a project page) show `run.phase` as stored, in monospace through the local
`Mono` component: `adw_plan_iso`, `adw_document_iso:failed`, `adw_sdlc_iso:complete`. It reads like
a log line, not a status.

After this chore the `Phase` field (Active) and the `Final phase` field (History) show a
user-facing word produced by a new pure helper, `phaseLabel(phase: string | null): string | null`
in `src/lib/run-phase.ts`. The mapping, from the values the toolkit writes to `runs.phase`
(`ADWState.save(workflow_step)`):

| Raw value                                                      | Label                                   |
| -------------------------------------------------------------- | --------------------------------------- |
| `ensure_adw_id`                                                | Starting                                |
| `<composer>:composer` (e.g. `adw_sdlc_iso:composer`)           | Starting                                |
| `queue:classification`                                         | Classifying                             |
| `adw_plan_iso`                                                 | Planning                                |
| `adw_build_iso`                                                | Building                                |
| `adw_test_iso`                                                 | Testing                                 |
| `adw_review_iso`                                               | Reviewing                               |
| `adw_document_iso`                                             | Documenting                             |
| `adw_ci_iso`                                                   | Checking CI                             |
| `adw_patch_iso`                                                | Patching                                |
| `<step>:failed` with a known step (e.g. `adw_plan_iso:failed`) | the step's label (Planning, ...)        |
| `<composer>:complete` (e.g. `adw_sdlc_iso:complete`)           | Complete                                |
| `null`                                                         | `null` (the row shows "none", as today) |
| anything else, including `:failed` on an unknown step          | the raw value, unchanged                |

Resolution order inside `phaseLabel` (exact matches first, because `queue:classification` itself
contains a colon):

1. `null` returns `null`.
2. An exact key in the step table (`ensure_adw_id`, `queue:classification`, the five costed steps,
   `adw_ci_iso`, `adw_patch_iso`) returns its label.
3. A value ending in `:composer` returns `Starting`; a value ending in `:complete` returns
   `Complete` (any composer prefix: the toolkit has several composers and the suffix alone says
   what the row is).
4. A value ending in `:failed` whose prefix is an exact key of the step table returns that step's
   label (the `failed` status pill already says it failed).
5. Anything else returns the raw value unchanged, so a new toolkit step is never hidden.

`RunRow` calls `phaseLabel(run.phase)` and renders the label as plain text (not `Mono`), with the raw
value as the element's `title` for debugging. The phase keys stay spelled once: the five costed
keys live in `PHASE_ORDER` in `src/lib/phase-usage.ts`; `run-phase.ts` imports `PhaseKey` and types
its label table for them as `Record<PhaseKey, string>`, so the compiler rejects a key that is
missing from or not in `PHASE_ORDER`. The summary charts' short nouns (Plan, Build, Test, Review,
Document) do not change. No SQL change, no view model, no toolkit change. History's `?q` search
still matches the raw column (searching "Planning" finds nothing); that is accepted.

## Relevant Files

Use these files to resolve the chore:

- `AGENTS.md`: repository rules (Yarn only, no em-dashes, conventional commits with no trailers,
  feature docs updated in the same change, profile kept in step).
- `.adw/project.md`: the ADW profile. Its Tests section lists the agent-driven `e2e/*.md`
  journeys; the new journey must be added to that list (headings untouched).
- `docs/conditional-docs.md`: the doc index. The `screens-and-components.md` line is the match
  (changing a row's layout); its "read when" text gains the phase label.
- `app_docs/screens-and-components.md`: describes run rows and the rule "the one formatting a
  component may do is call a pure helper from `src/lib/` on the row's own fields (`RunRow` calls
  `durationLabel(...)`)". Gains `phaseLabel(run.phase)`, the mapping rule (one helper, raw fallback,
  every mapping change with a test case) and `src/lib/run-phase.ts` next to the other pure helpers.
- `app_docs/summary.md`: says `src/lib/phase-usage.ts` holds the phase order and names; gains one
  sentence that `PHASE_ORDER` is also the key list `src/lib/run-phase.ts` labels (chart names
  unchanged).
- `src/components/RunRow.tsx`: renders `<Mono value={run.phase} />` inside the `Phase` /
  `Final phase` `Field`; switches to the label. `Mono` stays (Branch still uses it).
- `src/lib/phase-usage.ts`: owns `PHASE_ORDER` and `PhaseKey`; read-only for this chore apart from
  its header comment, which gains a mention that `run-phase.ts` shares the key list.
- `src/lib/phase-usage.test.ts`: pins `PHASE_ORDER` and the chart names; must keep passing
  unchanged.
- `src/lib/run-view.ts` / `src/lib/run-view.test.ts`: the model for a pure, clock-free helper file
  with its header comment and an `it.each` test.
- `src/types/adw.ts`: `Run.phase` is `string | null` (line 38); not changed.
- `e2e/test_row_full_title_top_align.md`: the model for the new agent-driven journey (navigate,
  wait for `live`, pick a project with rows, `browser_evaluate`, screenshots).
- `knip.json`, `vitest.config.ts`: the new file is under `src/**` and the test under
  `src/**/*.test.ts`, so both pick them up without config changes.

### New Files

- `src/lib/run-phase.ts`: `phaseLabel`, the step label table, no clock, no IO.
- `src/lib/run-phase.test.ts`: one case per row of the mapping table, plus an unknown value and a
  `:failed` suffix on an unknown key.
- `e2e/test_run_row_phase_label.md`: agent-driven journey checking that a run row's phase field
  shows a label, not an `adw_` key.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the pure helper `src/lib/run-phase.ts`

- Header comment in the style of `run-view.ts` / `phase-usage.ts`: what a run row's phase label is,
  pure (no clock, no cache, no IO), tested in `src/lib/run-phase.test.ts`, keys shared with
  `PHASE_ORDER` in `src/lib/phase-usage.ts`.
- `import type { PhaseKey } from "./phase-usage";` (or `@/lib/phase-usage`, matching the
  surrounding imports).
- `const COSTED_STEP_LABELS: Record<PhaseKey, string> = { adw_plan_iso: "Planning", adw_build_iso:
"Building", adw_test_iso: "Testing", adw_review_iso: "Reviewing", adw_document_iso:
"Documenting" };` The `Record<PhaseKey, string>` type is what ties it to `PHASE_ORDER`: adding or
  removing a key there fails the typecheck here.
- `const STEP_LABELS: Readonly<Record<string, string>> = { ensure_adw_id: "Starting",
"queue:classification": "Classifying", ...COSTED_STEP_LABELS, adw_ci_iso: "Checking CI",
adw_patch_iso: "Patching" };` Look up with `Object.hasOwn(STEP_LABELS, key)` (not `in` or a bare
  index), so a raw value such as `toString` or `__proto__` falls through to the raw fallback and the
  `security/detect-object-injection` lint rule is satisfied (if the lint still flags the indexed
  read, use a `Map` built from the same entries instead).
- Suffix constants `":composer"`, `":complete"`, `":failed"` as named consts.
- `export function phaseLabel(phase: string | null): string | null` implementing the five-step
  resolution order in the Chore Description, with a JSDoc that states the order and the raw
  fallback. Only `phaseLabel` is exported (knip flags any other unused export).

### 2. Add `src/lib/run-phase.test.ts`

- `import { describe, expect, it } from "vitest"; import { phaseLabel } from "./run-phase";`
- `it.each` over every row of the table:
  - `ensure_adw_id` → `Starting`; `adw_sdlc_iso:composer` → `Starting`; a second composer such as
    `adw_plan_build_iso:composer` → `Starting`.
  - `queue:classification` → `Classifying`.
  - `adw_plan_iso` → `Planning`, `adw_build_iso` → `Building`, `adw_test_iso` → `Testing`,
    `adw_review_iso` → `Reviewing`, `adw_document_iso` → `Documenting`, `adw_ci_iso` →
    `Checking CI`, `adw_patch_iso` → `Patching`.
  - every `:failed` variant of the seven steps (e.g. `adw_plan_iso:failed` → `Planning`,
    `adw_document_iso:failed` → `Documenting`, `adw_ci_iso:failed` → `Checking CI`), and
    `queue:classification:failed` → `Classifying`.
  - `adw_sdlc_iso:complete` → `Complete`.
- `null` → `null`.
- Raw fallback: an unknown value (`adw_new_iso`) returns itself; a `:failed` suffix on an unknown
  key (`adw_new_iso:failed`) returns `adw_new_iso:failed` unchanged; a prototype name
  (`toString`) returns `toString`.
- Shared key list: `it.each(PHASE_ORDER)` (imported from `./phase-usage`) asserts each key's label
  is not the key itself and does not start with `adw_`, so a key added to `PHASE_ORDER` without a
  label cannot slip through as raw text even if the types were loosened.

### 3. Use the helper in `src/components/RunRow.tsx`

- `import { phaseLabel } from "@/lib/run-phase";` next to the `run-view` import.
- Compute `const phase = phaseLabel(run.phase);` beside `duration`.
- Replace `<Mono value={run.phase} />` in the `Phase` / `Final phase` field with: when `phase` is
  null or empty, the same muted `none` span `Mono` renders today
  (`<span className="text-neutral-400 dark:text-neutral-600">none</span>`); otherwise
  `<span title={run.phase ?? undefined}>{phase}</span>` (plain text, inherits the `dd`'s `text-sm`
  and `truncate`). Keep the `Field` labels exactly (`Phase` / `Final phase`).
- Keep `Mono` for Branch. Update the component's JSDoc: every value shown is a column or a pure
  function of the row's columns (`durationLabel` for Duration, `phaseLabel` for the phase).

### 4. Touch up `src/lib/phase-usage.ts` comments

- Add to the header comment (or the `PHASE_ORDER` JSDoc) that `PHASE_ORDER` is also the key list
  `src/lib/run-phase.ts` labels for run rows, so the keys are spelled once. No code change; the
  chart names and `phase-usage.test.ts` stay as they are.

### 5. Update the docs

- `app_docs/screens-and-components.md`:
  - In the right-pane description, say the Active row shows the phase and History the final phase
    as a label (Planning, Building, ..., Complete), with the raw step key as the hover title.
  - In Rules, extend "The one formatting a component may do is call a pure helper ... (`RunRow`
    calls `durationLabel(...)`)" to also name `phaseLabel(run.phase)`, and add a rule: the phase
    label comes only from `phaseLabel` in `src/lib/run-phase.ts` (one helper, no second mapping in
    a component); an unknown value is shown raw so a new toolkit step is never hidden; the costed
    step keys are shared with `PHASE_ORDER` in `src/lib/phase-usage.ts`; every change to the
    mapping goes with a test case in `src/lib/run-phase.test.ts`. Include the mapping table
    (no em-dashes).
  - Where the doc lists `src/lib/run-view.ts` as plain and importable, list
    `src/lib/run-phase.ts` with it.
  - Note that History's `?q` search matches the raw column, not the label.
- `app_docs/summary.md`: one sentence where it says `phase-usage.ts` holds the phase order and
  names: the same `PHASE_ORDER` is the key list run rows label through `src/lib/run-phase.ts`; the
  chart names are unchanged.
- `docs/conditional-docs.md`: extend the `screens-and-components.md` line's "read when" with
  "a run row's phase label".
- Run `grep -rn "—" app_docs docs e2e src/lib/run-phase.ts src/lib/run-phase.test.ts` and make
  sure nothing new contains an em-dash.

### 6. Add the agent-driven journey `e2e/test_run_row_phase_label.md`

The profile's E2E code suite is `none`, so the issue's e2e check is an agent-driven journey,
modelled on `e2e/test_row_full_title_top_align.md` (read-only: never writes to the database):

- User story: as a person watching ADW runs I want the phase in plain words.
- Steps: navigate to `/projects`; wait for the `status` element to read `live`; verify every
  `dd` under a `Phase` label in the Active list (if any) does not have text starting with `adw_`
  and is not inside a `code` element. Click the first project link in the sidebar; prefer a project
  whose History has at least one row (try the next project otherwise; if none has a run row, note
  it, take the screenshots and pass). Verify, with `browser_evaluate`, for every History row that
  the `dd` under `Final phase` has text that does not start with `adw_`, has no `code` descendant,
  and that its inner span's `title` attribute is the raw step key (non-empty); verify at least one
  shows a label from the table (e.g. `Complete`, `Documenting`). Repeat the Active check on the
  project page. Screenshot at 1920x1080 and at 375x667.
- Success criteria: no `Phase` / `Final phase` value starts with `adw_` for a known step; the raw
  key is the hover title; 2 screenshots.
- Add `e2e/test_run_row_phase_label.md` to the journey list in `.adw/project.md`'s `## Tests`
  section (append to the list; do not rename or reorder any `##` heading).

### 7. Run the Validation Commands

- Run every command below from the worktree root; all must pass. Fix lint output with
  `yarn lint:fix` and formatting with `yarn format`, never by weakening a rule.

## Test Coverage

- Unit (vitest, `src/lib/run-phase.test.ts`, the profile's one test layer): one case per row of the
  mapping table plus an unknown value, an unknown key with `:failed`, a prototype name and a
  `PHASE_ORDER` sweep. It fails without this change (the module does not exist) and catches any
  future drift in the mapping, a key added to `PHASE_ORDER` without a label, and a regression of the
  raw fallback, none of which any test covers today.
- `src/lib/phase-usage.test.ts` runs unchanged and proves the chart names did not move.
- The rendered change in `RunRow` has no test layer here (no component tests, E2E code suite
  `none`); its browser evidence is the new agent-driven journey (task 6) and the review phase's
  screenshots of `/projects` and the project page.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint`: ESLint (Next, security, no-secrets) over the new helper, test and `RunRow`.
- `yarn typecheck`: `next typegen` then `tsc --noEmit`; proves `Record<PhaseKey, string>` matches
  `PHASE_ORDER` and `RunRow` types (do not stage the rewritten `next-env.d.ts`).
- `yarn knip`: no unused export or file (only `phaseLabel` is exported; `Mono` still used).
- `yarn format:check`: Prettier on the new and edited files, docs included.
- `yarn test`: vitest, including the new `src/lib/run-phase.test.ts` and the unchanged
  `src/lib/phase-usage.test.ts`.
- `yarn build`: production build (needs `.env.local`, read-only database access); proves the row
  still prerenders.

## Notes

- Issue number `142` comes from the issue JSON; adw_id `0093e1de`.
- `<composer>:failed` (e.g. `adw_sdlc_iso:failed`) is not in the issue's table: a composer is not a
  step, so it falls through to the raw value. That is the table's "anything else" row; if it shows
  up in practice, a follow-up can map it with a test case.
- `:composer` and `:complete` are matched by suffix on any prefix (the toolkit has several
  composers); `:failed` maps only for a known step, so an unknown step is still shown raw.
- Labels are plain strings with no clock read, so the row's server and client markup stay
  identical; nothing here touches the data boundary, query keys, cache tags or Realtime.
- `LoadingSkeletons` mirrors row shapes only; the phase field's width change from monospace to
  proportional text does not need a skeleton change.
- Commit messages: `chore: ...`, no trailers.
