// The single boundary between the screens and wherever the data comes from.
// The pages and components only ever import from "@/data", so wiring a data
// source is a change to this file alone. Every read is live: the project list
// comes from the adw.project_summaries view and a project's runs from the
// adw.runs table, through the one Supabase client.
//
// A project's runs are read in two halves with two different lifetimes:
//
// - Active (status running or failed; a failed run can be resumed, so it is
//   still live) is a React Query entry, prefetched on the server, hydrated,
//   and patched in the browser by the Realtime listener. getActiveRuns.
// - History (status completed) is immutable. It is rendered on the server
//   inside a "use cache" scope tagged per project and never enters the query
//   cache; a completion in the browser asks the server to drop that tag and
//   re-render. getCompletedRuns.
import type { ProjectSummary, Run } from "@/types/adw";
import { getSupabase } from "./supabase";

export interface ActiveRuns {
  project: ProjectSummary;
  /** Runs with status "running" or "failed", most recently updated first. */
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
  "project_id, adw_id, issue_number, issue_class, branch_name, phase, status, state, toolkit_version, started_at, updated_at, finished_at";

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
 * projects. Shared by the two runs reads below.
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
 * One project with its live runs (status running or failed), or null for an
 * unknown slug.
 *
 * Also the queryFn for queryKeys.runs(slug): it runs on the server during the
 * page's prefetch (and at build time, through it, for every slug in
 * generateStaticParams), and in the browser only when the cache has nothing
 * under that key, which the hydration makes rare.
 *
 * Two reads. The project comes from adw.project_summaries by slug, and a
 * missing row is the not-found case. The runs come from adw.runs by
 * project_id, filtered to the two live statuses in SQL, most recently updated
 * first. Completed runs are not read here: they are history, served by
 * getCompletedRuns from a server-rendered cache scope. No label is derived
 * from the current time anywhere (removed pending issue #3); the screens
 * render the rows as stored.
 *
 * fetched_at is the one clock read in the data layer. On the server this
 * function runs inside the page's "use cache" scope (getRunsState), where
 * Cache Components permits reading the current time: the value is cached with
 * the rows and every visitor sees the same one until the entry is refilled.
 * Reading it outside a cache scope would fail the prerender
 * (next-prerender-current-time), so on the server this function must only be
 * called from inside one. In the browser (the queryFn on a cache miss, the
 * realtime catch-up) the clock read is unconstrained.
 */
export async function getActiveRuns(slug: string): Promise<ActiveRuns | null> {
  const project = await getProjectBySlug(slug);
  if (project === null) return null;

  const { data, error } = await getSupabase()
    .from("runs")
    .select(RUN_COLUMNS)
    .eq("project_id", project.id)
    .in("status", ["running", "failed"])
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(`runs: ${error.message}`);
  }

  return {
    project,
    // The selected columns are exactly the fields of Run, so this cast is the
    // one place the table's shape is asserted (getCompletedRuns casts the same
    // select).
    active: (data ?? []) as Run[],
    fetched_at: new Date().toISOString(),
  };
}

/**
 * A project's completed runs, most recently updated first; an empty list for
 * an unknown slug (the page has already decided not-found from getActiveRuns
 * by the time this is called).
 *
 * Server only, and only from inside the page's "use cache" scope for history
 * (tagged history:<slug>). It never enters the React Query cache and reads no
 * clock: there is no fetched_at here, and nothing in it needs the current
 * time, so the result is the plain rows. A completed run never changes, so the
 * cached list is only refilled when the browser asks the server to drop the
 * tag after a completion (revalidateHistory), or when the cache lifetime ends.
 *
 * Pagination goes here later: this is the one read that grows without bound
 * (the active list is a handful of rows), so a range on the query and a cursor
 * in the signature would be the change, with nothing elsewhere.
 */
export async function getCompletedRuns(slug: string): Promise<Run[]> {
  const project = await getProjectBySlug(slug);
  if (project === null) return [];

  const { data, error } = await getSupabase()
    .from("runs")
    .select(RUN_COLUMNS)
    .eq("project_id", project.id)
    .eq("status", "completed")
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(`runs: ${error.message}`);
  }
  return (data ?? []) as Run[];
}
