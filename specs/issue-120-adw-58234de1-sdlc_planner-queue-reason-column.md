# Chore: Queue: read the ledger's reason column instead of note

## Metadata

issue_number: `120`
adw_id: `58234de1`
issue_json: `{"number":120,"title":"Queue: read the ledger's reason column instead of note","body":"On 2026-10-07 the toolkit moved the queue ledger into adw.queue_items (SBub/adw-toolkit#55, #56) and renamed note to reason. The dashboard's queue read selects note, so every project page failed with \"column queue_items.note does not exist\" until a read-only compatibility column note (generated from reason) was added by hand. Change the following paths to select and type reason instead of note (same meaning: the human-readable outcome line). No visual change. src/data/index.ts (line 73: QUEUE_COLUMNS constant), src/types/adw.ts (line 65: QueueItem interface note field), src/data/apply-queue-change.test.ts (line 23: test data), src/lib/queue-order.test.ts (line 15: test data). After this is deployed to production, the toolkit drops the alias (see the toolkit issue)."}`

## Chore Description

The toolkit renamed the `adw.queue_items` column `note` to `reason` (same meaning: the human-readable
outcome line of a ledger item). The dashboard's queue read (`getQueue` in `src/data/index.ts`)
still selects `note`, which only works today because a read-only compatibility column `note`
(generated from `reason`) was added by hand. Once the toolkit drops that alias, every project page
would fail again with `column queue_items.note does not exist`.

Rename the field in the one row type (`QueueItem` in `src/types/adw.ts`) and the one select list
(`QUEUE_COLUMNS` in `src/data/index.ts`), keeping the AGENTS.md rule that `QUEUE_COLUMNS` equals the
fields of `QueueItem` column for column, and update the two test fixtures that build a full
`QueueItem`. No component, reducer or helper reads the field (verified with `grep -rnw note src`:
the only hits are the four listed lines plus an unrelated comment in `src/app/page.tsx`), so there is
no visual change and no behaviour change.

## Relevant Files

Use these files to resolve the chore:

- `src/types/adw.ts` - `QueueItem` row type (line 65, `note: string | null;`). Row types mirror the
  schema column for column, so the field becomes `reason: string | null;` in the same position.
- `src/data/index.ts` - `QUEUE_COLUMNS` (line 73), the select list of `getQueue` and the realtime
  catch-up. Must stay exactly the fields of `QueueItem`; `note` becomes `reason` in the same position.
- `src/data/apply-queue-change.test.ts` - `item()` fixture (line 23) builds a full `QueueItem`;
  `note: null` becomes `reason: null` or the typecheck fails.
- `src/lib/queue-order.test.ts` - `item()` fixture (line 15), same change.
- `AGENTS.md` - read for the rule that `QUEUE_COLUMNS` equals the fields of `QueueItem`; it does not
  name the column, so it needs no edit.
- `README.md` - the queue section (around line 56) describes `QUEUE_COLUMNS` as "exactly the fields of
  `QueueItem`" without listing columns, so it needs no edit. Checked: no mention of `note` as a column.
- `.adw/project.md` - profile; no script, port, env file or docs location changes, so no edit.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Rename the field in the row type

- In `src/types/adw.ts`, in `interface QueueItem`, replace `note: string | null;` with
  `reason: string | null;` (same position, between `adw_id` and `updated_at`).

### 2. Rename the column in the select list

- In `src/data/index.ts`, change `QUEUE_COLUMNS` to
  `"project_id, issue_number, state, source, position, issue_title, queued_at, adw_id, reason, updated_at"`.
- Leave the doc comment above it as is (it still holds: exactly the fields of `QueueItem`).

### 3. Update the test fixtures

- In `src/data/apply-queue-change.test.ts`, in `item()`, replace `note: null,` with `reason: null,`.
- In `src/lib/queue-order.test.ts`, in `item()`, replace `note: null,` with `reason: null,`.

### 4. Confirm nothing else refers to the old name

- Run `grep -rnw note src` and confirm the only remaining hit is the comment in `src/app/page.tsx`
  ("the reading note"), which is unrelated prose and stays.

### 5. Run the validation commands

- Run every command in `Validation Commands` below, in order, and fix any failure before finishing.

## Test Coverage

No test needed: this is a column rename with no logic. The field is read by no reducer, helper or
component, so no unit test in `src/**/*.test.ts` (the project's one test layer) can observe it; the
existing fixtures are updated so they still type as `QueueItem`, and `yarn typecheck` catches any
missed reference to `note`. The rename against the real schema is proven by `yarn build`, which runs
`getQueue` for every project slug against the hosted database and fails if `reason` does not exist.
No E2E journey is added: there is no visual change, and the existing `e2e/test_queue_row_single_line.md`
already exercises a project page's Queue section.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the changed files.
- `yarn typecheck` - proves `QueueItem` and every fixture agree on `reason` and no reference to `note` remains.
- `yarn knip` - no dead exports or files introduced.
- `yarn format:check` - Prettier formatting of the four touched files.
- `yarn test` - the queue reducer and queue order tests still pass with the renamed fixtures.
- `yarn build` - reads `adw.queue_items` with the new `QUEUE_COLUMNS` for every slug at build time;
  proves the hosted schema has `reason` (needs `.env.local`).

## Notes

- The hand-added compatibility column `note` still exists in the database, so the build would also pass
  with the old select; the build proves `reason` is readable, `typecheck` proves the old name is gone.
- After this is deployed to production the toolkit drops the `note` alias (toolkit issue). Do not
  touch the database from here: the Protected section forbids writes to the hosted Supabase project.
- Realtime payloads for `adw.queue_items` carry the full new row, so `ev.new` will carry `reason`
  after the rename; no reducer reads it, so `applyQueueChange` needs no change.
- Commit as `chore: read queue_items.reason instead of note` (Conventional Commits, no scope, no trailers).
