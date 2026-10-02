// The query layer over the data boundary. index.ts is still the only place
// that knows where data comes from; this module is what both sides of the
// React Query cache share so they cannot drift apart: the one query key, the
// fetcher that calls the boundary, and the QueryClient factory the server
// prefetch and the browser provider both build from.
import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";
import type { ProjectSummary } from "@/types/adw";
import { getProjects } from "./index";

/**
 * The one key for the project list. The server prefetch and the sidebar's
 * useSuspenseQuery both import it; a key built inline anywhere else would be a
 * cache miss and a second fetch.
 */
export const projectsKey = ["projects"];

/**
 * Runs on the server during the layout's prefetch. In the browser it runs only
 * when the cache has nothing under projectsKey, which the hydration makes rare.
 */
export async function fetchProjects(): Promise<ProjectSummary[]> {
  return getProjects();
}

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
