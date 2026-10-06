// What the Queue section says about each item's place in line: the ledger
// order, the ordinal it gives each queued item, the wait so far and the head
// row's start hint. Pure: the wait label takes the current time as an
// argument and nothing here reads the clock, so every function is safe to call
// during the prerender and unit-testable with fixed timestamps.
import type { QueueItem, Run } from "@/types/adw";

const MINUTE = 60_000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Ledger order: position, then issue_number, so equal positions sort deterministically. */
export function byQueuePosition(a: QueueItem, b: QueueItem): number {
  return a.position - b.position || a.issue_number - b.issue_number;
}

/**
 * The 1-based ordinal of every queued item, keyed by issue_number. The
 * ordinal is the rank among the queued items in ledger order
 * (queue_items.position, the order the toolkit's runner takes them in, see
 * next_queued), not position + 1 (the ledger index also counts items that are
 * no longer queued) and not the array index. Not queued_at either: a retry
 * restamps it without moving the item, and a move reorders the ledger without
 * restamping. The input is never mutated.
 */
export function queuePositions(items: readonly QueueItem[]): Map<number, number> {
  return new Map(
    [...items].sort(byQueuePosition).map((item, index) => [item.issue_number, index + 1]),
  );
}

/**
 * How long an item has waited, from queued_at to `now` (milliseconds since
 * the epoch, passed in), at minute resolution: "waiting under 1 min",
 * "waiting 12 min", "waiting 2 h 05 min", "waiting 3 d 04 h". A negative span
 * (clock skew between the writer and the reader) is clamped to zero. Null for
 * an item with no queued_at or an unparseable one.
 */
export function waitLabel(queuedAt: string | null, now: number): string | null {
  if (queuedAt === null) return null;
  const since = Date.parse(queuedAt);
  if (Number.isNaN(since)) return null;

  const minutes = Math.floor(Math.max(0, now - since) / MINUTE);
  if (minutes < 1) return "waiting under 1 min";
  if (minutes < 60) return `waiting ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `waiting ${hours} h ${pad2(minutes % 60)} min`;
  return `waiting ${Math.floor(hours / 24)} d ${pad2(hours % 24)} h`;
}

/**
 * Whether a project's Active entry holds a running run. A failed run alone
 * does not count: it waits to be resumed and does not hold the runner. Null
 * (no entry, unknown project) is false.
 */
export function hasRunningRun(data: { active: readonly Run[] } | null): boolean {
  return data?.active.some((run) => run.status === "running") ?? false;
}

/** The head row's hint about when it starts. */
export function queueStartHint(hasRunning: boolean): string {
  return hasRunning ? "starts when the running run finishes" : "starts with the next runner";
}
