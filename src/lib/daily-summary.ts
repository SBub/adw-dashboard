// Everything that shapes the summary page (`/`), pure: today's UTC day from a
// time the caller read, the past window that ends the day before it, the
// report and the today card assembled from adw.daily_summary rows, the class
// bar's segments and the number labels. No clock, no cache, no IO, so every
// case is unit-tested with fixed inputs (src/lib/daily-summary.test.ts). The
// data boundary (getSummaryPast and getSummaryToday in src/data/index.ts)
// reads the rows and calls toSummaryReport or toSummaryDay; the components
// only call the label helpers.
import type {
  DailySummary,
  SummaryDay,
  SummaryProject,
  SummaryProjectDay,
  SummaryReport,
} from "@/types/adw";

/** The window in days the summary page always shows. */
export const SUMMARY_DEFAULT_DAYS = 30;

const DAY_MS = 86_400_000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The UTC calendar day (`YYYY-MM-DD`) of an epoch in milliseconds. Pure: the
 * caller passes the time. It is the one place the summary page's request-time
 * clock read (SummaryContent in src/app/page.tsx) becomes a day, so the past
 * days and the today card split on the same UTC midnight.
 */
export function utcDay(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * The first day (`YYYY-MM-DD`) of a window of `days` days ending on `anchor`
 * (also `YYYY-MM-DD`), both included. A date-only string parses as UTC
 * midnight, and whole UTC days carry no daylight saving shift, so month, year
 * and leap-day boundaries are the calendar's. No clock is read.
 */
export function summaryWindowStart(anchor: string, days: number): string {
  return utcDay(Date.parse(anchor) - (days - 1) * DAY_MS);
}

/**
 * The `days` days strictly before `today` (`YYYY-MM-DD`): `to` is the day
 * before today, `from` is `days` days before it, both included. Today is
 * never inside it; the today card shows it. The data layer's read mirrors it
 * with `day >= from and day < today`.
 */
export function pastDaysWindow(today: string, days: number): { from: string; to: string } {
  return { from: summaryWindowStart(today, days + 1), to: summaryWindowStart(today, 2) };
}

/** Adds one numeric field across a day's project rows. */
function sum(rows: readonly SummaryProjectDay[], pick: (row: SummaryProjectDay) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

/** Every count and every sum added across a day's projects. */
function dayTotals(day: string, rows: readonly SummaryProjectDay[]): SummaryDay["totals"] {
  return {
    day,
    runs: sum(rows, (row) => row.runs),
    completed: sum(rows, (row) => row.completed),
    failed: sum(rows, (row) => row.failed),
    halted: sum(rows, (row) => row.halted),
    features: sum(rows, (row) => row.features),
    bugs: sum(rows, (row) => row.bugs),
    chores: sum(rows, (row) => row.chores),
    patches: sum(rows, (row) => row.patches),
    duration_sum_s: sum(rows, (row) => row.duration_sum_s),
    tokens_in_sum: sum(rows, (row) => row.tokens_in_sum),
    tokens_cache_read_sum: sum(rows, (row) => row.tokens_cache_read_sum),
    tokens_out_sum: sum(rows, (row) => row.tokens_out_sum),
    cost_usd_sum: Math.round(sum(rows, (row) => row.cost_usd_sum) * 1e4) / 1e4,
  };
}

/**
 * The page model from the view's rows and the visible projects. Rows are
 * grouped by day, newest first; each day's projects are named by project_id
 * (a row whose project is not in `projects` is dropped: RLS hides it) and
 * ordered by runs, then slug. A day's totals add every count and sum (cost
 * rounded to 4 decimals against float noise). Never mutates its inputs.
 */
export function toSummaryReport(
  rows: readonly DailySummary[],
  projects: readonly (SummaryProject & { id: string })[],
  options: { days: number; from: string | null; to: string | null },
): SummaryReport {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const byDay = new Map<string, SummaryProjectDay[]>();
  for (const row of rows) {
    const project = byId.get(row.project_id);
    if (!project) continue;
    const named = { ...row, slug: project.slug, display_name: project.display_name };
    const list = byDay.get(row.day);
    if (list) list.push(named);
    else byDay.set(row.day, [named]);
  }
  const days = [...byDay.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return {
    from: options.from,
    to: options.to,
    days: options.days,
    rows: days.map((day) => {
      const list = (byDay.get(day) ?? []).sort(
        (a, b) => b.runs - a.runs || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
      );
      return { day, totals: dayTotals(day, list), projects: list };
    }),
  };
}

/**
 * One day's SummaryDay from the view's rows, assembled by toSummaryReport (so
 * the same naming, hidden-project drop, ordering and totals), or null when no
 * visible project finished a run that day. Rows of other days are ignored.
 * The today card's server prefetch and its browser refetch both return this,
 * so the two cannot drift. Never mutates its inputs.
 */
export function toSummaryDay(
  rows: readonly DailySummary[],
  projects: readonly (SummaryProject & { id: string })[],
  day: string,
): SummaryDay | null {
  const report = toSummaryReport(
    rows.filter((row) => row.day === day),
    projects,
    { days: 1, from: day, to: day },
  );
  return report.rows[0] ?? null;
}

export type ClassKey = "/feature" | "/bug" | "/chore" | "/patch" | "other";

export interface ClassSegment {
  key: ClassKey;
  count: number;
  /** Start of the segment, in percent of the bar. */
  offset: number;
  /** Width of the segment, in percent of the bar. */
  width: number;
}

/**
 * The stacked class bar's segments in a fixed order (/feature, /bug, /chore,
 * /patch, other), zero counts omitted, offsets and widths in percent. "other"
 * is the runs with no known class. The last segment ends at exactly 100. No
 * runs is no segment.
 */
export function classSegments(
  day: Pick<DailySummary, "runs" | "features" | "bugs" | "chores" | "patches">,
): ClassSegment[] {
  const known = day.features + day.bugs + day.chores + day.patches;
  const counts: [ClassKey, number][] = [
    ["/feature", day.features],
    ["/bug", day.bugs],
    ["/chore", day.chores],
    ["/patch", day.patches],
    ["other", Math.max(0, day.runs - known)],
  ];
  const present = counts.filter(([, count]) => count > 0);
  const total = present.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return [];
  let offset = 0;
  return present.map(([key, count], i) => {
    const width = i === present.length - 1 ? 100 - offset : (count / total) * 100;
    const segment = { key, count, offset, width };
    offset += width;
    return segment;
  });
}

const TOKEN_UNITS = ["k", "M", "B"] as const;

/**
 * A token count: the integer under 1,000, then one decimal with k, M or B
 * ("12.3k", "4.6M"), rounded half up, moving to the next unit when rounding
 * reaches 1,000. "n/a" for null. No Intl, no toLocaleString.
 */
export function tokensLabel(n: number | null): string {
  if (n === null) return "n/a";
  if (n < 1000) return String(Math.round(n));
  let value = n;
  for (const unit of TOKEN_UNITS) {
    value /= 1000;
    const rounded = Math.round(value * 10) / 10;
    if (rounded < 1000 || unit === "B") return `${rounded.toFixed(1)}${unit}`;
  }
  return String(n);
}

/** A cost in US dollars with two decimals, "<$0.01" under a cent, "n/a" for null. */
export function costLabel(usd: number | null): string {
  if (usd === null) return "n/a";
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${(Math.round(usd * 100) / 100).toFixed(2)}`;
}
