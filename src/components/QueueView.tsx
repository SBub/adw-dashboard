"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getQueue } from "@/data";
import { queryKeys } from "@/data/query-keys";
import { QueueRow } from "./QueueRow";

/**
 * The Queue section of the detail pane: one project's items in state queued,
 * in the order they will run. A client component so its data lives in the
 * React Query cache, where the queue_items Realtime listener can update it in
 * place. The page prefetches it under the same key and hydrates it, so the
 * query below is a cache hit on the first render and the server HTML already
 * holds the rows. The page slots it into ActiveRunsView, above Active, under
 * its own HydrationBoundary and QueryBoundary.
 *
 * The heading and its copy come from the page as the `heading` slot, so the
 * copy sits next to the sections and the heading stays a server component.
 */
export function QueueView({ slug, heading }: { slug: string; heading: ReactNode }) {
  const { data: items } = useSuspenseQuery({
    // The same key builder the page prefetched under. Never build it inline.
    queryKey: queryKeys.queue(slug),
    queryFn: () => getQueue(slug),
    // Same two reasons as ActiveRunsView: "static" keeps React Query from
    // reading the clock during the client prerender, and the data only changes
    // when something writes it with setQueryData, never on a timer.
    staleTime: "static",
    // The hydrated data is stale on arrival; refetching it is the fetch we avoided
    refetchOnMount: false,
  });

  // Live updates do not live here: the queue_items listener in
  // src/data/realtime.ts writes each change into this same cache entry.

  return (
    <section className="mb-10">
      {heading}
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          Nothing queued.
        </p>
      ) : (
        <ol className="space-y-3">
          {items.map((item) => (
            <QueueRow key={item.issue_number} item={item} projectSlug={slug} />
          ))}
        </ol>
      )}
    </section>
  );
}
