"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { getSummaryToday } from "@/data";
import { queryKeys } from "@/data/query-keys";
import { formatDay } from "@/lib/format-date";
import { STATUS_COLORS } from "@/lib/status-colors";
import { SummaryDayCard } from "./SummaryDayCard";

/**
 * The summary page's (`/`) today card: today's finished runs across every
 * project, with a Refresh button that refetches this one query in place. The
 * day arrives as a prop from the server's request-time clock read; this
 * component never computes it and reads no clock. The data is prefetched by
 * the page under the same key and arrives hydrated, so the first render is a
 * cache hit and the server HTML already holds the card.
 *
 * Refresh is refetch() and nothing else: no router.refresh(), no server
 * action, no navigation. Only today's rows (and the project list that names
 * them) travel, through the browser Supabase client. A failed refetch keeps
 * the last data (useSuspenseQuery throws to the boundary only when there is
 * none), so the card keeps its figures and says the refresh failed.
 */
export function TodaySummary({ today }: { today: string }) {
  const { data, refetch, isFetching, isRefetchError } = useSuspenseQuery({
    // The same key builder the page prefetched under. Never build it inline.
    queryKey: queryKeys.summaryToday(today),
    queryFn: () => getSummaryToday(today),
    // "static" keeps React Query from reading the clock during the client
    // prerender; the entry only changes when the button refetches it.
    staleTime: "static",
    refetchOnMount: false,
  });

  const title = (
    <>
      Today, <time dateTime={today}>{formatDay(today)}</time>
    </>
  );
  const actions = (
    <button
      type="button"
      onClick={() => void refetch()}
      disabled={isFetching}
      aria-busy={isFetching}
      className="ml-auto rounded-md border border-neutral-300 px-2.5 py-1 text-sm font-medium hover:bg-neutral-100 disabled:opacity-60 disabled:text-neutral-500 disabled:hover:bg-transparent dark:border-neutral-700 dark:hover:bg-neutral-800 dark:disabled:text-neutral-400"
    >
      {isFetching ? "Refreshing..." : "Refresh"}
    </button>
  );
  const failed = isRefetchError && !isFetching && (
    <p role="status" className={`text-sm ${STATUS_COLORS.failed.text}`}>
      Refresh failed. Showing the last loaded figures.{" "}
      <button type="button" onClick={() => void refetch()} className="font-medium underline">
        Retry
      </button>
    </p>
  );

  if (data === null) {
    return (
      <article className="space-y-3 rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="font-semibold">{title}</h2>
          {actions}
        </header>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No finished runs yet today.
        </p>
        {failed}
      </article>
    );
  }

  return (
    <div className="space-y-2">
      <SummaryDayCard day={data} title={title} actions={actions} />
      {failed}
    </div>
  );
}
