// Everything the screens derive from the one Active entry (every visible
// project's running runs and failed runs from the last 7 days, see
// getActiveRuns in src/data/index.ts): a project page's rows, the sidebar's
// running and failed counts, and the /projects overview's groups. Also the
// failed-run window and the realtime catch-up's runs cursor (issue #243). All
// pure, no clock read, so the three readers of the same rows cannot disagree,
// and unit-tested in active-runs.test.ts.
import type { ProjectSummary, Run } from "@/types/adw";

const DAY_MS = 86_400_000;

/**
 * A failed run can be resumed, so it stays in Active for this many days after
 * its last update; older failed runs leave the Active list (issue #243).
 */
export const FAILED_RUN_WINDOW_DAYS = 7;

/** The ISO instant before which a failed run is out of Active, for a clock reading `nowMs`. */
export function failedRunCutoff(nowMs: number): string {
  return new Date(nowMs - FAILED_RUN_WINDOW_DAYS * DAY_MS).toISOString();
}

/**
 * Whether a run belongs in the Active entry: running always, failed when its
 * updated_at is at or after `failedSince`, any other status (completed, or a
 * future one such as cancelled) never. Parsed, not compared as strings:
 * Postgres and toISOString format the same instant differently.
 */
export function isInActiveWindow(
  run: Pick<Run, "status" | "updated_at">,
  failedSince: string,
): boolean {
  if (run.status === "running") return true;
  if (run.status !== "failed") return false;
  return Date.parse(run.updated_at) >= Date.parse(failedSince);
}

/**
 * How far before the cursor the incremental catch-up reads: the overlap that
 * covers writes committed slightly out of updated_at order.
 */
export const CATCH_UP_OVERLAP_MS = 60_000;

/** The updated_at the incremental catch-up reads from: the cursor minus the overlap. */
export function changedRunsSince(cursor: string): string {
  return new Date(Date.parse(cursor) - CATCH_UP_OVERLAP_MS).toISOString();
}

/**
 * The latest updated_at among `seen` and the rows, compared by instant and
 * returned verbatim (the server's own string). `seen` when no row is later,
 * null only when both are empty. This is the runs cursor: always a server
 * timestamp, never the client clock.
 */
export function latestUpdatedAt(
  runs: readonly Pick<Run, "updated_at">[],
  seen: string | null,
): string | null {
  let latest = seen;
  for (const run of runs) {
    if (latest === null || Date.parse(run.updated_at) > Date.parse(latest)) {
      latest = run.updated_at;
    }
  }
  return latest;
}

/** One project's active runs, in the order the entry holds them. */
export function activeRunsOf(runs: Run[], projectId: string): Run[] {
  return runs.filter((run) => run.project_id === projectId);
}

/**
 * The running and failed counts per project_id. A project with no active run
 * has no entry; the reader shows 0 for it.
 */
export function activeRunCounts(runs: Run[]): Map<string, { running: number; failed: number }> {
  const counts = new Map<string, { running: number; failed: number }>();
  for (const run of runs) {
    if (run.status !== "running" && run.status !== "failed") continue;
    const count = counts.get(run.project_id) ?? { running: 0, failed: 0 };
    count[run.status] += 1;
    counts.set(run.project_id, count);
  }
  return counts;
}

/**
 * The active runs grouped by project, in the order of `projects` (the
 * sidebar's order). A project with no active run is omitted, and a run whose
 * project is not in the list is dropped (nothing could name it). The runs of
 * a group keep the entry's order.
 */
export function groupActiveRuns(
  runs: Run[],
  projects: ProjectSummary[],
): { project: ProjectSummary; runs: Run[] }[] {
  return projects
    .map((project) => ({ project, runs: activeRunsOf(runs, project.id) }))
    .filter((group) => group.runs.length > 0);
}
