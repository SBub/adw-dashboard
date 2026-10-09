// Whether the ADW queue worker is alive, decided from its adw.workers
// heartbeat rows. Pure: the current time comes in as `nowMs`, never read here,
// the same discipline as durationLabel in run-view.ts. The one clock read is
// the worker store's poll callback in src/components/WorkerStatus.tsx.
import type { Worker } from "@/types/adw";

/** Three missed 30 s beats: a heartbeat at least this old means the worker is gone. */
export const WORKER_STALE_MS = 90_000;

/**
 * What the worker widget shows: `unknown` before the first successful read
 * (and on the server), otherwise online or offline with the freshest
 * heartbeat as stored, or null when there are no rows at all.
 */
export type WorkerSnapshot =
  { state: "unknown" } | { state: "online" | "offline"; lastBeat: string | null };

/**
 * Online when the freshest heartbeat across all rows is strictly under
 * WORKER_STALE_MS old at `nowMs`, offline otherwise. Stale rows only lose the
 * max, so a leftover row never counts as a second worker.
 */
export function workerState(
  rows: readonly Pick<Worker, "heartbeat_at">[],
  nowMs: number,
): Exclude<WorkerSnapshot, { state: "unknown" }> {
  let freshest: { beat: string; ms: number } | null = null;
  for (const row of rows) {
    const ms = Date.parse(row.heartbeat_at);
    if (freshest === null || ms > freshest.ms) freshest = { beat: row.heartbeat_at, ms };
  }
  if (freshest === null) return { state: "offline", lastBeat: null };
  return {
    state: nowMs - freshest.ms < WORKER_STALE_MS ? "online" : "offline",
    lastBeat: freshest.beat,
  };
}

/**
 * The store's next snapshot: `prev` itself when the state and the last beat
 * did not change, so useSyncExternalStore sees a stable reference between
 * polls and does not re-render; a new object otherwise.
 */
export function nextWorkerSnapshot(
  prev: WorkerSnapshot,
  rows: readonly Pick<Worker, "heartbeat_at">[],
  nowMs: number,
): WorkerSnapshot {
  const next = workerState(rows, nowMs);
  if (prev.state === next.state && "lastBeat" in prev && prev.lastBeat === next.lastBeat) {
    return prev;
  }
  return next;
}
