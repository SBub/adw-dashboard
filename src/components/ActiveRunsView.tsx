"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { activeRunsQuery } from "@/data/active-runs-query";
import { activeRunsOf } from "@/lib/active-runs";
import { RunRow } from "./RunRow";

/**
 * The live half of the detail pane for one project: its Active runs (status
 * running or failed). A client component so its data lives in the React Query
 * cache, where the runs Realtime listener can update it in place. It reads the
 * one Active entry, every visible project's active runs, and narrows it to
 * this project with a select (activeRunsOf), so the rows are the same ones the
 * sidebar counts and /projects lists. The entry is read per request on the
 * server and hydrated by the page's Active island around this component, so
 * the query below is a cache hit on the first render and the server HTML
 * already holds the rows. History (completed runs) is not here: the page
 * renders it on the server, below this component. The header and the
 * not-found decision are the page's too.
 *
 * The Queue section is not read here either. It is a separate cache entry
 * under its own HydrationBoundary and QueryBoundary, built by the page and
 * passed in as the `queue` slot, which is rendered after the Active section
 * so the queue sits below Active while its loading and error states stay
 * independent of this entry's. The Active heading is a slot too (`heading`):
 * the page builds it with its copy, so the copy sits next to the sections and
 * the heading stays a server component.
 *
 * The rows are passed to RunRow as stored. No view model is built here and no
 * clock is read: the labels that needed one ("updated 2m ago", the stale
 * badge, a running run's elapsed time) are removed pending issue #3, and
 * fetched_at is not read by the UI today.
 */
export function ActiveRunsView({
  projectId,
  slug,
  heading,
  queue,
}: {
  projectId: string;
  slug: string;
  heading: ReactNode;
  queue: ReactNode;
}) {
  const { data: runs } = useSuspenseQuery({
    ...activeRunsQuery,
    select: (data) => activeRunsOf(data.active, projectId),
  });

  // Live updates do not live here. The runs listener in src/data/realtime.ts
  // writes each change into the same entry with
  // queryClient.setQueryData(queryKeys.activeRuns, ...), and React Query
  // re-renders this component from the cache; nothing in this file knows
  // about the socket.

  return (
    <>
      <section className="mb-10">
        {heading}
        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No runs in progress.
          </p>
        ) : (
          <ul className="space-y-3">
            {runs.map((run) => (
              <RunRow key={run.adw_id} run={run} projectSlug={slug} variant="active" />
            ))}
          </ul>
        )}
      </section>

      {queue}
    </>
  );
}
