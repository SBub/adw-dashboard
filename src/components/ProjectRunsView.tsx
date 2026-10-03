"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { getProjectRuns, type ProjectRuns } from "@/data";
import { queryKeys } from "@/data/query-keys";
import { toRunView } from "@/lib/run-view";
import { useNow } from "@/lib/use-now";
import { PageHeader } from "./PageHeader";
import { RunHistory } from "./RunHistory";
import { RunRow } from "./RunRow";

/**
 * The detail pane for one project: header, Active runs, History. A client
 * component so its data lives in the React Query cache, where the runs
 * Realtime listener can update it in place later. The runs themselves are
 * prefetched by the server page under the same key and arrive hydrated, so the
 * query below is a cache hit on the first render and the server HTML already
 * holds the rows.
 */
export function ProjectRunsView({ slug }: { slug: string }) {
  const { data } = useSuspenseQuery({
    // The same key builder the page prefetched under. Never build it inline.
    queryKey: queryKeys.runs(slug),
    queryFn: () => getProjectRuns(slug),
    // Same two reasons as ProjectNav: "static" keeps React Query from reading
    // the clock during the client prerender (which would ship this pane as its
    // Suspense fallback), and the data only changes when something writes it
    // with setQueryData, never on a timer.
    staleTime: "static",
    // The hydrated data is stale on arrival; refetching it is the fetch we avoided
    refetchOnMount: false,
  });

  // Live updates do not live here. The runs listener in src/data/realtime.ts
  // will write each change into this same cache entry with
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

  return <RunsPane data={data} />;
}

/**
 * The pane proper, split out so useNow runs unconditionally below the null
 * guard. It is the one place the rows become view models: useNow is read once
 * and every run goes through the pure toRunView with that value, so the labels
 * of all rows agree on what "now" is. RunRow and RunHistory keep taking
 * RunView and know nothing about the clock.
 *
 * useNow is seeded with the data's fetched_at, so on the server and during
 * hydration the labels are relative to the moment the cached rows were read
 * (no clock is touched in the prerender), and after hydration the live clock
 * takes over and the labels tick forward. See src/lib/use-now.ts.
 */
function RunsPane({ data }: { data: ProjectRuns }) {
  const now = useNow(data.fetched_at);
  const { project } = data;
  const active = data.active.map((run) => toRunView(run, now));
  const history = data.history.map((run) => toRunView(run, now));

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

      <RunHistory runs={history} projectSlug={project.slug} />
    </>
  );
}
