// Folds one Realtime change event on the adw.runs table into the two cache
// entries it affects: the one Active entry, every visible project's running
// runs and failed runs from the last 7 days (applyRunChange), and the project
// list's completed count and last_run_at (applyRunChangeToSummaries),
// and says whether the event changed the project's history (isHistoryChange),
// which is server-rendered and never in the cache. It also merges the
// incremental catch-up read into the Active entry (applyChangedRuns). All are pure: they
// never touch the cache, the client or the clock, they just return the next
// value, which is what makes them unit-testable without a socket. The
// realtime module hands their results to queryClient.setQueryData.
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { ProjectSummary, Run, RunStatus } from "@/types/adw";
import { isInActiveWindow } from "@/lib/active-runs";
import type { ActiveRuns, ChangedRuns } from "./index";

/** One change event on adw.runs, as the channel delivers it. */
export type RunChange = RealtimePostgresChangesPayload<Run>;

/**
 * The two statuses the Active list holds; a failed run can be resumed, so it
 * is still live. No window check here: the event path reads no clock, and an
 * UPDATE stamps updated_at through the database trigger, so a failed event is
 * always fresh. The next catch-up prunes failed runs older than the window
 * (applyChangedRuns).
 */
function isActive(status: RunStatus): boolean {
  return status === "running" || status === "failed";
}

/**
 * Whether `run` is the run with this primary key. adw_id is only unique within
 * a project, so the entry, which holds every project's runs, is always
 * matched on both columns.
 */
function isRun(run: Run, projectId: string, adwId: string): boolean {
  return run.project_id === projectId && run.adw_id === adwId;
}

/**
 * The status the cached active runs hold for the run (`projectId`, `adwId`),
 * or undefined when the run is not among them (it is completed, or the entry
 * is not loaded). The realtime module reads this BEFORE applying the change,
 * so the counts reducer and isHistoryChange can be told what status it is
 * leaving: Supabase sends `old` with only the primary key columns unless the
 * table's replica identity is FULL, so an UPDATE or DELETE event does not
 * carry the previous status.
 */
export function runStatusIn(
  current: ActiveRuns | null | undefined,
  projectId: string,
  adwId: string,
) {
  if (!current) return undefined;
  return current.active.find((run) => isRun(run, projectId, adwId))?.status;
}

/**
 * Exactly the fields of Run, copied from a row. A Realtime event carries the
 * whole row (including the state jsonb the dashboard does not read); only the
 * screen fields enter the cache.
 */
function toRun(row: Run): Run {
  return {
    project_id: row.project_id,
    adw_id: row.adw_id,
    issue_number: row.issue_number,
    issue_title: row.issue_title,
    issue_class: row.issue_class,
    branch_name: row.branch_name,
    pr_number: row.pr_number,
    phase: row.phase,
    status: row.status,
    toolkit_version: row.toolkit_version,
    started_at: row.started_at,
    updated_at: row.updated_at,
    finished_at: row.finished_at,
  };
}

function without(runs: Run[], projectId: string, adwId: string): Run[] {
  // Same array back when nothing was removed, so the untouched list keeps its
  // identity and React skips re-rendering its rows.
  const next = runs.filter((run) => !isRun(run, projectId, adwId));
  return next.length === runs.length ? runs : next;
}

/**
 * Returns the active runs of every project after applying `ev`. A run is
 * matched on its primary key, (project_id, adw_id), never on adw_id alone:
 *
 * - INSERT prepends the row when its status is running or failed (the list is
 *   newest first) and ignores a completed row (that is history). If the run is
 *   already in the list the input is returned unchanged, so a replayed or
 *   duplicated event cannot create a second row.
 * - UPDATE replaces the row with the same key in place while its status is
 *   running or failed (a failed run set back to running stays where it was),
 *   and REMOVES it when the new status is completed: the run has left the live
 *   set and belongs to the server-rendered history now (see isHistoryChange
 *   for what the caller does about that). A live run that is in the list of
 *   nobody is added as if inserted: the event carries the full row, and
 *   leaving it out would keep the pane behind the database for the session.
 * - DELETE removes the run keyed by `ev.old.project_id` and `ev.old.adw_id`.
 *   That is the runs primary key, so both are present in `old` under the
 *   default replica identity; nothing else is relied on.
 *
 * Only the fields of Run are stored (toRun), never the state jsonb the event
 * carries.
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
      if (runStatusIn(current, ev.new.project_id, ev.new.adw_id) !== undefined) return current;
      return { ...current, active: [toRun(ev.new), ...current.active] };
    }
    case "UPDATE": {
      const { project_id: projectId, adw_id: adwId } = ev.new;
      const previousIndex = current.active.findIndex((run) => isRun(run, projectId, adwId));
      if (!isActive(ev.new.status)) {
        if (previousIndex === -1) return current;
        return { ...current, active: without(current.active, projectId, adwId) };
      }
      const active = [...current.active];
      const row = toRun(ev.new);
      if (previousIndex === -1) active.unshift(row);
      else active[previousIndex] = row;
      return { ...current, active };
    }
    case "DELETE": {
      const { project_id: projectId, adw_id: adwId } = ev.old;
      if (projectId === undefined || adwId === undefined) return current;
      if (runStatusIn(current, projectId, adwId) === undefined) return current;
      return { ...current, active: without(current.active, projectId, adwId) };
    }
  }
}

/**
 * Returns the active runs after merging the incremental catch-up read (every
 * run changed since the cursor, any status; getChangedRuns in src/data/index.ts):
 *
 * - Every failed run already in the entry whose updated_at fell out of the
 *   window (`read.failed_since`) is pruned, changed or not.
 * - A changed row that is in the window (running, or failed since the cutoff)
 *   replaces the row with the same key in place, or, when the entry does not
 *   hold it, is prepended; the new rows keep the read's order (newest first),
 *   like applyRunChange's INSERT.
 * - A changed row that is out of the window (completed, cancelled, any other
 *   non-live status, or a failure older than the window) removes the row with
 *   that key. This is why the read takes any status: a run that completed
 *   while the socket was down is only seen by reading it.
 *
 * A row the entry already holds (the overlap re-reads the last minute) just
 * replaces itself, so no row is ever duplicated. A run deleted while the
 * socket was down cannot be seen here and stays until the next full read.
 * `fetched_at` comes from the read. The input is never mutated.
 */
export function applyChangedRuns(current: ActiveRuns, read: ChangedRuns): ActiveRuns {
  const active = current.active.filter(
    (run) => run.status !== "failed" || isInActiveWindow(run, read.failed_since),
  );
  const added: Run[] = [];
  for (const changed of read.changed) {
    const { project_id: projectId, adw_id: adwId } = changed;
    const index = active.findIndex((run) => isRun(run, projectId, adwId));
    if (!isInActiveWindow(changed, read.failed_since)) {
      if (index !== -1) active.splice(index, 1);
      continue;
    }
    const row = toRun(changed);
    if (index !== -1) {
      active[index] = row;
      continue;
    }
    const addedIndex = added.findIndex((run) => isRun(run, projectId, adwId));
    if (addedIndex === -1) added.push(row);
  }
  return { active: [...added, ...active], fetched_at: read.fetched_at };
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
 * completed count and last_run_at adjusted. The running and failed counts are
 * never touched here: the sidebar counts them from the Active entry
 * (activeRunCounts in src/lib/active-runs.ts), so they cannot disagree with
 * the rows. The view's own running and failed columns are left as read.
 *
 * The completed count comes from the adw.project_summaries view, which the
 * projects listener never sees change (a run event does not touch
 * adw.projects), so it is maintained here:
 *
 * - INSERT: +1 when the new row is completed.
 * - UPDATE: +1 when the new status is completed and `oldStatus` is running or
 *   failed (the run was in the Active entry, so this is the moment it
 *   completed). When `oldStatus` is unknown the run was not active, so it was
 *   already completed (a correction to a history row) or the entry is not
 *   loaded; guessing +1 would inflate the count on every such update. The next
 *   catch-up (see realtime.ts) or page load corrects it.
 * - DELETE: no change. The event does not say whether the deleted run was
 *   completed (`old` holds the primary key only, and a completed run is never
 *   in the Active entry).
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
  if (ev.eventType === "DELETE") return current;
  const projectId = ev.new.project_id;
  if (!current.some((project) => project.id === projectId)) return current;

  const completes =
    ev.new.status === "completed" &&
    (ev.eventType === "INSERT" || (oldStatus !== undefined && isActive(oldStatus)));

  return current.map((project) => {
    if (project.id !== projectId) return project;
    const next = { ...project };
    if (completes) next.completed += 1;
    // Parsed, not compared as strings: the view and the event may format the
    // same instant differently (fraction digits, "+00:00" against "Z").
    const updatedAt = ev.new.updated_at;
    if (next.last_run_at === null || Date.parse(updatedAt) > Date.parse(next.last_run_at)) {
      next.last_run_at = updatedAt;
    }
    return next;
  });
}
