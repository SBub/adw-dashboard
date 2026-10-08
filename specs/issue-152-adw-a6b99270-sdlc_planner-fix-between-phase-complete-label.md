# Bug: a running run between phases shows 'Complete' as its phase

## Metadata

issue_number: `152`
adw_id: `a6b99270`
issue_json: `{"number":152,"title":"bug: a running run between phases shows 'Complete' as its phase"}`

## Bug Description

An Active run row (status `running`) shows `Phase: Complete`, which reads as "this run is finished
and belongs in History". Seen on 2026-10-08 for SBub/adw-toolkit#92 (run `af64f123`,
`status = running`, `phase = adw_build_iso:complete`, `completed_adws = [adw_plan_iso, adw_build_iso]`).

Expected: a run between phases shows that step's "done" label (`adw_build_iso:complete` reads
`Build done`); only a finished composer run (`adw_sdlc_iso:complete`, `status = completed`) reads
`Complete`.

## Problem Statement

`phaseLabel` in `src/lib/run-phase.ts` maps every value ending in `:complete` to `Complete`,
whatever the prefix. The toolkit writes `:complete` in two different situations:

- `adws/adw_modules/state.py:110` saves `<step>:complete` after each phase finishes, while the run
  is still `running` (e.g. `adw_plan_iso:complete`, `adw_build_iso:complete`).
- `adws/adw_modules/composer_ops.py:87` (`mark_run_completed`) saves `<composer>:complete` when the
  whole run is done (e.g. `adw_sdlc_iso:complete`, `status = completed`).

The first case is mislabelled.

## Solution Statement

In `phaseLabel`, after the exact match and the `:composer` rule, handle `:complete` by looking up
the prefix among the known steps: if the step has a "done" label, return it; otherwise return
`Complete` (any non-step prefix is a composer). The "done" labels live beside the existing labels
in the same table (each step entry carries both its in-progress label and an optional done label),
so the step keys stay spelled once and the costed keys stay typed by `PhaseKey`.

| Raw value                                       | Label       |
| ----------------------------------------------- | ----------- |
| `adw_plan_iso:complete`                         | Plan done   |
| `adw_build_iso:complete`                        | Build done  |
| `adw_test_iso:complete`                         | Tests done  |
| `adw_review_iso:complete`                       | Review done |
| `adw_document_iso:complete`                     | Docs done   |
| `adw_ci_iso:complete`                           | CI done     |
| `adw_patch_iso:complete`                        | Patch done  |
| `<composer>:complete` (prefix not a known step) | Complete    |

Everything else is unchanged.

## Steps to Reproduce

1. In `src/lib/run-phase.test.ts`, add `["adw_build_iso:complete", "Build done"]` to the
   `it.each` table.
2. `yarn test`: the case fails, `phaseLabel("adw_build_iso:complete")` returns `Complete`.
3. In the app, a running run with `phase = adw_build_iso:complete` shows `Phase: Complete` in the
   Active list on `/projects` and on its project page (only reproducible while such a run exists;
   the unit test is the deterministic reproduction).

## Root Cause Analysis

The #142 spec only listed the composer form of `:complete`, so `phaseLabel` checks
`phase.endsWith(":complete")` and returns `Complete` without looking at the prefix. The per-phase
`<step>:complete` written by `ADWState.save` therefore collapses into the run-finished label. The
`:failed` rule already resolves its prefix against `STEP_LABELS`; `:complete` needs the same
prefix lookup, returning a "done" label instead of the in-progress one.

## Relevant Files

Use these files to fix the bug:

- `src/lib/run-phase.ts`: `phaseLabel`, `COSTED_STEP_LABELS` and `STEP_LABELS`; the only place the
  phase label mapping lives, and the fix.
- `src/lib/run-phase.test.ts`: the mapping's test table; gets the new cases.
- `src/lib/phase-usage.ts`: `PHASE_ORDER` / `PhaseKey`, the costed step keys the label table is
  typed against (read only, no change).
- `app_docs/screens-and-components.md`: the feature doc holding the run row phase mapping table and
  the rule describing the resolution order (lines ~37-98); must be updated in the same change.
- `docs/conditional-docs.md`: index line for `screens-and-components.md` already mentions "a run
  row's phase label"; no change needed.
- `AGENTS.md`, `.adw/project.md`: rules (Yarn only, no em-dashes, docs updated with behaviour).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the failing test cases

- In `src/lib/run-phase.test.ts`, add to the first `it.each` table:
  - `["adw_plan_iso:complete", "Plan done"]`
  - `["adw_build_iso:complete", "Build done"]`
  - `["adw_test_iso:complete", "Tests done"]`
  - `["adw_review_iso:complete", "Review done"]`
  - `["adw_document_iso:complete", "Docs done"]`
  - `["adw_ci_iso:complete", "CI done"]`
  - `["adw_patch_iso:complete", "Patch done"]`
  - keep `["adw_sdlc_iso:complete", "Complete"]`, and add `["adw_plan_build_iso:complete", "Complete"]`
    and `["foo:complete", "Complete"]` (any non-step prefix is a composer).
- Add an `it.each(PHASE_ORDER)` case: `` `${key}:complete` `` maps to a label that is neither
  `Complete` nor starts with `adw_` (guards that every costed key has a done label).
- Run `yarn test` and confirm the new step cases fail (they return `Complete`).

### 2. Add the done labels beside the step labels

- In `src/lib/run-phase.ts`, change the step table so each entry carries both labels instead of
  adding a second key list. For example a `StepLabel = { active: string; done?: string }`:
  - `COSTED_STEP_LABELS: Record<PhaseKey, Required<StepLabel>>`:
    `adw_plan_iso: { active: "Planning", done: "Plan done" }`,
    `adw_build_iso: { active: "Building", done: "Build done" }`,
    `adw_test_iso: { active: "Testing", done: "Tests done" }`,
    `adw_review_iso: { active: "Reviewing", done: "Review done" }`,
    `adw_document_iso: { active: "Documenting", done: "Docs done" }`
    (typing it `Required` makes a missing done label on a costed key a type error).
  - `STEP_LABELS: ReadonlyMap<string, StepLabel>`: `ensure_adw_id: { active: "Starting" }`,
    `"queue:classification": { active: "Classifying" }`, the costed entries,
    `adw_ci_iso: { active: "Checking CI", done: "CI done" }`,
    `adw_patch_iso: { active: "Patching", done: "Patch done" }`.
- Keep the `Map` (not a plain object lookup) so `toString` / `__proto__` stay raw.

### 3. Resolve `:complete` against the step table

- In `phaseLabel`, read `.active` for the exact match and the `:failed` rule.
- Replace `if (phase.endsWith(COMPLETE_SUFFIX)) return "Complete";` with: strip the suffix, look the
  prefix up in `STEP_LABELS`; return its `done` label when present, otherwise `Complete`.
- Keep the order: exact, `:composer`, `:complete`, `:failed`, raw.
- Update the file header comment and the JSDoc of `phaseLabel` to describe the two `:complete`
  forms (`<step>:complete` between phases, `<composer>:complete` when the run is done).
- No em-dashes.

### 4. Update the feature doc

- In `app_docs/screens-and-components.md`:
  - The sentence "shown as a label (Planning, Building, ..., Complete)" may stay, but add that a
    run between phases shows the finished step's done label (e.g. `Build done`).
  - The Rules paragraph on resolution order: `:complete` on a known step returns that step's done
    label; on any other prefix (a composer) it is `Complete`. Note the toolkit writes
    `<step>:complete` after each phase (run still `running`) and `<composer>:complete` when the run
    is done.
  - The mapping table: add the seven `<step>:complete` rows from the Solution Statement and change
    the `<composer>:complete` row to say "(prefix not a known step)". Keep the table aligned for
    Prettier (`yarn format` fixes it).
- No change to `docs/conditional-docs.md` (its line already covers the phase label).

### 5. Browser evidence

- No E2E code suite exists (profile: `none`) and no new `e2e/*.md` journey is warranted: the label
  only differs for a run that is momentarily between phases in the hosted database, which a
  journey cannot arrange (the database is read only). The unit test covers the mapping
  deterministically, and `RunRow` already renders `phaseLabel(run.phase)` unchanged.
- Review phase: open `/projects` and the first project page at 1920x1080 and 375x667 per the
  profile's Review section. Fixed state: no Active row with status `running` shows `Complete` as
  its Phase; a row between phases (if one exists at the time) shows e.g. `Build done` with the raw
  key as hover title. If no run is between phases, the evidence is the diff and the tests.

### 6. Run the Validation Commands

- Run every command below; all must pass.

## Test Coverage

Unit (vitest, `src/lib/run-phase.test.ts`): table cases for each `<step>:complete` mapping to its
done label, `adw_sdlc_iso:complete` / `adw_plan_build_iso:complete` / `foo:complete` mapping to
`Complete`, and a `PHASE_ORDER` sweep that every costed key's `:complete` is a done label. The step
cases fail on the unfixed code (it returns `Complete` for every `:complete`) and catch any
regression that collapses a between-phases run back into `Complete`.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `yarn test`: before the fix (after step 1) the new step `:complete` cases fail; after the fix the whole suite passes.
- `yarn lint`: ESLint over the changed files.
- `yarn typecheck`: the step label table types (`Record<PhaseKey, ...>`) and `phaseLabel` compile.
- `yarn knip`: no unused export or type introduced (keep `StepLabel` unexported unless used elsewhere).
- `yarn format:check`: Prettier, including the doc's mapping table.
- `yarn build`: the app still builds with the changed helper.

## Notes

- No new dependency.
- `ensure_adw_id` and `queue:classification` get no done label; the toolkit does not write
  `<that>:complete`, and if it ever did it falls to `Complete` like a composer. Mention this in the
  JSDoc rather than inventing labels the issue did not ask for.
- History's `?q` search still matches the raw column, not the label; unaffected.
- Commit as `fix: ...`, no trailers.
