// The single boundary between the screens and wherever the data comes from.
// The pages and components only ever import from "@/data" and only ever see
// ProjectSummary and RunView, so wiring a data source is a change to this file
// alone. The project list is live (the adw.project_summaries view); the runs
// are still the hand-written fixtures until the runs read is wired.
import type { ProjectSummary, RunView } from "@/types/adw";
import { projects as fixtureProjects, runs } from "./fixtures";
import { getSupabase } from "./supabase";

interface ProjectRuns {
  project: ProjectSummary;
  /** Runs with status "running", in the order the data layer gives them. */
  active: RunView[];
  /** Completed and failed runs, newest first, as given by the data layer. */
  history: RunView[];
}

/**
 * All projects, most recently active first (projects with no runs yet last).
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
 * TEMPORARY: runs are not read from the database yet, so this still resolves
 * the project from the fixture project list (the fixture runs reference
 * fixture project ids). A real project that has no fixture entry gets null,
 * which the page renders as not found. The runs read replaces this whole
 * function and the fixture lookup goes with it.
 */
export function getProjectRuns(slug: string): ProjectRuns | null {
  const project = fixtureProjects.find((candidate) => candidate.slug === slug);
  if (!project) return null;
  const own = runs.filter((run) => run.project_id === project.id);
  return {
    project,
    active: own.filter((run) => run.status === "running"),
    history: own.filter((run) => run.status !== "running"),
  };
}
