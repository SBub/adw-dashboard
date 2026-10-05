// Everything that shapes the /summary page, pure: the two search parameters,
// the window, the report assembled from adw.daily_summary rows, the class bar's
// segments and the number labels. No clock, no cache, no IO, so every case is
// unit-tested with fixed inputs (src/lib/daily-summary.test.ts). The data
// boundary (getDailySummary in src/data/index.ts) reads the rows and calls
// toSummaryReport; the components only call the label helpers.
import { isProjectSlug } from "@/lib/slug";
import type {
  DailySummary,
  SummaryDay,
  SummaryProject,
  SummaryProjectDay,
  SummaryReport,
} from "@/types/adw";

/** The window when `?days` is absent or invalid. */
export const SUMMARY_DEFAULT_DAYS = 30;

/** The widest window `?days` can ask for. */
export const SUMMARY_MAX_DAYS = 90;

/** The windows the filter form offers. */
export const SUMMARY_DAY_OPTIONS = [7, 30, 90] as const;

// Static (not built from input), so the lint rule against non-literal regexps
// is satisfied. Three digits at most: anything longer clamps to the maximum
// anyway, and a short pattern cannot be made expensive by a caller.
const DAYS = /^\d{1,3}$/;

const DAY_MS = 86_400_000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The window in days from `?days`: decimal digits only, clamped to
 * [1, SUMMARY_MAX_DAYS]. Anything else (absent, repeated, empty, signed,
 * fractional, not a number) is SUMMARY_DEFAULT_DAYS. Never throws.
 */
export function readSummaryDays(raw: string | string[] | undefined): number {
  if (typeof raw !== "string" || !DAYS.test(raw)) return SUMMARY_DEFAULT_DAYS;
  return Math.min(SUMMARY_MAX_DAYS, Math.max(1, Number.parseInt(raw, 10)));
}

/**
 * The project filter from `?project`: the slug when it is one (isProjectSlug),
 * otherwise null, which is all projects (absent, the form's empty "All
 * projects" value, repeated, malformed). Never throws.
 */
export function readSummaryProject(raw: string | string[] | undefined): string | null {
  return isProjectSlug(raw) ? raw : null;
}

/**
 * The first day (`YYYY-MM-DD`) of a window of `days` days ending on `anchor`
 * (also `YYYY-MM-DD`), both included. A date-only string parses as UTC
 * midnight, and whole UTC days carry no daylight saving shift, so month, year
 * and leap-day boundaries are the calendar's. No clock is read.
 */
export function summaryWindowStart(anchor: string, days: number): string {
  const date = new Date(Date.parse(anchor) - (days - 1) * DAY_MS);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Adds one numeric field across a day's project rows. */
function sum(rows: readonly SummaryProjectDay[], pick: (row: SummaryProjectDay) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

/** Counts and sums added across a day's projects; a median only when there is one project. */
function dayTotals(day: string, rows: readonly SummaryProjectDay[]): SummaryDay["totals"] {
  const only = rows.length === 1 ? rows[0] : null;
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
    median_duration_s: only?.median_duration_s ?? null,
    tokens_in_sum: sum(rows, (row) => row.tokens_in_sum),
    tokens_in_median: only?.tokens_in_median ?? null,
    tokens_out_sum: sum(rows, (row) => row.tokens_out_sum),
    tokens_out_median: only?.tokens_out_median ?? null,
    cost_usd_sum: Math.round(sum(rows, (row) => row.cost_usd_sum) * 1e4) / 1e4,
    cost_usd_median: only?.cost_usd_median ?? null,
  };
}

/**
 * The page model from the view's rows and the visible projects. Rows are
 * grouped by day, newest first; each day's projects are named by project_id
 * (a row whose project is not in `projects` is dropped: RLS hides it) and
 * ordered by runs, then slug. A day's totals add every count and sum (cost
 * rounded to 4 decimals against float noise); a median is kept only when the
 * day has exactly one project, because a median cannot be combined from
 * per-project medians. Never mutates its inputs.
 */
export function toSummaryReport(
  rows: readonly DailySummary[],
  projects: readonly (SummaryProject & { id: string })[],
  options: { days: number; project: SummaryProject | null; from: string | null; to: string | null },
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
    project: options.project,
    projects: projects.map(({ slug, display_name }) => ({ slug, display_name })),
    rows: days.map((day) => {
      const list = (byDay.get(day) ?? []).sort(
        (a, b) => b.runs - a.runs || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
      );
      return { day, totals: dayTotals(day, list), projects: list };
    }),
  };
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

/**
 * The /summary URL for a window and a project filter, the default window and
 * "all projects" left out of the query string.
 */
export function summaryHref(days: number, project: string | null): string {
  const params = new URLSearchParams();
  if (days !== SUMMARY_DEFAULT_DAYS) params.set("days", String(days));
  if (project !== null) params.set("project", project);
  const query = params.toString();
  return query ? `/summary?${query}` : "/summary";
}
