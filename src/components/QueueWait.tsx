"use client";

import { useNow } from "@/hooks/use-now";
import { waitLabel } from "@/lib/queue-order";

/**
 * How long a queued item has waited so far. The one leaf that depends on the
 * time: it reads it through useNow, so a tick re-renders only this span, and
 * it renders nothing until the browser has mounted it. The wait is absent from
 * the static HTML by design.
 */
export function QueueWait({ queuedAt }: { queuedAt: string | null }) {
  const now = useNow();
  const label = now === null ? null : waitLabel(queuedAt, now);
  return label === null ? null : <span className="tabular-nums">{label}</span>;
}
