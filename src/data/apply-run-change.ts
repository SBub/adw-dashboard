// Folds one Realtime change event on the adw.runs table into the two cache
// entries it affects: the active runs of the project the run belongs to
// (applyRunChange) and the project list's counts (applyRunChangeToSummaries),
// and says whether the event changed the project's history (isHistoryChange),
// which is server-rendered and never in the cache. All three are pure: they
// never touch the cache, the client or the clock, they just return the next
// value, which is what makes them unit-testable without a socket. The
// realtime module hands their results to queryClient.setQueryData.
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { ProjectSummary, Run, RunStatus } from "@/types/adw";
import type { ActiveRuns } from "./index";

/** One change event on adw.runs, as the channel delivers it. */
export type RunChange = RealtimePostgresChangesPayload<Run>;

/** The two statuses the Active list holds; a failed run can be resumed, so it is still live. */
function isActive(status: RunStatus): boolean {
  return status === "running" || status === "failed";
}

/**
 * The status the cached active runs hold for `adwId`, or undefined when the
 * run is not among them (it is completed, or was never loaded). The realtime
 * module reads this BEFORE applying the change, so the counts reducer can be
 * told what status it is leaving: Supabase sends `old` with only the primary
 * key columns unless the table's replica identity is FULL, so an UPDATE or
 * DELETE event does not carry the previous status.
 */
export function runStatusIn(current: ActiveRuns | null | undefined, adwId: string) {
  if (!current) return undefined;
  return current.active.find((run) => run.adw_id === adwId)?.status;
}

function without(runs: Run[], adwId: string): Run[] {
  // Same array back when nothing was removed, so the untouched list keeps its
  // identity and React skips re-rendering its rows.
  const next = runs.filter((run) => run.adw_id !== adwId);
  return next.length === runs.length ? runs : next;
}

/**
 * Returns the project's active runs after applying `ev`:
 *
 * - INSERT prepends the row when its status is running or failed (the list is
 *   newest first) and ignores a completed row (that is history). If a run with
 *   that adw_id is already in the list the input is returned unchanged, so a
 *   replayed or duplicated event cannot create a second row.
 * - UPDATE replaces the row with the same adw_id in place while its status is
 *   running or failed (a failed run set back to running stays where it was),
 *   and REMOVES it when the new status is completed: the run has left the live
 *   set and belongs to the server-rendered history now (see isHistoryChange
 *   for what the caller does about that). A live run that is in the list of
 *   nobody is added as if inserted: the event carries the full row, and
 *   leaving it out would keep the pane behind the database for the session.
 * - DELETE removes the run whose adw_id is `ev.old.adw_id`. The runs primary
 *   key is (project_id, adw_id), so both are present in `old` under the
 *   default replica identity; nothing else is relied on.
 *
 * `fetched_at` is kept as is: it records when the rows were read, which a
 * change event does not alter (nothing in the UI reads it today, see
 * ActiveRuns in src/data/index.ts). The input is never mutated, and is
 * returned by identity when nothing changed.
 */
export function applyRunChange(current: ActiveRuns, ev: RunChange): ActiveRuns {
  switch (ev.eventType) {
    case "INSERT": {
      if (!isActive(ev.new.status)) return current;
      if (runStatusIn(current, ev.new.adw_id) !== undefined) return current;
      return { ...current, active: [ev.new, ...current.active] };
    }
    case "UPDATE": {
      const adwId = ev.new.adw_id;
      const previousIndex = current.active.findIndex((run) => run.adw_id === adwId);
      if (!isActive(ev.new.status)) {
        if (previousIndex === -1) return current;
        return { ...current, active: without(current.active, adwId) };
      }
      const active = [...current.active];
      if (previousIndex === -1) active.unshift(ev.new);
      else active[previousIndex] = ev.new;
      return { ...current, active };
    }
    case "DELETE": {
      const adwId = ev.old.adw_id;
      if (adwId === undefined) return current;
      if (runStatusIn(current, adwId) === undefined) return current;
      return { ...current, active: without(current.active, adwId) };
    }
  }
}

/**
 * Whether `ev` changed the project's completed runs, the half that is
 * server-rendered and not in the cache, so the caller knows to ask the server
 * to re-render it:
 *
 * - An INSERT or UPDATE whose new status is completed. The common case is a
 *   running run finishing; an update to an already completed row (its state
 *   or phase corrected) is a history change too, since the rendered row is
 *   stale either way.
 * - A DELETE of a run the active list did not hold (`previousStatus`
 *   undefined). Under the default replica identity the event does not say
 *   what the deleted run was, and a run that was not active was, as far as
 *   this browser can tell, completed: a revalidation is one cheap read, a
 *   history row that no longer exists is a lie. A DELETE of a live run only
 *   touches the active list.
 *
 * Takes the previous status explicitly, like applyRunChangeToSummaries, and
 * for the same reason: `ev.old` has only the primary key.
 */
export function isHistoryChange(ev: RunChange, previousStatus: RunStatus | undefined): boolean {
  if (ev.eventType === "DELETE") return previousStatus === undefined;
  return ev.new.status === "completed";
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
