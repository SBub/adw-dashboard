// Formats what two stored timestamps of a run can say without a clock. Pure:
// no Date.now(), no cache, no IO, so it is safe to call during the prerender
// (cacheComponents treats a clock read as IO and aborts the client prerender
// on the first one) and unit-testable with fixed timestamps. Labels that need
// the current time ("updated 2m ago", the stale badge, the elapsed time of a
// running run) are deliberately absent for now; issue #3 tracks them.

const SECOND = 1000;

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
 * The duration of a finished run, started_at to finished_at, or null while
 * finished_at is null: a running run's elapsed time would need the current
 * time, and nothing here reads it.
 */
export function durationLabel(startedAt: string, finishedAt: string | null): string | null {
  if (finishedAt === null) return null;
  return formatDuration(Date.parse(finishedAt) - Date.parse(startedAt));
}

/**
 * A duration given in seconds (the summary view's median_duration_s) in the
 * same format as durationLabel, or null for null.
 */
export function secondsLabel(seconds: number | null): string | null {
  if (seconds === null) return null;
  return formatDuration(seconds * SECOND);
}
