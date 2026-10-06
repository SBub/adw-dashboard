// Folds one Realtime change event on the adw.queue_items table into the two
// cache entries it affects: the queued items of the project the item belongs
// to (applyQueueChange) and the project list's queued count
// (applyQueueChangeToSummaries). Both are pure: they never touch the cache,
// the client or the clock, they just return the next value, which is what
// makes them unit-testable without a socket. The realtime module hands their
// results to queryClient.setQueryData.
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { byQueuePosition } from "@/lib/queue-order";
import type { ProjectSummary, QueueItem } from "@/types/adw";

/** One change event on adw.queue_items, as the channel delivers it. */
export type QueueChange = RealtimePostgresChangesPayload<QueueItem>;

/**
 * Whether the cached queue holds `issueNumber`, or undefined when the queue is
 * not cached at all. The realtime module reads this BEFORE applying the
 * change, so the counts reducer can be told whether the item was queued:
 * Supabase sends `old` with only the primary key columns (project_id,
 * issue_number) under the default replica identity, so an UPDATE or DELETE
 * event does not carry the previous state.
 */
export function queuedIn(current: QueueItem[] | undefined, issueNumber: number) {
  if (!current) return undefined;
  return current.some((item) => item.issue_number === issueNumber);
}

function without(items: QueueItem[], issueNumber: number): QueueItem[] {
  // Same array back when nothing was removed, so the untouched list keeps its
  // identity and React skips re-rendering its rows.
  const next = items.filter((item) => item.issue_number !== issueNumber);
  return next.length === items.length ? items : next;
}

/**
 * Returns the project's queued items after applying `ev`:
 *
 * - INSERT adds the row in position order when its state is queued and
 *   ignores any other state (that is a run, shown in Active or History). An
 *   item already in the list returns the input unchanged, so a replayed event
 *   cannot create a second row.
 * - UPDATE replaces the item with the same issue_number while its state is
 *   queued, or adds it when absent (the event carries the full row), and
 *   re-sorts, since a move changes positions. Any other state REMOVES it: the
 *   item has started, or was stopped, and has left the queue.
 * - DELETE removes the item whose issue_number is `ev.old.issue_number` (the
 *   item left the ledger). The primary key is (project_id, issue_number), so
 *   both are present in `old`; nothing else is relied on.
 *
 * The input is never mutated, and is returned by identity when nothing changed.
 */
export function applyQueueChange(current: QueueItem[], ev: QueueChange): QueueItem[] {
  switch (ev.eventType) {
    case "INSERT": {
      if (ev.new.state !== "queued") return current;
      if (queuedIn(current, ev.new.issue_number)) return current;
      return [...current, ev.new].sort(byQueuePosition);
    }
    case "UPDATE": {
      const issueNumber = ev.new.issue_number;
      if (ev.new.state !== "queued") return without(current, issueNumber);
      return [...current.filter((item) => item.issue_number !== issueNumber), ev.new].sort(
        byQueuePosition,
      );
    }
    case "DELETE": {
      const issueNumber = ev.old.issue_number;
      if (issueNumber === undefined) return current;
      return without(current, issueNumber);
    }
  }
}

/**
 * Returns the project list after a queue event, with the matching project's
 * queued count moved by `(queued now) - (queued before)`. The count comes from
 * the adw.project_summaries view, which the projects listener never sees
 * change, so it is maintained here:
 *
 * - INSERT: queued now if the new state is queued; an inserted row was not
 *   queued before, so an undefined `wasQueued` counts as false.
 * - UPDATE: the toolkit upserts every item on every ledger save, so an item
 *   starting (queued to running) or being re-queued arrives as an UPDATE, and
 *   so does the unchanged upsert (queued to queued, delta 0). When
 *   `wasQueued` is unknown (the project's queue is not cached) the count is
 *   left alone: a delta cannot be computed, and the next catch-up or page load
 *   corrects it.
 * - DELETE: -1 when the item was queued, no change when unknown.
 *
 * Never below 0, touches no other count and never last_run_at. The list keeps
 * its order and identity when the delta is 0 or the project is not in it. The
 * input is never mutated.
 */
export function applyQueueChangeToSummaries(
  current: ProjectSummary[],
  ev: QueueChange,
  wasQueued: boolean | undefined,
): ProjectSummary[] {
  const projectId = ev.eventType === "DELETE" ? ev.old.project_id : ev.new.project_id;
  if (projectId === undefined) return current;
  if (!current.some((project) => project.id === projectId)) return current;

  const before = ev.eventType === "INSERT" ? (wasQueued ?? false) : wasQueued;
  if (before === undefined) return current;
  const now = ev.eventType !== "DELETE" && ev.new.state === "queued";
  const delta = Number(now) - Number(before);
  if (delta === 0) return current;

  return current.map((project) =>
    project.id === projectId
      ? { ...project, queued: Math.max(0, project.queued + delta) }
      : project,
  );
}
