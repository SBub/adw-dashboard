// Folds one Realtime change event on the adw.runs table into the two cache
// entries it affects: the runs of the project the run belongs to
// (applyRunChange) and the project list's counts (applyRunChangeToSummaries).
// Both are pure: they never touch the cache, the client or the clock, they
// just return the next value, which is what makes them unit-testable without
// a socket. The realtime module hands their results to queryClient.setQueryData.
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { ProjectSummary, Run, RunStatus } from "@/types/adw";
import type { ProjectRuns } from "./index";

/** One change event on adw.runs, as the channel delivers it. */
export type RunChange = RealtimePostgresChangesPayload<Run>;

/**
 * The status the cached runs hold for `adwId`, or undefined when the run is in
 * neither list. The realtime module reads this BEFORE applying the change, so
 * the counts reducer can be told what status it is leaving: Supabase sends
 * `old` with only the primary key columns unless the table's replica identity
 * is FULL, so an UPDATE or DELETE event does not carry the previous status.
 */
export function runStatusIn(current: ProjectRuns | null | undefined, adwId: string) {
  if (!current) return undefined;
  return (
    current.active.find((run) => run.adw_id === adwId) ??
    current.history.find((run) => run.adw_id === adwId)
  )?.status;
}

function without(runs: Run[], adwId: string): Run[] {
  // Same array back when nothing was removed, so the untouched list keeps its
  // identity and React skips re-rendering its rows.
  const next = runs.filter((run) => run.adw_id !== adwId);
  return next.length === runs.length ? runs : next;
}

/**
 * Returns the project's runs after applying `ev`:
 *
 * - INSERT prepends the row to `active` when its status is running, otherwise
 *   to `history` (both lists are newest first). If a run with that adw_id is
 *   already in either list the input is returned unchanged, so a replayed or
 *   duplicated event cannot create a second row.
 * - UPDATE replaces the row with the same adw_id and moves it between the two
 *   lists when its status changed sides (running to completed or failed moves
 *   it from `active` to the top of `history`; the reverse direction moves it
 *   back). A run that is in neither list is added as if inserted: the event
 *   carries the full row, and leaving it out would keep the pane behind the
 *   database for the rest of the session.
 * - DELETE removes the run whose adw_id is `ev.old.adw_id` from both lists.
 *   The runs primary key is (project_id, adw_id), so both are present in
 *   `old` under the default replica identity; nothing else is relied on.
 *
 * `fetched_at` is kept as is. It is the seed of the browser clock during
 * hydration only; after that the live clock drives the labels, so a change
 * event has no reason to touch it. The input is never mutated.
 */
export function applyRunChange(current: ProjectRuns, ev: RunChange): ProjectRuns {
  switch (ev.eventType) {
    case "INSERT": {
      if (runStatusIn(current, ev.new.adw_id) !== undefined) return current;
      return place(current, ev.new);
    }
    case "UPDATE": {
      const adwId = ev.new.adw_id;
      const stripped: ProjectRuns = {
        ...current,
        active: without(current.active, adwId),
        history: without(current.history, adwId),
      };
      return place(stripped, ev.new, current);
    }
    case "DELETE": {
      const adwId = ev.old.adw_id;
      if (adwId === undefined) return current;
      if (runStatusIn(current, adwId) === undefined) return current;
      return {
        ...current,
        active: without(current.active, adwId),
        history: without(current.history, adwId),
      };
    }
  }
}

/**
 * Puts `run` into the list its status belongs to. For an UPDATE whose status
 * did not change sides the row keeps its position (the list is rebuilt with
 * the new row where the old one was, read off `before`); otherwise, and for an
 * INSERT, the row goes to the top of its list, which is where the newest
 * updated_at sorts.
 */
function place(stripped: ProjectRuns, run: Run, before?: ProjectRuns): ProjectRuns {
  const side: keyof Pick<ProjectRuns, "active" | "history"> =
    run.status === "running" ? "active" : "history";
  const previousIndex = before ? before[side].findIndex((r) => r.adw_id === run.adw_id) : -1;
  const list = [...stripped[side]];
  list.splice(previousIndex === -1 ? 0 : previousIndex, 0, run);
  return { ...stripped, [side]: list };
}

/**
 * Returns the project list after a runs event, with the matching project's
 * counts and last_run_at adjusted. The counts come from the
 * adw.project_summaries view, which the projects listener never sees change
 * (a run event does not touch adw.projects), so they are maintained here by
 * status delta:
 *
 * - INSERT: +1 for the new row's status.
 * - UPDATE: -1 for `oldStatus` and +1 for the new status. When `oldStatus`
 *   is unknown (the project's runs are not cached, or the run was not among
 *   them) the counts are left alone: without the previous status a delta
 *   cannot be computed, and guessing +1 would inflate a count on every phase
 *   heartbeat. The next catch-up (see realtime.ts) or page load corrects them.
 * - DELETE: -1 for `oldStatus`, or no change when it is unknown.
 *
 * `last_run_at` is the view's max(runs.updated_at), so on INSERT and UPDATE
 * it moves forward to `ev.new.updated_at` when that is later; a DELETE never
 * moves it back (the view would, but the event has no updated_at to compute
 * the new maximum from). The list keeps its order: the sidebar is sorted by
 * the server once and a live reorder would make projects jump under the
 * pointer. A project that is not in the list leaves it unchanged. The input
 * is never mutated.
 */
export function applyRunChangeToSummaries(
  current: ProjectSummary[],
  ev: RunChange,
  oldStatus: RunStatus | undefined,
): ProjectSummary[] {
  const projectId = ev.eventType === "DELETE" ? ev.old.project_id : ev.new.project_id;
  if (projectId === undefined) return current;
  if (!current.some((project) => project.id === projectId)) return current;

  return current.map((project) => {
    if (project.id !== projectId) return project;
    const next = { ...project };
    switch (ev.eventType) {
      case "INSERT":
        next[ev.new.status] += 1;
        break;
      case "UPDATE":
        if (oldStatus !== undefined) {
          next[oldStatus] = Math.max(0, next[oldStatus] - 1);
          next[ev.new.status] += 1;
        }
        break;
      case "DELETE":
        if (oldStatus !== undefined) next[oldStatus] = Math.max(0, next[oldStatus] - 1);
        break;
    }
    if (ev.eventType !== "DELETE") {
      // Parsed, not compared as strings: the view and the event may format the
      // same instant differently (fraction digits, "+00:00" against "Z").
      const updatedAt = ev.new.updated_at;
      if (next.last_run_at === null || Date.parse(updatedAt) > Date.parse(next.last_run_at)) {
        next.last_run_at = updatedAt;
      }
    }
    return next;
  });
}
