// How an item got into the queue, parsed from queue_items.source as stored:
// "manual" (added by hand with adw_queue.py add) or "label:<name>" (picked up
// from an issue label). The one parse of that column; pure, no clock.

export type QueueSource = { kind: "label"; name: string } | { kind: "manual" };

const LABEL_PREFIX = "label:";

/**
 * The source of a queue item, or null when it is unknown (items queued before
 * the ledger stored it have none) or not one of the two forms. A label name is
 * everything after the first colon, so a label that contains a colon keeps it.
 */
export function queueSource(source: string | null): QueueSource | null {
  if (source === "manual") return { kind: "manual" };
  if (source?.startsWith(LABEL_PREFIX)) {
    const name = source.slice(LABEL_PREFIX.length);
    return name === "" ? null : { kind: "label", name };
  }
  return null;
}
