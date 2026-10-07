// The one spelling of the Active query: its key, its reader and its cache
// options, shared by every useSuspenseQuery that reads the Active entry
// (ProjectNav, ActiveRunsOverview, ActiveRunsView), each spreading it and
// adding its own select. Client-safe: it imports the boundary function only,
// nothing server-only.
import { queryOptions } from "@tanstack/react-query";
import { getActiveRuns } from "./index";
import { queryKeys } from "./query-keys";

export const activeRunsQuery = queryOptions({
  queryKey: queryKeys.activeRuns,
  queryFn: getActiveRuns,
  // Same two reasons as ProjectNav's project list: "static" keeps React Query
  // from reading the clock during the client prerender (which would ship the
  // reader as its Suspense fallback), and the data only changes when something
  // writes it with setQueryData, never on a timer.
  staleTime: "static",
  // The hydrated data is stale on arrival; refetching it is the fetch we avoided
  refetchOnMount: false,
});
