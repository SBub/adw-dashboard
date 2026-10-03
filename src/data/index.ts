// The single boundary between the screens and wherever the data comes from.
// The pages and components only ever import from "@/data", so wiring a data
// source is a change to this file alone. Both reads are live: the project list
// comes from the adw.project_summaries view and a project's runs from the
// adw.runs table, through the one Supabase client.
import type { ProjectSummary, Run } from "@/types/adw";
import { getSupabase } from "./supabase";

export interface ProjectRuns {
  project: ProjectSummary;
  /** Runs with status "running", most recently updated first. */
  active: Run[];
  /** Completed and failed runs, most recently updated first. */
  history: Run[];
  /**
   * ISO timestamp of the moment the rows were read. Nothing in the UI reads it
   * today: it is kept because the realtime catch-up re-stamps it on every
   * refresh and because issue #3 (relative labels with a leaf-level clock)
   * needs it as the clock-free server snapshot during hydration.
   */
  fetched_at: string;
}

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
 * One project with its runs split into active and history, or null for an
 * unknown slug.
 *
 * Also the queryFn for queryKeys.runs(slug): it runs on the server during the
 * page's prefetch (and at build time, through it, for every slug in
 * generateStaticParams), and in the browser only when the cache has nothing
 * under that key, which the hydration makes rare.
 *
 * Two reads. The project comes from adw.project_summaries by slug (the same
 * row shape getProjects returns, so the header and the sidebar agree), and a
 * missing row is the not-found case. The runs come from adw.runs by
 * project_id, most recently updated first; RLS limits both to public projects.
 * The split into active and history is the only derivation here. No label is
 * derived from the current time anywhere (removed pending issue #3); the
 * screens render the rows as stored, plus a finished run's duration from its
 * own two timestamps.
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
export async function getProjectRuns(slug: string): Promise<ProjectRuns | null> {
  const supabase = getSupabase();

  const projectResult = await supabase
    .from("project_summaries")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (projectResult.error) {
    throw new Error(`project_summaries: ${projectResult.error.message}`);
  }
  if (projectResult.data === null) return null;
  // Same untyped client, same reasoning as in getProjects: the view's columns
  // are exactly the fields of ProjectSummary, asserted once at the boundary.
  const project = projectResult.data as ProjectSummary;

  const runsResult = await supabase
    .from("runs")
    .select(
      "project_id, adw_id, issue_number, issue_class, branch_name, phase, status, state, toolkit_version, started_at, updated_at, finished_at",
    )
    .eq("project_id", project.id)
    .order("updated_at", { ascending: false });
  if (runsResult.error) {
    throw new Error(`runs: ${runsResult.error.message}`);
  }
  // The selected columns are exactly the fields of Run, so this cast is the
  // one place the table's shape is asserted.
  const runs = (runsResult.data ?? []) as Run[];

  return {
    project,
    active: runs.filter((run) => run.status === "running"),
    history: runs.filter((run) => run.status !== "running"),
    fetched_at: new Date().toISOString(),
  };
}
