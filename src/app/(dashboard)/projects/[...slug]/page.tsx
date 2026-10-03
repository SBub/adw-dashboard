import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { ProjectRunsView } from "@/components/ProjectRunsView";
import { QueryBoundary } from "@/components/QueryBoundary";
import { getProjectRuns, getProjects } from "@/data";
import { prefetch } from "@/data/query-client";
import { queryKeys } from "@/data/query-keys";

// Project slugs contain a slash ("owner/repo"), so this is a catch-all
// segment: /projects/SBub/adw-toolkit arrives as ["SBub", "adw-toolkit"] and
// is joined back into the slug the data layer knows.
interface ProjectPageProps {
  params: Promise<{ slug: string[] }>;
}

// Pre-render one page per known project at build time. A catch-all segment
// takes an array per param, so each slug is split back into its parts.
// Slugs not in this list are still served: cacheComponents is on in
// next.config.ts, so Next prerenders a static shell up to the segment's
// loading.tsx boundary and resolves params on request, and an unknown project
// still hits notFound(). (dynamicParams cannot be exported under
// cacheComponents.)
//
// This reads the database at build time, so the Supabase env vars must be
// present for `yarn build`, and a failed read fails the build on purpose.
export async function generateStaticParams() {
  const projects = await getProjects();
  // Under cacheComponents an empty array here is not "prerender nothing": the
  // build errors out, because it has no params to prerender the segment with.
  // An empty database (or a database with no public project yet) must still
  // build, so hand it one placeholder slug. "_/none" is no real owner/repo;
  // getProjectRuns returns null for it and the page falls through to
  // notFound() at request time, exactly like any other unknown slug.
  if (projects.length === 0) return [{ slug: ["_", "none"] }];
  return projects.map((project) => ({ slug: project.slug.split("/") }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getProjectRuns(slug.join("/"));
  return { title: data ? `${data.project.display_name} | ADW Dashboard` : "Not found" };
}

/**
 * One project's runs, prefetched into a fresh QueryClient and dehydrated
 * through the shared prefetch helper, inside a "use cache" scope: the same
 * shape as the layout's getProjectsState, one entry per slug. The helper
 * awaits the query (so the HTML holds the runs, not a pending promise) and
 * does not catch its rejection (so a failed read fails the build or the
 * request loudly, see prefetch in src/data/query-client.ts). It also hands
 * back the resolved data, which is what the not-found decision below reads.
 *
 * The cache scope is required for the same reason as in the layout. React
 * Query stamps the settled query with Date.now(), and under Cache Components a
 * clock read outside a cache scope fails the prerender of every slug in
 * generateStaticParams (next-prerender-current-time). The data itself reads no
 * clock: getProjectRuns returns fixtures whose time-derived labels are
 * precomputed, so the only timestamps inside this scope are React Query's own
 * (see getProjectRuns in src/data/index.ts). Cached, they are the fill time.
 *
 * Tagged twice so a server side writer can refill one project
 * (revalidateTag(`runs:${slug}`)) or every project (revalidateTag("runs")).
 */
async function getRunsState(slug: string) {
  "use cache";
  cacheTag("runs", `runs:${slug}`);

  return prefetch(queryKeys.runs(slug), () => getProjectRuns(slug));
}

// Awaiting params makes this page request-time for slugs outside
// generateStaticParams. The sibling loading.tsx is the Suspense boundary for
// the segment, so the layout and sidebar above it still prerender.
export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug: parts } = await params;
  const slug = parts.join("/");

  const { data, state } = await getRunsState(slug);

  // The not-found decision is made here, before any boundary renders, from the
  // very data that was prefetched: getProjectRuns returns null for an unknown
  // slug, so the data layer is read once per slug, not twice. notFound()
  // renders the segment's not-found.tsx inside the two-pane shell. Caveat kept
  // from before: for a slug outside generateStaticParams the static shell has
  // already been sent with a 200 before this runs, so the not-found panel
  // streams in as a soft 404 (the body says not found, the status does not).
  if (data === null) notFound();

  return (
    // Not nested inside the layout's HydrationBoundary: that one is scoped to
    // the sidebar, and this page renders outside it. Both still hydrate into
    // the one client Providers holds, so the sidebar's entry and this
    // project's entry sit side by side in the same cache.
    <HydrationBoundary state={state}>
      {/* The fallback shows only if the server ever hands over a still-pending
          query. A failed browser fetch lands in the boundary's error panel,
          not in the segment's error.tsx, so the shell stays up. */}
      <QueryBoundary
        fallback={<p className="text-sm text-neutral-500 dark:text-neutral-400">Loading runs...</p>}
        detail="This project's runs did not load."
      >
        <ProjectRunsView slug={slug} />
      </QueryBoundary>
    </HydrationBoundary>
  );
}
