"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { getActiveRuns } from "@/data";
import { queryKeys } from "@/data/query-keys";
import { PageHeader } from "./PageHeader";
import { RunRow } from "./RunRow";

/**
 * The live half of the detail pane for one project: header and Active runs
 * (status running or failed). A client component so its data lives in the
 * React Query cache, where the runs Realtime listener can update it in place.
 * The runs themselves are prefetched by the server page under the same key and
 * arrive hydrated, so the query below is a cache hit on the first render and
 * the server HTML already holds the rows. History (completed runs) is not
 * here: the page renders it on the server, below this component.
 *
 * The rows are passed to RunRow as stored. No view model is built here and no
 * clock is read: the labels that needed one ("updated 2m ago", the stale
 * badge, a running run's elapsed time) are removed pending issue #3, and
 * data.fetched_at is not read by the UI today.
 */
export function ActiveRunsView({ slug }: { slug: string }) {
  const { data } = useSuspenseQuery({
    // The same key builder the page prefetched under. Never build it inline.
    queryKey: queryKeys.runs(slug),
    queryFn: () => getActiveRuns(slug),
    // Same two reasons as ProjectNav: "static" keeps React Query from reading
    // the clock during the client prerender (which would ship this pane as its
    // Suspense fallback), and the data only changes when something writes it
    // with setQueryData, never on a timer.
    staleTime: "static",
    // The hydrated data is stale on arrival; refetching it is the fetch we avoided
    refetchOnMount: false,
  });

  // Live updates do not live here. The runs listener in src/data/realtime.ts
  // writes each change into this same cache entry with
  // queryClient.setQueryData(queryKeys.runs(slug), ...), and React Query re-renders
  // this component from the cache; nothing in this file knows about the socket.

  // The server page already called notFound() for a null result, so this
  // branch is for the cache alone (a browser-side refetch of a slug that has
  // since gone). It mirrors src/app/(dashboard)/not-found.tsx.
  if (!data) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Not found</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            There is no project at this address. Pick one from the list.
          </p>
        </div>
      </div>
    );
  }

  const { project, active } = data;

  return (
    <>
      <PageHeader title={project.display_name} subtitle={project.slug} repoUrl={project.repo_url} />

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Active</h2>
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No runs in progress.
          </p>
        ) : (
          <ul className="space-y-3">
            {active.map((run) => (
              <RunRow key={run.adw_id} run={run} projectSlug={project.slug} variant="active" />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
