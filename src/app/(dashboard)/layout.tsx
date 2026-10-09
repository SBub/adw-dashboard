import { HydrationBoundary } from "@tanstack/react-query";
import { cacheTag } from "next/cache";
import type { ReactNode } from "react";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { ProjectNavSkeleton } from "@/components/LoadingSkeletons";
import { ProjectNav } from "@/components/ProjectNav";
import { QueryBoundary } from "@/components/QueryBoundary";
import { SectionBoundary } from "@/components/SectionBoundary";
import { WorkerStatus } from "@/components/WorkerStatus";
import { getProjects } from "@/data";
import { getActiveRunsState } from "@/data/active-runs-state";
import { prefetch } from "@/data/query-client";
import { queryKeys } from "@/data/query-keys";
import { Providers } from "../providers";

/**
 * The project list, prefetched into a fresh QueryClient and dehydrated through
 * the shared prefetch helper, inside a "use cache" scope. The helper awaits the
 * query (so the HTML holds the list, not a pending promise) and does not catch
 * its rejection (so a failed read fails the build or the request loudly, see
 * prefetch in src/data/query-client.ts).
 *
 * The cache scope is not optional. React Query stamps the settled query with
 * Date.now(), and under Cache Components reading the current time outside a
 * cache scope fails the prerender of "/projects" (next-prerender-current-time; the
 * build points at the query() line). The other ways out are worse:
 * connection() would make every route dynamic, and a client-side fetch is the
 * duplicate fetch this pattern exists to avoid. Cached, the timestamp is simply
 * the fill time.
 *
 * The read inside is a network call now (the adw.project_summaries view), made
 * at build time and again whenever this cache entry is refilled. The default
 * cacheLife (15 minutes) is kept on purpose: this list is only the starting
 * point for the static shell, and the Realtime channel that Providers opens is
 * what keeps the browser's copy fresh, so a tighter server cache would buy
 * nothing except more build-time and revalidation reads. The tag lets a server
 * side writer force a refill early with revalidateTag("projects").
 */
async function getProjectsState() {
  "use cache";
  cacheTag("projects");

  return prefetch(queryKeys.projects, getProjects);
}

/**
 * The sidebar's list, a request-time island. ProjectNav counts each project's
 * running and failed runs from the one Active entry, which is read per
 * request (getActiveRunsState awaits connection(), so this is a hole in the
 * static shell and never frozen into it) and hydrated here, as the
 * consumer's own ancestor, so the entry exists before ProjectNav renders.
 * The page's Active islands call the same function in the same request and
 * share its one read (React cache()).
 */
async function SidebarActiveRuns() {
  const { state } = await getActiveRunsState();

  return (
    <HydrationBoundary state={state}>
      <QueryBoundary fallback={<ProjectNavSkeleton />} detail="The project list did not load.">
        <ProjectNav />
      </QueryBoundary>
    </HydrationBoundary>
  );
}

// Master-detail shell shared by "/projects" and "/projects/[owner]/[repo]". The project
// list is prefetched once here, in a server layout, into a React Query cache
// that is dehydrated into the HTML and hydrated in the browser, and the Active
// entry is read per request by the sidebar island, so the sidebar renders
// with its data on the first paint and never fetches either again on mount. The sidebar is a client component so a later Realtime subscription
// can update the same cache entry in place.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Only the dehydrated state is needed here; the sidebar reads the list from
  // the cache once it is hydrated.
  const { state } = await getProjectsState();

  return (
    <Providers>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:items-start md:gap-8">
        <aside className="flex shrink-0 flex-col gap-2 md:sticky md:top-[calc(var(--header-height)+1.5rem)] md:h-[calc(100vh-var(--header-height)-3rem)] md:w-72">
          {/* The connection pill lives here, not in the root header, because
              the channel it describes is opened by Providers in this layout.
              The summary at / has no channel and no pill. It reads no query, so it
              sits outside the sidebar's boundaries and their fallbacks. */}
          <div className="flex shrink-0 items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Projects
            </h2>
            <ConnectionIndicator />
          </div>
          {/* The projects HydrationBoundary is scoped to the sidebar; the
              /projects overview reads the same entry, which this boundary
              has already filled in the client Providers holds by the time
              the page's islands stream in. The list itself is a request-time
              island (SidebarActiveRuns) under a SectionBoundary: its Suspense
              is the hole the shell carries as the sidebar skeleton
              (ProjectNavSkeleton, the same element as the inner
              QueryBoundary's, never both at once), and a failed
              Active read lands in its panel, not in the segment's error.tsx,
              so the shell stays up. From md up the aside is a full-height
              column and the list scrolls inside this wrapper, so the worker
              widget below stays in view. */}
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
            <HydrationBoundary state={state}>
              <SectionBoundary
                fallback={<ProjectNavSkeleton />}
                detail="The project list did not load."
              >
                <SidebarActiveRuns />
              </SectionBoundary>
            </HydrationBoundary>
          </div>
          {/* The worker widget is here because the (dashboard) layout is the
              operator's view; / has no sidebar and no widget. It reads no
              query (it polls its own store in the browser), so it sits
              outside every boundary and never inside a fallback. On mobile
              it follows the project strip. */}
          <div className="mt-2 shrink-0 border-t border-neutral-200 px-1 pt-3 dark:border-neutral-800">
            <WorkerStatus />
          </div>
        </aside>
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </Providers>
  );
}
