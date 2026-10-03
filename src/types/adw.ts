// Domain types. The two interfaces in the first section mirror the database
// tables column for column; keep them in lockstep with the schema. The second
// section holds the one view model the screens need but the database does not
// store: ProjectSummary, produced by the data layer in src/data/ (the
// project_summaries view), never by a leaf component. Runs have no view model;
// the screens render Run rows as stored (the clock-dependent labels are
// removed pending issue #3).

// ---------------------------------------------------------------------------
// Database rows
// ---------------------------------------------------------------------------

export type RunStatus = "running" | "completed" | "failed";

export interface Project {
  id: string;
  slug: string;
  display_name: string;
  repo_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Run {
  project_id: string;
  adw_id: string;
  issue_number: number | null;
  issue_class: string | null;
  branch_name: string | null;
  phase: string | null;
  status: RunStatus;
  state: Record<string, unknown>;
  toolkit_version: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

// ---------------------------------------------------------------------------
// View models: provided by the data layer, not stored in the database
// ---------------------------------------------------------------------------

/** A project plus the per-status counts and last-run time the landing page shows. */
export interface ProjectSummary extends Project {
  running: number;
  completed: number;
  failed: number;
  last_run_at: string | null;
}
