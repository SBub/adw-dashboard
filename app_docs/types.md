# Types

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md

## Overview

The shared row and view-model types in `src/types/adw.ts`: database rows that mirror the schema column for column, and the view models the data layer produces.

## How it works

### Types

`src/types/adw.ts` has two sections. `Project`, `Run` and `QueueItem` (with
`QueueState`, the table's state check constraint) mirror the database tables
column for column. `ProjectSummary` is the one view model the screens
need that the database does not store (the counts and `last_run_at`); it comes
from the data layer (the `project_summaries` view computes them). Runs and
queue items have no view model: the screens take `Run` rows as stored, and a finished run's
duration is formatted at render time by `durationLabel` in
`src/lib/run-view.ts`.

## Rules

- `src/types/adw.ts` keeps database-row types (`Project`, `Run`, `QueueItem`) and the view
  model (`ProjectSummary`) in clearly separated sections. Row types mirror the
  schema column for column; `ProjectSummary` is produced by the data layer.
  `DailySummary`, `DailyModelSummary` and `DailyPhaseSummary` mirror the
  summary views' columns and sit with the view models, beside the report types
  (`SummaryDay`, `SummaryModel`, `SummaryPhase`) assembled from them.
  There is no run or queue item view model; do not add one for a label that a component can
  format from the row's own fields.
