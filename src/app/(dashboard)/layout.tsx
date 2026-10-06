import { HydrationBoundary } from "@tanstack/react-query";
import { cacheTag } from "next/cache";
import type { ReactNode } from "react";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { ProjectNav } from "@/components/ProjectNav";
import { QueryBoundary } from "@/components/QueryBoundary";
import { getProjects } from "@/data";
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

// Master-detail shell shared by "/projects" and "/projects/[owner]/[repo]". The project
// list is prefetched once here, in a server layout, into a React Query cache
// that is dehydrated into the HTML and hydrated in the browser, so the sidebar
// renders with its data on the first paint and never fetches it again on
// mount. The sidebar is a client component so a later Realtime subscription
// can update the same cache entry in place.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Only the dehydrated state is needed here; the sidebar reads the list from
  // the cache once it is hydrated.
  const { state } = await getProjectsState();

  return (
    <Providers>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:items-start md:gap-8">
        <aside className="shrink-0 md:sticky md:top-6 md:max-h-[calc(100vh-5.5rem)] md:w-72 md:overflow-y-auto">
          {/* The connection pill lives here, not in the root header, because
              the channel it describes is opened by Providers in this layout.
              The summary at / has no channel and no pill. It reads no query, so it
              sits outside the sidebar's boundaries and their fallbacks. */}
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Projects
            </h2>
            <ConnectionIndicator />
          </div>
          {/* The HydrationBoundary is scoped to the sidebar because ProjectNav
              is the only consumer of the dehydrated project list; the page's
              own boundary hydrates its runs into the same client Providers
              holds, so nothing below needs to sit inside this one. The
              fallback shows if the server ever hands over a still-pending
              query, and in the partial-prerender shell for a slug outside
              generateStaticParams, where usePathname suspends until request
              time and the sidebar streams in behind it. A failed browser
              fetch lands in the boundary's error panel, not in the segment's
              error.tsx, so the shell stays up. QueryBoundary sits inside
              Providers, where the query it guards has its client. */}
          <HydrationBoundary state={state}>
            <QueryBoundary
              fallback={
                <p className="px-1 text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
              }
              detail="The project list did not load."
            >
              <ProjectNav />
            </QueryBoundary>
          </HydrationBoundary>
        </aside>
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </Providers>
  );
}
