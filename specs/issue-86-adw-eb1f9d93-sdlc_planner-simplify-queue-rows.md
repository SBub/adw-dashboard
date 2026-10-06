# Chore: Queue row: drop the label chip and the wait line

## Metadata

issue_number: `86`
adw_id: `eb1f9d93`
issue_json: `{"number":86,"title":"Queue row: drop the label chip and the wait line","body":"The queue row added in #72 carries more than it needs. The next pill, the rail line, dots and ordinals stay as they are. (1) Remove the label: adw:queued chip from every row. (2) Remove the second line (waiting N min and the start hint); each row is one line: issue number, title, Queued <time>, status pill. (3) Keep the position derivation and the pure realtime reducer; only presentation changes. Delete QueueWait and queueStartHint (with its test), and the hasRunning prop if nothing else needs it. Add a row unit test and an e2e check for a project with three queued items following existing conventions. Keep the manual-source hint."}`

## Chore Description

The queue rail row (`QueueRow`, added in #72) shows more than it needs. This chore trims it to one line
per row, presentation only:

1. Remove the `label: <name>` chip (in practice `label: adw:queued`) from every row. The Queue section's
   description in the project page already explains the `adw:queued` label.
2. Remove the second line under the card: the wait so far (`QueueWait`, "waiting N min") and the head
   row's start hint (`queueStartHint`: "starts when the running run finishes" / "starts with the next
   runner"). Each row becomes one line: `#<issue>` link, title, `Queued <time>`, status pill.
3. Keep unchanged: the gutter, the `next` pill, the hollow ordinal markers, the amber rail line, the
   ordinals from `queuePositions` (ledger order), the `manual` badge and its visible hint
   ("Removing the label does not remove it."), the `QueueView` queue query and the pure reducer
   `applyQueueChange`.

Removing those two pieces leaves a chain of dead code that `yarn knip` (run on commit) and the rule
book would flag, so it goes in the same change:

- `src/components/QueueWait.tsx` (its only consumer is `QueueRow`).
- `src/hooks/use-now.ts` (its only consumer is `QueueWait`; knip reports the unused file).
- `waitLabel`, `queueStartHint` and `hasRunningRun` in `src/lib/queue-order.ts`, plus the helpers only
  `waitLabel` uses (`MINUTE`, `pad2`) and the `Run` type import (only `hasRunningRun` uses it).
  `hasRunningRun` is only used by `QueueView`'s second `useSuspenseQuery`, which exists solely to feed
  the head row's start hint.
- The `hasRunning` prop of `QueueRow` and the second `useSuspenseQuery` (on `queryKeys.runs(slug)`) in
  `QueueView`, together with the now unused `getActiveRuns` and `hasRunningRun` imports there.
- Their test cases in `src/lib/queue-order.test.ts` (`waitLabel`, `hasRunningRun`, `queueStartHint`
  describe blocks, the `run` fixture and the `Run` import).

`AGENTS.md` and `README.md` describe all of these as current code (the clock rule counts `useNow` as one
of the "exactly two" clock-read sites; the client-component list names `QueueWait`; the Queue rule names
`waitLabel`, `hasRunningRun`, `queueStartHint` and the runs read), so both are edited in place to describe
the code after the change.

Note on the issue text: item 3 says "keep the position derivation from `queued_at`". The actual (and
`AGENTS.md`-mandated) derivation is `queuePositions` in ledger order (`position`, then `issue_number`),
never `queued_at`. The intent is "do not touch the ordering", so `queuePositions` and `byQueuePosition`
stay exactly as they are.

## Relevant Files

Use these files to resolve the chore:

- `.adw/project.md` - ADW profile: single app at the root, commands, the one test layer
  (`src/**/*.test.ts`, no component layer, no Playwright suite), no em-dashes. No profile change is
  needed (no script, port, env file or doc location moves).
- `AGENTS.md` - Rule book. Sections to edit: the clock rule ("exactly two" sites, the `useNow` and
  `QueueWait` sentences), the `"use client"` list (`QueueWait`), and "The Queue is a rail" (the
  `waitLabel`/`hasRunningRun`/`queueStartHint` sentence and the head-row hint runs read).
- `README.md` - Lines ~199-223 (clock section: the paragraph "That leaf-level shape now exists for one
  label ..." about `QueueWait`/`useNow`) and ~362-394 (the `QueueView`/`QueueRow` description: the
  second line, the start hint, the `hasRunningRun` runs read, the `label: <name>` badge).
- `src/components/QueueRow.tsx` - The row: remove the label chip, the second `<p>` line, the
  `QueueWait`/`queueStartHint` imports and the `hasRunning` prop; update the doc comment.
- `src/components/QueueView.tsx` - Remove the second `useSuspenseQuery` (runs, `select: hasRunningRun`),
  the `hasRunning` prop pass-through and the `getActiveRuns`/`hasRunningRun` imports; adjust the doc
  comment if it mentions the hint.
- `src/components/QueueWait.tsx` - Deleted.
- `src/hooks/use-now.ts` - Deleted (only consumer is `QueueWait`).
- `src/lib/queue-order.ts` - Drop `waitLabel`, `hasRunningRun`, `queueStartHint`, `MINUTE`, `pad2` and
  the `Run` import; keep `byQueuePosition` and `queuePositions`; update the header comment.
- `src/lib/queue-order.test.ts` - Drop the three describe blocks for deleted functions, the `run`
  fixture and the `Run` import; keep `byQueuePosition` and `queuePositions` tests.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` - Read only: the Queue `SectionHeading` copy
  (lines ~286-301) already explains the `adw:queued` label and stays unchanged.
- `src/lib/queue-source.ts` / `src/lib/queue-source.test.ts` - Read only: `queueSource` still parses
  `label:<name>` (the parser is the one source parse, tested, and still decides `manual`); keep it and
  its tests unchanged even though the row no longer renders the `label` kind.
- `src/data/apply-queue-change.ts` - Read only: the reducer is untouched.
- `knip.json`, `vitest.config.ts`, `lefthook.yml` - Tooling that decides what must be deleted (knip
  scans `src/**`) and which tests run (`src/**/*.test.ts` only, node).
- `e2e/test_connection_indicator_scope.md` - The model for the new agent-driven journey.

### New Files

- `e2e/test_queue_row_single_line.md` - Agent-driven journey (acceptance gate, run by the test phase
  through the Playwright MCP server) checking that queue rows on a project page are one line with no
  label chip, no wait and no start hint, and that the rail markers are intact.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Simplify `QueueRow`

- In `src/components/QueueRow.tsx`:
  - Remove `import { queueStartHint } from "@/lib/queue-order";` and `import { QueueWait } from "./QueueWait";`.
  - Remove `hasRunning` from `QueueRowProps` (and its doc comment) and from the destructured params.
  - Remove the line `{source?.kind === "label" && <span className={BADGE}>label: {source.name}</span>}`.
    Keep the `source?.kind === "manual"` branch (badge with its `title` plus the visible
    "Removing the label does not remove it." hint) exactly as it is; `BADGE` stays (the manual badge
    uses it).
  - Remove the whole `{(isHead || item.queued_at !== null) && (<p ...> ... </p>)}` block, so the card
    holds only the one `flex` line. `isHead` is still used for the marker; keep it.
  - Rewrite the component's doc comment: drop "Nothing here reads the clock: the wait comes from the
    QueueWait leaf, and the head row's hint from queueStartHint."; state that the row is one line
    (issue link, title, source hint for a manual item, `Queued <time>`, status pill) and reads no clock.
    No em-dashes.

### 2. Drop the runs read from `QueueView`

- In `src/components/QueueView.tsx`:
  - Delete the second `useSuspenseQuery` block (the `hasRunning` one on `queryKeys.runs(slug)` with
    `select: hasRunningRun`) and the comment above it.
  - Remove `hasRunning={hasRunning}` from `<QueueRow>`.
  - Change imports to `import { getQueue } from "@/data";` and
    `import { queuePositions } from "@/lib/queue-order";`.
  - Leave the queue query, its options, the empty panel, the `<ol>` and the keys untouched.

### 3. Delete `QueueWait` and `useNow`

- Delete `src/components/QueueWait.tsx`.
- Delete `src/hooks/use-now.ts` (its one consumer was `QueueWait`; knip fails on the unused file).
  `src/hooks/use-debounced-callback.ts` stays.

### 4. Trim `src/lib/queue-order.ts` and its test

- In `src/lib/queue-order.ts`: delete `MINUTE`, `pad2`, `waitLabel`, `hasRunningRun`, `queueStartHint`;
  change the import to `import type { QueueItem } from "@/types/adw";`. Keep `byQueuePosition` and
  `queuePositions` (and their comments) byte for byte. Rewrite the file header comment to say it holds
  the ledger order and the ordinal each queued item gets, pure and clock-free.
- In `src/lib/queue-order.test.ts`: delete the `describe("waitLabel")`, `describe("hasRunningRun")` and
  `describe("queueStartHint")` blocks, the `run` fixture, the `Run` type import and the three names
  from the `./queue-order` import. Keep the `item` fixture and every `byQueuePosition` /
  `queuePositions` case unchanged.

### 5. Update `AGENTS.md`

- Clock rule (around lines 38-64): "exactly two" becomes "exactly one" argument-less
  `new Date()` / `Date.now()` site, `getActiveRuns`'s `fetched_at` stamp. Remove the sentences about
  the `useNow` store, "Never read the clock in `getSnapshot`" and "`QueueWait` is its one consumer ...".
  Keep the guidance that a future time-dependent label must be a leaf with `useSyncExternalStore` and a
  server snapshot that does not read the clock (issue #3), never a clock read in `QueueRow`,
  `QueueView` or `RunRow`. Keep the rest of the rule as is.
- `"use client"` list (around lines 230-240): remove "`QueueWait`, which subscribes to the `useNow` store,".
- "The Queue is a rail" (around lines 260-273): replace "`waitLabel`, `hasRunningRun` and
  `queueStartHint` live there too; all are pure and tested ..." with "both are pure and tested in
  `src/lib/queue-order.test.ts`, and every change to them goes with a test case"; delete the sentence
  "For the head row's hint `QueueView` reads `queryKeys.runs(slug)` ... never merge it into the queue
  entry."; add "A row is one line: issue link, title, the manual hint for a manual item, `Queued <time>`
  and the status pill; it shows no label chip, no wait and no start hint." Keep the gutter, marker and
  colour sentences.
- No em-dashes anywhere.

### 6. Update `README.md`

- Clock section (around lines 199-223): delete the paragraph "That leaf-level shape now exists for one
  label: the Queue's wait so far. ... The run labels above are unchanged and still tracked in issue
  #3." so the section again says the time-dependent labels are removed and tracked in issue #3. Make
  sure the following paragraph (`fetched_at` ...) still reads correctly.
- `QueueView` / `QueueRow` description (around lines 362-394): replace "and under it a second line: the
  wait so far ... the runs listener keeps the hint live." with a description of the single line (issue
  link, title, `Queued <time>` with `none` for a `null` `queued_at`, status pill). Change the source
  sentence so that `manual` renders the `manual` badge plus the visible hint, and every other value
  (`label:<name>` included, or `null`) renders no badge, because the section description already
  explains the label. `queueSource` is still the one parse.
- Grep `README.md` and `AGENTS.md` afterwards for `QueueWait`, `useNow`, `use-now`, `waitLabel`,
  `queueStartHint`, `hasRunningRun`, `hasRunning`: no hits may remain.

### 7. Add the agent-driven journey `e2e/test_queue_row_single_line.md`

- Model it on `e2e/test_connection_indicator_scope.md` (title, intro, User Story, Test Steps with
  **Verify** steps, Success Criteria, screenshot count).
- Steps: open `/projects`; wait for the `status` pill to read `live`; open projects from the sidebar
  until one shows queued items in the Queue section (prefer one with three or more; the hosted database
  is read only, so the journey never adds items). On that page **verify**: the Queue list's first item
  has the `next` marker and the next ones show `2`, `3`; every Queue list item contains `#<number>`,
  `Queued` and a `queued` status pill; no Queue list item contains `label:`, `waiting` or `starts `;
  a `manual` item (if any) still shows `manual` and "Removing the label does not remove it.". Screenshot
  at 1920x1080 and at 375x667. If no listed project has a queued item, verify the dashed
  `Nothing queued.` panel, note in the result that the row checks were not applicable, and still pass.
- This is an acceptance gate, not a regression layer (see Test Coverage). Do not place it under
  `.claude/commands/e2e/`.

### 8. Run the validation commands

- Run every command in `Validation Commands` from the worktree root, in order, and fix anything they
  report without weakening a rule, a type or a test.

## Test Coverage

No new automated test: this is a removal of presentation and of the code that only fed it, and the
profile's one test layer (`src/**/*.test.ts`, vitest in node) has no way to render a component. The
issue asks for a `QueueRow` unit test and a Playwright snapshot, but the profile states there is no
component test layer and no Playwright suite, and inventing either (adding Testing Library, jsdom or
`@playwright/test`) is out of scope for a chore. Deleting `waitLabel`, `queueStartHint` and
`hasRunningRun` along with their test cases needs no replacement test; the remaining `byQueuePosition`
and `queuePositions` cases keep pinning the ordinals the issue says must not change. Browser evidence
comes from the new `e2e/test_queue_row_single_line.md` journey (task 7) and the review phase's
screenshots of `/projects/SBub/issebya-homes-ai-system` at 1920x1080 and 375x667.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the repository; catches unused imports left in `QueueRow`, `QueueView` or
  the test file.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`; catches a stale `hasRunning` prop or an import
  of a deleted module. Do not stage the rewritten `next-env.d.ts`.
- `yarn knip` - dead-code check; proves `QueueWait.tsx`, `use-now.ts` and the deleted exports leave
  nothing unused behind.
- `yarn format:check` - Prettier; the edited TS, TSX and Markdown files must be formatted.
- `yarn test` - vitest; the trimmed `queue-order.test.ts` and every other unit test still pass.
- `yarn build` - Next build with `.env.local`; proves the project page still prerenders with the queue
  and runs prefetches.
- `grep -rnE "QueueWait|useNow|use-now|waitLabel|queueStartHint|hasRunning" src README.md AGENTS.md` -
  must print nothing (stale references in code or docs).

## Notes

- The issue's phrase "position derivation from `queued_at`" is inaccurate; ordinals come from
  `queuePositions` (ledger order) and `AGENTS.md` forbids `queued_at`. Do not touch it.
- The Queue `SectionHeading` description in the page ("First in, first out. The top item starts when
  the running one finishes. ...") stays: it is the section copy that now carries the explanation the
  chip and the start hint used to repeat.
- Keep `queueSource` and its `label` kind: it is still the one parse of `queue_items.source` and
  decides whether the manual hint shows.
- After the change the only argument-less clock read is `getActiveRuns`'s `fetched_at`; verify with
  `grep -rnE "Date\.now\(\)|new Date\(\)" src` (comments aside).
- Commit as `chore: ...`, no trailers, no em-dashes in any file.
