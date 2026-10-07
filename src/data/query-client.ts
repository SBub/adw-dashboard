// The one QueryClient factory, and the one server prefetch built on it. The
// server prefetches (the layout's project list, the per-request Active
// entry, a project page's queue and the summary's today card) and the browser provider all build from the factory, so every side of
// the React Query cache agrees on the dehydrate rule. With query-keys.ts it is the whole
// query layer: the fetchers are the data boundary functions in index.ts
// themselves.
import {
  type DehydratedState,
  defaultShouldDehydrateQuery,
  dehydrate,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

/** One factory for the server and the browser, so both agree on the dehydrate rule. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      dehydrate: {
        // Hand over a prefetch that is still pending, not only settled ones
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  });
}

/**
 * The server-side prefetch every `"use cache"` state function wraps: a fresh
 * client, one awaited query, and its dehydrated state. The resolved data is
 * returned next to the state so a caller that needs the value reads it
 * straight back, rather than digging it out of the dehydrated queries by
 * hash.
 *
 * The await means the query is settled when dehydrate runs, so the HTML holds
 * the data rather than a pending promise. The rejection is deliberately not
 * caught: query() rejects when the fetcher throws, and swallowing that
 * (.catch(noop), the documented option) would dehydrate an empty cache and
 * serve the fallback with no sign anything went wrong. Letting it throw fails
 * the build or the request loudly instead.
 *
 * Callers run this inside a `"use cache"` scope (or, for the Active entry,
 * after connection() in getActiveRunsState), so the return value must be
 * serialisable: DehydratedState is plain JSON, and the data is plain rows (or
 * the plain object getActiveRuns builds from them).
 */
export async function prefetch<T>(
  queryKey: QueryKey,
  queryFn: () => T | Promise<T>,
): Promise<{ data: T; state: DehydratedState }> {
  const queryClient = makeQueryClient();
  const data = await queryClient.query({ queryKey, queryFn });
  return { data, state: dehydrate(queryClient) };
}
