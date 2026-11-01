// The one place that decides whether an adw.queue_items row belongs in the
// Queue section. Pure and clock-free, so it is safe on the server, in the
// Realtime fold and in rendering alike.
import type { QueueItem } from "@/types/adw";

/**
 * The reason prefix the toolkit's runner writes when it parks an item that
 * cannot start yet because its dependency has not merged. The contract is
 * DEPENDENCY_HOLD_PREFIX in the toolkit's adws/adw_modules/queue_ops.py
 * (SBub/adw-toolkit#148, PR #150): such an item moves back to queued by itself
 * once the dependency merges. A held item without this prefix is a run the
 * merge gate held (a hold label) and belongs to Active or History.
 */
const DEPENDENCY_HOLD_PREFIX = "waiting on a dependency: ";

type HoldFields = Pick<QueueItem, "state" | "reason">;

/** Held until a dependency merges; the runner starts it on its own afterwards. */
export function isDependencyHeld(item: HoldFields): boolean {
  return item.state === "held" && item.reason?.startsWith(DEPENDENCY_HOLD_PREFIX) === true;
}

/** Every item the queue will still start on its own: queued, or held on a dependency. */
export function inQueueSection(item: HoldFields): boolean {
  return item.state === "queued" || isDependencyHeld(item);
}

/**
 * The reason after the prefix, trimmed, or null when the item is not held on a
 * dependency or nothing follows the prefix.
 */
export function dependencyHoldReason(item: HoldFields): string | null {
  if (!isDependencyHeld(item) || item.reason === null) return null;
  const rest = item.reason.slice(DEPENDENCY_HOLD_PREFIX.length).trim();
  return rest === "" ? null : rest;
}

/**
 * inQueueSection as a PostgREST `or` filter, built from the prefix. The value
 * is double-quoted because `:` and the space are reserved inside `or`; `*` is
 * PostgREST's `like` wildcard. The prefix holds no `%`, `_`, `"` or `,`, so it
 * needs no further escaping. queue-hold.test.ts pins the string.
 */
export const QUEUE_SECTION_FILTER = `state.eq.queued,and(state.eq.held,reason.like."${DEPENDENCY_HOLD_PREFIX}*")`;
