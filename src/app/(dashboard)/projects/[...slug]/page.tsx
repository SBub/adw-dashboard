import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ActiveRunsView } from "@/components/ActiveRunsView";
import { QueryBoundary } from "@/components/QueryBoundary";
import { RunHistory } from "@/components/RunHistory";
import { getActiveRuns, getCompletedRuns, getProjects } from "@/data";
import { prefetch } from "@/data/query-client";
import { queryKeys } from "@/data/query-keys";
import type { Run } from "@/types/adw";

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
  // getActiveRuns returns null for it and the page falls through to
  // notFound() at request time, exactly like any other unknown slug.
  if (projects.length === 0) return [{ slug: ["_", "none"] }];
  return projects.map((project) => ({ slug: project.slug.split("/") }));
}

// Reads the project through the same cached state function as the page body,
// not through getActiveRuns directly: the read is deduplicated with the body's
// (one database round trip per slug, not two), and getActiveRuns stamps
// fetched_at with the current time, which is only allowed inside a "use cache"
// scope during the prerender.
export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await getRunsState(slug.join("/"));
  return { title: data ? `${data.project.display_name} | ADW Dashboard` : "Not found" };
}

/**
 * One project's active runs, prefetched into a fresh QueryClient and
 * dehydrated through the shared prefetch helper, inside a "use cache" scope:
 * the same shape as the layout's getProjectsState, one entry per slug. The
 * helper awaits the query (so the HTML holds the runs, not a pending promise)
 * and does not catch its rejection (so a failed read fails the build or the
 * request loudly, see prefetch in src/data/query-client.ts). It also hands
 * back the resolved data, which is what the not-found decision below reads.
 *
 * The cache scope is required for the same reason as in the layout. React
 * Query stamps the settled query with Date.now(), and under Cache Components a
 * clock read outside a cache scope fails the prerender of every slug in
 * generateStaticParams (next-prerender-current-time). The data layer reads the
 * clock once more, for fetched_at (see getActiveRuns in src/data/index.ts),
 * which is likewise only permitted because it happens in here. Cached, both
 * are the fill time. The rows carry no derived labels and the UI reads no
 * clock either (relative labels are removed pending issue #3).
 *
 * Tagged twice so a server side writer can refill one project
 * (`runs:${slug}`, which the revalidateHistory action drops after a
 * completion so a refresh does not re-serve an Active list that still holds
 * the finished run) or every project (`runs`).
 */
async function getRunsState(slug: string) {
  "use cache";
  cacheTag("runs", `runs:${slug}`);

  return prefetch(queryKeys.runs(slug), () => getActiveRuns(slug));
}

/**
 * One project's completed runs, read inside a "use cache" scope tagged
 * `history:${slug}`. Plain rows, no clock read: getCompletedRuns stamps
 * nothing, so this scope is here for the lifetime and the tag, not for a
 * clock-read permission. The rows never enter the React Query cache and no
 * Realtime event touches them. A completed run is immutable, so the entry is
 * only wrong when a run completes (or a completed run is deleted), and that is
 * when the browser calls the revalidateHistory action (dropping this tag) and
 * then refreshes the route, which re-renders HistorySection from the database.
 */
async function getHistory(slug: string): Promise<Run[]> {
  "use cache";
  cacheTag(`history:${slug}`);

  return getCompletedRuns(slug);
}

// The History half of the pane, an async server component. It reads through
// the cached getHistory and hands the rows to RunHistory as stored. It renders
// under its own Suspense boundary so the Active half above never waits on it.
//
// `await connection()` comes first so this section is a request-time hole in
// the prerendered page rather than part of its static shell. A "use cache"
// scope that is prerendered into the shell is read, on every later request,
// from the shell's embedded Resume Data Cache (debug log: "use-cache: Resume
// Data Cache entry found"), which is frozen at build time; updateTag expires
// the live cache entry and re-executes getHistory, but a resumed render never
// consults the live handler for that scope, so the new rows are never served.
// Made a hole, the scope is resolved per request from the live cache handler,
// and the tag reaches it. The scope keeps its default cacheLife, so history is
// still cached between completions (observed: getHistory runs at build and
// once after the tag update, not per request). The documented alternative is
// a cacheLife with `expire` under 5 minutes, which also excludes the scope
// from prerenders (node_modules/next/dist/docs/01-app/03-api-reference/
// 04-functions/cacheLife.md, "Prerendering behavior"); connection() is
// preferred because it keeps the long lifetime (connection.md: "prerendering
// stops here"). The Suspense boundary below is therefore a real streaming
// boundary: the shell ships the fallback and this section streams in.
//
// The same limitation applies to the Active prefetch scope (runs:<slug>),
// which IS prerendered into the shell: updateTag("runs:<slug>") does not
// refresh it on a resumed render. That is left as is on purpose. The browser
// patches Active through Realtime, hydration skips a dehydrated state older
// than the live entry (src/data/hydration.test.ts), and the catch-up on every
// SUBSCRIBED re-reads it. The action keeps dropping the tag because it is
// correct on a full regeneration of the page and on hosts whose cache handler
// behaves differently.
async function HistorySection({ slug }: { slug: string }) {
  await connection();
  const runs = await getHistory(slug);
  return <RunHistory runs={runs} projectSlug={slug} />;
}

// Awaiting params makes this page request-time for slugs outside
// generateStaticParams. The sibling loading.tsx is the Suspense boundary for
// the segment, so the layout and sidebar above it still prerender.
export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug: parts } = await params;
  const slug = parts.join("/");

  const { data, state } = await getRunsState(slug);

  // The not-found decision is made here, before any boundary renders, from the
  // very data that was prefetched: getActiveRuns returns null for an unknown
  // slug, so the data layer is read once per slug, not twice. notFound()
  // renders the segment's not-found.tsx inside the two-pane shell. Caveat kept
  // from before: for a slug outside generateStaticParams the static shell has
  // already been sent with a 200 before this runs, so the not-found panel
  // streams in as a soft 404 (the body says not found, the status does not).
  if (data === null) notFound();

  return (
    <>
      {/* Not nested inside the layout's HydrationBoundary: that one is scoped
          to the sidebar, and this page renders outside it. Both still hydrate
          into the one client Providers holds, so the sidebar's entry and this
          project's entry sit side by side in the same cache. On a
          router.refresh() the boundary receives a state again; React Query
          only overwrites the entry when the incoming dataUpdatedAt is newer
          (src/data/hydration.test.ts), so a live entry is never set back. */}
      <HydrationBoundary state={state}>
        {/* The fallback shows only if the server ever hands over a still-pending
            query. A failed browser fetch lands in the boundary's error panel,
            not in the segment's error.tsx, so the shell stays up. */}
        <QueryBoundary
          fallback={
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading runs...</p>
          }
          detail="This project's runs did not load."
        >
          <ActiveRunsView slug={slug} />
        </QueryBoundary>
      </HydrationBoundary>

      {/* Server-rendered, not hydrated: no query, no boundary of the query
          kind. HistorySection awaits connection(), so this boundary is a real
          streaming boundary: the prerendered shell carries the fallback and
          the section streams in at request time (from the cached scope, or
          from the database on a miss after a completion or the lifetime). */}
      <Suspense
        fallback={
          <section>
            <h2 className="mb-3 text-lg font-semibold">History</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading history...</p>
          </section>
        }
      >
        <HistorySection slug={slug} />
      </Suspense>
    </>
  );
}
