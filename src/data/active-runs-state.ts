// The per-request server prefetch of the one Active entry. Server only: only
// server components import this file (the dashboard layout's sidebar island,
// the /projects overview island and the project page's Active island).
import { connection } from "next/server";
import { cache } from "react";
import { getActiveRuns } from "./index";
import { prefetch } from "./query-client";
import { queryKeys } from "./query-keys";

/**
 * Every visible project's active runs, prefetched into a fresh QueryClient
 * and dehydrated through the shared prefetch helper, at request time.
 *
 * Not "use cache", on purpose. A cache scope that is prerendered into the
 * static shell is read on every resumed request from the shell's Resume Data
 * Cache, frozen at build time, and no tag drop reaches it: a run that started
 * after the build would be missing until a catch-up happened to cover it
 * (issue #69). connection() makes the read request-time instead, so the
 * caller is a hole in the shell, streamed per request, and both clock reads
 * (React Query's settled-query stamp and getActiveRuns's fetched_at) happen
 * after it, never in a prerender pass.
 *
 * React cache(), not "use cache": it only dedupes within one request. The
 * layout and the page render in the same request, so every island that calls
 * this shares one database read and one dehydrated state. Each consumer
 * island renders its own HydrationBoundary with that state as its ancestor,
 * so the entry exists before its consumer renders; hydrating the same state a
 * second time is a no-op (equal dataUpdatedAt, src/data/hydration.test.ts).
 */
export const getActiveRunsState = cache(async () => {
  await connection();
  return prefetch(queryKeys.activeRuns, getActiveRuns);
});
