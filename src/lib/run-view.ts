// Formats what two stored timestamps of a run can say without a clock. Pure:
// no Date.now(), no cache, no IO, so it is safe to call during the prerender
// (cacheComponents treats a clock read as IO and aborts the client prerender
// on the first one) and unit-testable with fixed timestamps. Labels that need
// the current time ("updated 2m ago", the stale badge, the elapsed time of a
// running run) are deliberately absent for now; issue #3 tracks them.

import type { RunMetrics } from "@/types/adw";

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
 * A duration given in seconds (the summary view's duration_sum_s) in the
 * same format as durationLabel.
 */
export function secondsLabel(seconds: number): string {
  return formatDuration(seconds * SECOND);
}

/**
 * A cost in US dollars with two decimals, "<$0.01" under a cent. No thousands
 * separator (no Intl, no toLocaleString), so it reads the same in every
 * locale. Shared by the summary's charts and table and the History card.
 */
export function costLabel(usd: number): string {
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${(Math.round(usd * 100) / 100).toFixed(2)}`;
}

/**
 * The History page's cost per run, keyed by adw_id. A run with no metrics row
 * has no key, so its card shows no Cost field (never "$0.00").
 */
export function runCosts(rows: readonly RunMetrics[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.adw_id, row.cost_usd]));
}

/**
 * The GitHub tree URL of a run's branch in "owner/repo". Each path segment is
 * percent-encoded on its own, so the branch's slashes stay path separators
 * while a "#" or "?" in a segment is escaped instead of cutting the URL.
 */
export function branchTreeHref(projectSlug: string, branch: string): string {
  const path = branch.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${projectSlug}/tree/${path}`;
}
