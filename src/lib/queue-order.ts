// What the Queue section says about each item's place in line: the ledger
// order and the ordinal it gives each queued item. Pure and clock-free, so
// every function is safe to call during the prerender and unit-testable.
import type { QueueItem } from "@/types/adw";

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
