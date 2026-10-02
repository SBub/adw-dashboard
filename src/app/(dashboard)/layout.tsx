import { type DehydratedState, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { cacheTag } from "next/cache";
import { type ReactNode, Suspense } from "react";
import { ProjectNav } from "@/components/ProjectNav";
import { fetchProjects, makeQueryClient, projectsKey } from "@/data/projects-query";
import { Providers } from "../providers";

/**
 * The project list, prefetched into a fresh QueryClient and dehydrated, inside
 * a "use cache" scope.
 *
 * The cache scope is not optional. React Query stamps the settled query with
 * Date.now(), and under Cache Components reading the current time outside a
 * cache scope fails the prerender of "/" (next-prerender-current-time; the
 * build points at the prefetchQuery line). The other ways out are worse:
 * connection() would make every route dynamic, and a client-side fetch is the
 * duplicate fetch this pattern exists to avoid. Cached, the timestamp is simply
 * the fill time. The tag lets a future data source call revalidateTag("projects").
 */
async function getProjectsState(): Promise<DehydratedState> {
  "use cache";
  cacheTag("projects");

  const queryClient = makeQueryClient();
  // The await means the query is settled when dehydrate runs, so the HTML
  // holds the list rather than a pending promise.
  await queryClient.prefetchQuery({ queryKey: projectsKey, queryFn: fetchProjects });

  return dehydrate(queryClient);
}

// Master-detail shell shared by "/" and "/projects/[...slug]". The project
// list is prefetched once here, in a server layout, into a React Query cache
// that is dehydrated into the HTML and hydrated in the browser, so the sidebar
// renders with its data on the first paint and never fetches it again on
// mount. The sidebar is a client component so a later Realtime subscription
// can update the same cache entry in place.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <HydrationBoundary state={await getProjectsState()}>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:items-start md:gap-8">
          <aside className="shrink-0 md:sticky md:top-6 md:max-h-[calc(100vh-5.5rem)] md:w-72 md:overflow-y-auto">
            <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Projects
            </h2>
            {/* The fallback shows if the server ever hands over a still-pending
                query, and in the partial-prerender shell for a slug outside
                generateStaticParams, where usePathname suspends until request
                time and the sidebar streams in behind it. */}
            <Suspense
              fallback={
                <p className="px-1 text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
              }
            >
              <ProjectNav />
            </Suspense>
          </aside>
          <section className="min-w-0 flex-1">{children}</section>
        </div>
      </HydrationBoundary>
    </Providers>
  );
}
