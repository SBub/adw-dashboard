// Derives the labels the runs page shows from a database row and a moment in
// time. Pure: no clock, no cache, no IO; the caller passes `now` in. That is
// what lets the same function serve the server render (with the cached
// fetched_at), the hydration render (same value, so the markup matches) and
// every tick of the browser clock afterwards, and what makes it unit-testable
// with fixed timestamps.
import type { Run, RunView } from "@/types/adw";

/** A running run that has not reported progress for this long is marked stale. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Wall-clock duration as "47m 26s" under an hour and "1h 03m" from an hour
 * up (hours are not capped, so a two-day run reads "49h 12m"). A negative
 * span (clock skew between the writer and the reader) is clamped to zero.
 */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${pad2(minutes)}m`;
  return `${minutes}m ${pad2(seconds)}s`;
}

/**
 * Relative time since a moment: "just now" under 30 seconds, then "1m ago"
 * through "59m ago", "1h ago" through "23h ago", then "Nd ago". A moment in
 * the future (clock skew) reads "just now".
 */
function formatSince(ms: number): string {
  if (ms < 30 * SECOND) return "just now";
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MINUTE))}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  return `${Math.floor(ms / DAY)}d ago`;
}

/**
 * The view model for one run at the moment `now` (epoch milliseconds).
 *
 * - is_stale: the run is still running and its updated_at is more than
 *   STALE_AFTER_MS before `now`. Finished runs are never stale.
 * - duration_label: started_at to finished_at for a finished run, started_at
 *   to `now` for a running one.
 * - since_update_label: `now` relative to updated_at.
 */
export function toRunView(run: Run, now: number): RunView {
  const updatedAt = Date.parse(run.updated_at);
  const startedAt = Date.parse(run.started_at);
  const endedAt = run.finished_at === null ? now : Date.parse(run.finished_at);
  const sinceUpdate = now - updatedAt;

  return {
    ...run,
    is_stale: run.status === "running" && sinceUpdate > STALE_AFTER_MS,
    duration_label: formatDuration(endedAt - startedAt),
    since_update_label: formatSince(sinceUpdate),
  };
}
