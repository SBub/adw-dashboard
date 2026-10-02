// The single boundary between the screens and wherever the data comes from.
// Today it reads the hand-written fixtures. Replacing this file (keeping the
// two signatures) is the whole job of wiring a real data source: the pages and
// components only ever import from "@/data" and only ever see ProjectSummary
// and RunView.
import type { ProjectSummary, RunView } from "@/types/adw";
import { projects, runs } from "./fixtures";

interface ProjectRuns {
  project: ProjectSummary;
  /** Runs with status "running", in the order the data layer gives them. */
  active: RunView[];
  /** Completed and failed runs, newest first, as given by the data layer. */
  history: RunView[];
}

/** All projects, in the order they should be shown. */
export function getProjects(): ProjectSummary[] {
  return projects;
}

/** One project with its runs split into active and history, or null for an unknown slug. */
export function getProjectRuns(slug: string): ProjectRuns | null {
  const project = projects.find((candidate) => candidate.slug === slug);
  if (!project) return null;
  const own = runs.filter((run) => run.project_id === project.id);
  return {
    project,
    active: own.filter((run) => run.status === "running"),
    history: own.filter((run) => run.status !== "running"),
  };
}
