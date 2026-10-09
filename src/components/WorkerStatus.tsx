"use client";

import { useSyncExternalStore } from "react";
import { getWorkers } from "@/data";
import { STATUS_COLORS } from "@/lib/status-colors";
import { nextWorkerSnapshot, type WorkerSnapshot } from "@/lib/worker-state";
import { Timestamp } from "./Timestamp";

/**
 * The worker status widget at the bottom of the dashboard sidebar, and the
 * polling store it reads. It is rendered only by the (dashboard) layout.
 *
 * The store is a module-level variable, not React state, for the same reason
 * as ConnectionIndicator's: one writer (the poll below, outside React) and a
 * change must re-render this component and nothing else. adw.workers is not
 * in the Realtime publication, so the store polls getWorkers: once when the
 * first subscriber arrives, then every 30 s, and once more whenever the tab
 * becomes visible. The last unsubscribe stops it, and a response that lands
 * after that is dropped.
 *
 * This file holds the third and last clock read in the codebase: Date.now()
 * in poll(), in the browser, after the rows arrive, never in render or a hook
 * body. It feeds the pure nextWorkerSnapshot, which returns the previous
 * snapshot itself when nothing changed, so a poll that finds the same state
 * does not re-render.
 *
 * The server snapshot is the constant `unknown` state and reads no clock and
 * no data, so the static shell and hydration show "Worker status..." and the
 * client prerender is never aborted (a clock read in render would drop the
 * sidebar out of the static HTML under cacheComponents).
 */

const POLL_MS = 30_000;

const UNKNOWN: WorkerSnapshot = { state: "unknown" };

let snapshot: WorkerSnapshot = UNKNOWN;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
// Bumped on the last unsubscribe, so a poll started before it is dropped.
let generation = 0;
let inFlight = false;

async function poll() {
  if (inFlight) return;
  inFlight = true;
  const started = generation;
  try {
    const rows = await getWorkers();
    if (started !== generation) return;
    const next = nextWorkerSnapshot(snapshot, rows, Date.now());
    if (next !== snapshot) {
      snapshot = next;
      listeners.forEach((l) => l());
    }
  } catch (error) {
    // Keep the last snapshot: unknown stays unknown, a known state stays.
    console.warn("worker status: the adw.workers read failed", error);
  } finally {
    inFlight = false;
  }
}

function onVisibility() {
  if (document.visibilityState === "visible") void poll();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void poll();
    timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", onVisibility);
      generation += 1;
    }
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot(): WorkerSnapshot {
  return UNKNOWN;
}

export function WorkerStatus() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // No role="status": the connection pill is the one status element on the
  // dashboard routes, and the journeys key on that.
  return (
    <div aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {current.state === "online" && (
        <>
          <span
            className={`inline-flex size-2 shrink-0 rounded-full ${STATUS_COLORS.running.dot}`}
          />
          <span className={`font-medium ${STATUS_COLORS.running.text}`}>Worker online</span>
        </>
      )}
      {current.state === "offline" && (
        <>
          <span
            className={`inline-flex size-2 shrink-0 rounded-full border ${STATUS_COLORS.failed.border}`}
          />
          <span className={`font-medium ${STATUS_COLORS.failed.text}`}>Worker offline</span>
        </>
      )}
      {current.state === "unknown" ? (
        <>
          <span
            className={`inline-flex size-2 shrink-0 rounded-full border border-dashed ${STATUS_COLORS.neutral.border}`}
          />
          <span className="text-neutral-500 dark:text-neutral-400">Worker status...</span>
        </>
      ) : (
        <span className="text-neutral-500 dark:text-neutral-400">
          {current.lastBeat === null ? (
            "never seen"
          ) : (
            <>
              last beat <Timestamp value={current.lastBeat} />
            </>
          )}
        </span>
      )}
    </div>
  );
}
