"use client";

import { useSyncExternalStore } from "react";

/**
 * The Realtime connection indicator in the dashboard sidebar, and the store it
 * reads. It is rendered only by the (dashboard) layout, beside Providers.
 *
 * The store is a module-level variable, not React state, on purpose. There is
 * exactly one writer (the realtime module's channel status callback, which
 * lives outside React) and potentially many readers, and a change must
 * re-render this component and nothing else. Putting it in a context or a
 * parent's useState would re-render the subtree that holds it, and would
 * force the realtime module to reach into the tree to write it.
 * useSyncExternalStore gives React a subscription to the variable instead.
 *
 * The server snapshot is a constant because the socket does not exist on the
 * server: there is nothing to read, and the SSR markup must match the first
 * client render byte for byte or React warns and re-renders. The browser
 * therefore always hydrates as "connecting" and moves to "live" or
 * "reconnecting" on the first setConnectionStatus call. The constant also
 * keeps this component out of the cacheComponents clock trap: it never reads
 * Date.now(), so it prerenders into the static shell instead of falling back.
 */

export enum ConnectionStatus {
  Connecting = "connecting",
  Live = "live",
  Reconnecting = "reconnecting",
}

let status: ConnectionStatus = ConnectionStatus.Connecting;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return status;
}

function getServerSnapshot(): ConnectionStatus {
  return ConnectionStatus.Connecting;
}

/**
 * The only way to change the connection status. The realtime module
 * (src/data/realtime.ts) calls this from the channel's status callback;
 * nothing else writes `status`.
 */
export function setConnectionStatus(next: ConnectionStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

const STYLES: Record<ConnectionStatus, { pill: string; dot: string; pulse: boolean }> = {
  [ConnectionStatus.Live]: {
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
    pulse: false,
  },
  [ConnectionStatus.Connecting]: {
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    dot: "bg-amber-500",
    pulse: true,
  },
  [ConnectionStatus.Reconnecting]: {
    pill: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    dot: "bg-red-500",
    pulse: false,
  },
};

export function ConnectionIndicator() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const style = STYLES[current];

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.pill}`}
    >
      <span className="relative flex size-2">
        {style.pulse && (
          <span
            className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${style.dot}`}
          />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${style.dot}`} />
      </span>
      {current}
    </span>
  );
}
