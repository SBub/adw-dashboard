"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getProjects } from "@/data";
import { activeRunsQuery } from "@/data/active-runs-query";
import { queryKeys } from "@/data/query-keys";
import { groupActiveRuns } from "@/lib/active-runs";
import { RunRow } from "./RunRow";

/**
 * Every active run (status running or failed) of every visible project, on
 * /projects, grouped by project in the sidebar's order. A client component
 * so it reads the one Active entry from the React Query cache, the same rows
 * the sidebar counts and every project page shows, where the runs Realtime
 * listener updates them in place. The entry is read per request and hydrated
 * by the page's island around this component; the project list is hydrated
 * by the layout's sidebar boundary, so both queries are cache hits on the
 * first render and the server HTML already holds the rows.
 *
 * The grouping is groupActiveRuns (src/lib/active-runs.ts); this component
 * only renders it. The section heading is not here: the page renders it in
 * the static shell, above the boundary of this island.
 */
export function ActiveRunsOverview() {
  const { data } = useSuspenseQuery(activeRunsQuery);
  const { data: projects } = useSuspenseQuery({
    // The same imported key the layout prefetched under. Never build it inline.
    queryKey: queryKeys.projects,
    queryFn: getProjects,
    // Same two reasons as ProjectNav: no clock read in the client prerender,
    // and the list only changes through setQueryData.
    staleTime: "static",
    // The hydrated data is stale on arrival; refetching it is the fetch we avoided
    refetchOnMount: false,
  });

  const groups = groupActiveRuns(data.active, projects);

  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        No runs in progress.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map(({ project, runs }) => (
        <section key={project.id}>
          <h3 className="mb-3 flex flex-wrap items-baseline gap-x-2">
            <Link
              href={`/projects/${project.slug}`}
              className="font-semibold underline-offset-4 hover:underline"
            >
              {project.display_name}
            </Link>
            <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
              {project.slug}
            </span>
          </h3>
          <ul className="space-y-3">
            {runs.map((run) => (
              <RunRow key={run.adw_id} run={run} projectSlug={project.slug} variant="active" />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
