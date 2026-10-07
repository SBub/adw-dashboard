// Everything the screens derive from the one Active entry (every visible
// project's running and failed runs, see getActiveRuns in src/data/index.ts):
// a project page's rows, the sidebar's running and failed counts, and the
// /projects overview's groups. All pure, so the three readers of the same
// rows cannot disagree, and unit-tested in active-runs.test.ts.
import type { ProjectSummary, Run } from "@/types/adw";

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
