// The single boundary between the screens and wherever the data comes from.
// The pages and components only ever import from "@/data", so wiring a data
// source is a change to this file alone. Every read is live: the project list
// comes from the adw.project_summaries view, the runs from the adw.runs table
// and a project's queue from the adw.queue_items table, through the one
// Supabase client.
//
// The runs are read in two halves with two different lifetimes:
//
// - Active (status running or failed; a failed run can be resumed, so it is
//   still live) is one React Query entry for every project, read per request
//   on the server, hydrated, and patched in the browser by the Realtime
//   listener; each screen narrows it to what it shows. getActiveRuns.
// - History (status completed) is immutable. It is read one keyset page at a
//   time and rendered on the server inside a "use cache" scope; every page of
//   a project shares the one per-project tag, never enters the query cache,
//   and a completion in the browser asks the server to drop that tag and
//   re-render. getCompletedRuns.
//
// The summary page (`/`) reads the adw.daily_summary view (finished runs per
// project per UTC day) in two halves split on today's UTC date, which the page
// passes in: getSummaryPast (the days before today, server only, from the
// page's long-lived "use cache" scope, never in the query cache) and
// getSummaryToday (today only, prefetched by a short-lived scope and refetched
// in the browser as the today card's queryFn). Each half also reads the
// adw.daily_model_summary view (usage per project, model and UTC day of
// runs.started_at) and the adw.daily_phase_summary view (usage per project,
// pipeline phase and UTC day of runs.finished_at) for the same days, in the
// same Promise.all, for the day cards' tokens by model and cost by phase
// charts.
import { pastDaysWindow, toSummaryDay, toSummaryReport } from "@/lib/daily-summary";
import {
  HISTORY_PAGE_SIZE,
  type HistoryBookmark,
  type HistoryPage,
  historyItems,
  historyKeysetFilter,
  historyNewerFilter,
  historyOrderAscending,
  toHistoryPage,
} from "@/lib/history-bookmark";
import { historySearchFilter } from "@/lib/history-search";
import type {
  DailyModelSummary,
  DailyPhaseSummary,
  DailySummary,
  ProjectSummary,
  QueueItem,
  Run,
  SummaryDay,
  SummaryReport,
} from "@/types/adw";
import { getSupabase } from "./supabase";

export interface ActiveRuns {
  /**
   * Every visible project's runs with status "running" or "failed", most
   * recently updated first.
   */
  active: Run[];
  /**
   * ISO timestamp of the moment the rows were read. Nothing in the UI reads it
   * today: it is kept because the realtime catch-up re-stamps it on every
   * refresh and because issue #3 (relative labels with a leaf-level clock)
   * needs it as the clock-free server snapshot during hydration.
   */
  fetched_at: string;
}

/** The columns of adw.runs the screens read, which are exactly the fields of Run. */
const RUN_COLUMNS =
  "project_id, adw_id, issue_number, issue_title, issue_class, branch_name, phase, status, state, toolkit_version, started_at, updated_at, finished_at";

/** The columns of adw.queue_items the screens read, which are exactly the fields of QueueItem. */
const QUEUE_COLUMNS =
  "project_id, issue_number, state, source, position, issue_title, queued_at, adw_id, reason, updated_at";

/** The columns of adw.daily_summary the summary page reads, which are exactly the fields of DailySummary. */
const DAILY_SUMMARY_COLUMNS =
  "project_id, day, runs, completed, failed, features, bugs, chores, patches, duration_sum_s, tokens_in_sum, tokens_cache_read_sum, tokens_out_sum, cost_usd_sum";

/** The columns of adw.daily_model_summary the summary page reads, which are exactly the fields of DailyModelSummary. */
const DAILY_MODEL_SUMMARY_COLUMNS =
  "project_id, day, model, runs, input, cache_read, cache_creation, output, cost_usd";

/** The columns of adw.daily_phase_summary the summary page reads, which are exactly the fields of DailyPhaseSummary. */
const DAILY_PHASE_SUMMARY_COLUMNS =
  "project_id, day, phase, runs, input, cache_read, cache_creation, output, cost_usd, duration_s";

/**
 * All projects, most recently active first (projects with no runs yet last).
 *
 * Also the queryFn for queryKeys.projects: it runs on the server during the
 * layout's prefetch (and at build time, through it), and in the browser only
 * when the cache has nothing under that key, which the hydration makes rare.
 *
 * Reads the adw.project_summaries view, which already carries the per-status
 * counts and last_run_at, so no counting happens here. The view runs with
 * security_invoker, so the publishable key sees only public projects. Errors
 * are thrown, not swallowed: the layout prefetch and generateStaticParams both
 * depend on this, and a silent empty list would ship a wrong build.
 */
export async function getProjects(): Promise<ProjectSummary[]> {
  const { data, error } = await getSupabase()
    .from("project_summaries")
    .select("*")
    .order("last_run_at", { ascending: false, nullsFirst: false });
  if (error) {
    throw new Error(`project_summaries: ${error.message}`);
  }
  // The client is untyped (no generated Database type yet, see supabase.ts),
  // so rows come back as any-ish. The view's columns are exactly the fields
  // of ProjectSummary, so this cast at the boundary is the one place the
  // shape is asserted. Generated types are a follow-up.
  return (data ?? []) as ProjectSummary[];
}

/**
 * The project row for a slug (the same shape getProjects returns, so the header
 * and the sidebar agree), or null for an unknown slug. RLS limits it to public
 * projects. Shared by the history and queue reads below.
 */
async function getProjectBySlug(slug: string): Promise<ProjectSummary | null> {
  const { data, error } = await getSupabase()
    .from("project_summaries")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw new Error(`project_summaries: ${error.message}`);
  }
  // Same untyped client, same reasoning as in getProjects: the view's columns
  // are exactly the fields of ProjectSummary, asserted once at the boundary.
  return (data as ProjectSummary | null) ?? null;
}

/**
 * The slug of the project with this id, or null when the publishable key sees
 * no such project (unknown id, or a private project: RLS hides it, and a
 * private project has no page whose cache could be stale).
 *
 * Server only, and only from the /api/revalidate route handler: a database
 * webhook names a run's project by project_id, and the cache tags are keyed
 * by slug, so this is the one read that turns the one into the other. It runs
 * outside any "use cache" scope (a route handler has none), reads no clock,
 * and is never a queryFn. It reads adw.projects directly rather than the
 * project_summaries view: one column is wanted and the view's aggregate would
 * count the project's runs for nothing.
 */
export async function getProjectSlug(projectId: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("projects")
    .select("slug")
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    throw new Error(`projects: ${error.message}`);
  }
  // Same untyped client as everywhere in this file; the one selected column is
  // asserted here, at the boundary.
  return (data as { slug: string } | null)?.slug ?? null;
}

/**
 * Every visible project's live runs (status running or failed), most recently
 * updated first. One read of adw.runs, filtered to the two live statuses in
 * SQL; RLS limits the rows to public projects. Completed runs are not read
 * here: they are history, served by getCompletedRuns from a server-rendered
 * cache scope. No label is derived from the current time anywhere (removed
 * pending issue #3); the screens render the rows as stored, and each screen
 * narrows the one list itself (src/lib/active-runs.ts).
 *
 * Also the queryFn of queryKeys.activeRuns (activeRunsQuery in
 * active-runs-query.ts). On the server it runs only inside getActiveRunsState
 * (active-runs-state.ts), after connection(), so at request time and never in
 * a prerender pass; nothing it returns is frozen into the static shell. In
 * the browser it runs on a cache miss and in the realtime catch-up.
 *
 * fetched_at is the one clock read in the data layer. On the server it is
 * allowed because it only ever runs after connection() (a clock read before
 * it would fail the prerender, next-prerender-current-time); in the browser
 * the clock read is unconstrained.
 */
export async function getActiveRuns(): Promise<ActiveRuns> {
  const { data, error } = await getSupabase()
    .from("runs")
    .select(RUN_COLUMNS)
    .in("status", ["running", "failed"])
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(`runs: ${error.message}`);
  }

  return {
    // The selected columns are exactly the fields of Run, so this cast is the
    // one place the table's shape is asserted (getCompletedRuns casts the same
    // select).
    active: (data ?? []) as Run[],
    fetched_at: new Date().toISOString(),
  };
}

/**
 * A project's completed runs, narrowed by the search text when there is one:
 * the one filter the History rows read and both of its counts share, so the
 * page and its "N of M" can never disagree on what is counted.
 */
function completedRuns<Columns extends string>(
  projectId: string,
  q: string | null,
  columns: Columns,
  options?: { count: "exact"; head: true },
) {
  const query = getSupabase()
    .from("runs")
    .select(columns, options)
    .eq("project_id", projectId)
    .eq("status", "completed");
  return q ? query.or(historySearchFilter(q)) : query;
}

/** The number of rows a count read reports, or its error thrown as `runs: <message>`. */
function countOf({ count, error }: { count: number | null; error: { message: string } | null }) {
  if (error) {
    throw new Error(`runs: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * One page of a project's completed runs, at most `HISTORY_PAGE_SIZE` in the
 * display order `updated_at desc, adw_id desc`, with its position (page N of
 * M) and the cursors of its two arrows; page 1 of 1 with no rows for an
 * unknown slug (the page has already decided not-found from the project list
 * by the time this is called).
 *
 * Keyset in either direction, never an offset: `bookmark` (null for page one)
 * is already decoded and validated by the caller outside the cache scope
 * (readHistoryBookmark in src/lib/history-bookmark.ts). An `after` bookmark
 * reads the rows strictly older than it, newest first; a `before` bookmark the
 * rows strictly newer, oldest first (historyOrderAscending), which
 * historyItems reverses for display. A run completing at the head therefore
 * never shifts a bookmarked page. adw_id is unique within a project, so the
 * order is total.
 *
 * Two counts on the same filter number the page: the total, read alongside
 * the rows, and the rows strictly newer than the first shown row (or than the
 * bookmark itself when a bookmarked page is empty), read after them.
 * toHistoryPage turns the two into the page number, the page count and both
 * arrows, so no N + 1 row is fetched.
 *
 * `q` is the search text, already normalised by the caller outside the cache
 * scope (readHistoryQuery in src/lib/history-search.ts), or null for no
 * search. It narrows the rows and both counts through historySearchFilter,
 * never the order, so a search page's cursor is the same keyset bookmark. Its
 * `or` is a second filter parameter next to the keyset's, and PostgREST ANDs
 * the two.
 *
 * Server only, and only from inside the page's "use cache" scope for history
 * (tagged history:<slug>, shared by every page), so the counts drop with the
 * tag together with the rows. It never enters the React Query cache and reads
 * no clock: there is no fetched_at here, and nothing in it needs the current
 * time. A completed run never changes, so the cached pages are only refilled
 * when the browser asks the server to drop the tag after a completion
 * (revalidateHistory), when the database webhook does, or when the cache
 * lifetime ends.
 */
export async function getCompletedRuns(
  slug: string,
  bookmark: HistoryBookmark | null,
  q: string | null,
): Promise<HistoryPage> {
  const project = await getProjectBySlug(slug);
  if (project === null) return toHistoryPage([], { slug, newer: 0, total: 0 });

  let rowsQuery = completedRuns(project.id, q, RUN_COLUMNS);
  if (bookmark) rowsQuery = rowsQuery.or(historyKeysetFilter(bookmark));
  const ascending = historyOrderAscending(bookmark);
  const [rows, totalCount] = await Promise.all([
    rowsQuery
      .order("updated_at", { ascending })
      .order("adw_id", { ascending })
      .limit(HISTORY_PAGE_SIZE),
    completedRuns(project.id, q, "adw_id", { count: "exact", head: true }),
  ]);
  if (rows.error) {
    throw new Error(`runs: ${rows.error.message}`);
  }
  const total = countOf(totalCount);
  // The selected columns are exactly the fields of Run, the same cast as in
  // getActiveRuns: the one place the table's shape is asserted.
  const items = historyItems((rows.data ?? []) as Run[], bookmark);

  const anchor = items[0] ?? bookmark;
  const newer = anchor
    ? countOf(
        await completedRuns(project.id, q, "adw_id", { count: "exact", head: true }).or(
          historyNewerFilter(anchor),
        ),
      )
    : 0;
  return toHistoryPage(items, { slug, newer, total });
}

/**
 * One project's queued items (state queued), in ledger order: position, then
 * issue_number so equal positions (a move in progress) still sort the same
 * way every time. An empty list for an unknown slug: the page has already
 * decided not-found from the project list by the time this is read.
 *
 * Also the queryFn for queryKeys.queue(slug). On the server it runs only
 * inside the page's "use cache" scope (getQueueState); in the browser on a
 * cache miss and in the realtime catch-up. Only state queued is read: every
 * other state is a run, shown in Active or History. It reads no clock and has
 * no fetched_at (nothing needs one; issue #3 is about run labels).
 */
export async function getQueue(slug: string): Promise<QueueItem[]> {
  const project = await getProjectBySlug(slug);
  if (project === null) return [];

  const { data, error } = await getSupabase()
    .from("queue_items")
    .select(QUEUE_COLUMNS)
    .eq("project_id", project.id)
    .eq("state", "queued")
    .order("position", { ascending: true })
    .order("issue_number", { ascending: true });
  if (error) {
    throw new Error(`queue_items: ${error.message}`);
  }
  // The selected columns are exactly the fields of QueueItem, so this cast is
  // the one place the table's shape is asserted.
  return (data ?? []) as QueueItem[];
}

/**
 * Every project the publishable key can see, by slug, with the two columns
 * the summary names its rows by. RLS hides private projects, so a summary row
 * whose project is not here is dropped. Shared by both summary reads.
 */
async function getSummaryProjects(): Promise<{ id: string; slug: string; display_name: string }[]> {
  const { data, error } = await getSupabase()
    .from("projects")
    .select("id, slug, display_name")
    .order("slug", { ascending: true });
  if (error) {
    throw new Error(`projects: ${error.message}`);
  }
  // Same untyped client as everywhere in this file; the three selected
  // columns are asserted here, at the boundary.
  return (data ?? []) as { id: string; slug: string; display_name: string }[];
}

/**
 * The summary page's (`/`) past days: the finished runs per UTC day over the
 * `days` days strictly before `today` (`YYYY-MM-DD`), for every visible
 * project. Today is never in it; the today card shows it (getSummaryToday).
 *
 * `today` comes from the caller, the page's one request-time clock read; this
 * function reads no clock. Four reads in parallel: the projects (to name the
 * rows and drop the hidden ones), the daily_summary rows in the window
 * (pastDaysWindow in src/lib/daily-summary.ts, mirrored here as
 * `day >= from and day < today`), and the daily_model_summary and
 * daily_phase_summary rows in the same window. Assembly is toSummaryReport's.
 *
 * Server only, and only from the summary page's past days "use cache" scope
 * (getPastDays). Never a queryFn, never in the React Query cache. `days` is
 * the page's fixed SUMMARY_DEFAULT_DAYS.
 */
export async function getSummaryPast(today: string, days: number): Promise<SummaryReport> {
  const { from, to } = pastDaysWindow(today, days);
  const [projects, rows, modelRows, phaseRows] = await Promise.all([
    getSummaryProjects(),
    getSupabase()
      .from("daily_summary")
      .select(DAILY_SUMMARY_COLUMNS)
      .gte("day", from)
      .lt("day", today)
      .order("day", { ascending: false }),
    getSupabase()
      .from("daily_model_summary")
      .select(DAILY_MODEL_SUMMARY_COLUMNS)
      .gte("day", from)
      .lt("day", today),
    getSupabase()
      .from("daily_phase_summary")
      .select(DAILY_PHASE_SUMMARY_COLUMNS)
      .gte("day", from)
      .lt("day", today),
  ]);
  if (rows.error) {
    throw new Error(`daily_summary: ${rows.error.message}`);
  }
  if (modelRows.error) {
    throw new Error(`daily_model_summary: ${modelRows.error.message}`);
  }
  if (phaseRows.error) {
    throw new Error(`daily_phase_summary: ${phaseRows.error.message}`);
  }
  // The selected columns are exactly the fields of DailySummary,
  // DailyModelSummary and DailyPhaseSummary, so these casts are the one place
  // the views' shapes are asserted for this read.
  return toSummaryReport(
    (rows.data ?? []) as DailySummary[],
    (modelRows.data ?? []) as DailyModelSummary[],
    (phaseRows.data ?? []) as DailyPhaseSummary[],
    projects,
    { days, from, to },
  );
}

/**
 * The summary page's (`/`) today card: the finished runs of the UTC day
 * `today` (`YYYY-MM-DD`) across every visible project, or null when none has
 * finished a run yet. Four reads in parallel (projects, that day's
 * daily_summary rows, its daily_model_summary rows and its
 * daily_phase_summary rows), assembled by
 * toSummaryDay, so the server prefetch and the browser refetch
 * return the same shape.
 *
 * Also the queryFn for queryKeys.summaryToday(today). On the server it runs
 * only inside the page's today "use cache" scope (getTodayState); in the
 * browser when TodaySummary's Refresh button refetches, through the same
 * Supabase client with the publishable key and RLS. It reads no clock;
 * `today` always comes from the caller.
 */
export async function getSummaryToday(today: string): Promise<SummaryDay | null> {
  const [projects, rows, modelRows, phaseRows] = await Promise.all([
    getSummaryProjects(),
    getSupabase().from("daily_summary").select(DAILY_SUMMARY_COLUMNS).eq("day", today),
    getSupabase().from("daily_model_summary").select(DAILY_MODEL_SUMMARY_COLUMNS).eq("day", today),
    getSupabase().from("daily_phase_summary").select(DAILY_PHASE_SUMMARY_COLUMNS).eq("day", today),
  ]);
  if (rows.error) {
    throw new Error(`daily_summary: ${rows.error.message}`);
  }
  if (modelRows.error) {
    throw new Error(`daily_model_summary: ${modelRows.error.message}`);
  }
  if (phaseRows.error) {
    throw new Error(`daily_phase_summary: ${phaseRows.error.message}`);
  }
  // The selected columns are exactly the fields of DailySummary,
  // DailyModelSummary and DailyPhaseSummary, the same casts as in
  // getSummaryPast.
  return toSummaryDay(
    (rows.data ?? []) as DailySummary[],
    (modelRows.data ?? []) as DailyModelSummary[],
    (phaseRows.data ?? []) as DailyPhaseSummary[],
    projects,
    today,
  );
}
