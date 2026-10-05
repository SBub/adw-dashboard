import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { ActiveRunsView } from "@/components/ActiveRunsView";
import { HistoryLinks } from "@/components/HistoryLinks";
import { HistorySearch, HistorySearchFallback } from "@/components/HistorySearch";
import { HistoryResults, HistoryTransition } from "@/components/HistoryTransition";
import { QueryBoundary } from "@/components/QueryBoundary";
import { QueueView } from "@/components/QueueView";
import { RunHistoryList } from "@/components/RunHistoryList";
import { SectionBoundary } from "@/components/SectionBoundary";
import { SectionHeading } from "@/components/SectionHeading";
import { getActiveRuns, getCompletedRuns, getProjects, getQueue } from "@/data";
import { prefetch } from "@/data/query-client";
import { queryKeys } from "@/data/query-keys";
import {
  type HistoryBookmark,
  type HistoryPage,
  historyHref,
  readHistoryBookmark,
} from "@/lib/history-bookmark";
import { readHistoryQuery } from "@/lib/history-search";
import { historyTag, runsTag } from "@/lib/history-tags";

// A project slug is exactly "owner/repo", so the route has two named
// segments: /projects/SBub/adw-toolkit arrives as
// { owner: "SBub", repo: "adw-toolkit" }. The page assembles the slug once
// (projectSlug below) and everything below it takes the slug.
interface ProjectPageProps {
  params: Promise<ProjectParams>;
  searchParams: Promise<SearchParams>;
}

interface ProjectParams {
  owner: string;
  repo: string;
}

type SearchParams = { [key: string]: string | string[] | undefined };

// The one place the slug is joined from the route's two params.
function projectSlug({ owner, repo }: ProjectParams) {
  return `${owner}/${repo}`;
}

// Pre-render one page per known project at build time. Each slug is split at
// its one slash into the route's two named params, owner and repo.
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
  // build, so hand it one placeholder pair. owner "_" and repo "none" are no
  // real project; getActiveRuns returns null for "_/none" and the page falls
  // through to notFound() at request time, exactly like any other unknown slug.
  if (projects.length === 0) return [{ owner: "_", repo: "none" }];
  // A slug from the database always has exactly one slash (the toolkit's
  // owner/repo).
  return projects.map((project) => {
    const i = project.slug.indexOf("/");
    return { owner: project.slug.slice(0, i), repo: project.slug.slice(i + 1) };
  });
}

// Reads the project through the same cached state function as the page body,
// not through getActiveRuns directly: the read is deduplicated with the body's
// (one database round trip per slug, not two), and getActiveRuns stamps
// fetched_at with the current time, which is only allowed inside a "use cache"
// scope during the prerender.
export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { data } = await getRunsState(projectSlug(await params));
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
 * (`runs:${slug}`, which the revalidateHistory action and the /api/revalidate
 * route handler drop after a completion so a refresh does not re-serve an
 * Active list that still holds the finished run) or every project (`runs`).
 * The per-project spelling comes from src/lib/history-tags.ts, shared with
 * the two places that drop it.
 */
async function getRunsState(slug: string) {
  "use cache";
  cacheTag("runs", runsTag(slug));

  return prefetch(queryKeys.runs(slug), () => getActiveRuns(slug));
}

/**
 * One project's queued items, prefetched and dehydrated through the same
 * helper as getRunsState, and inside a "use cache" scope for the same reason:
 * React Query's query() and dehydrate read the clock. getQueue itself reads no
 * clock. No tag: no server writer drops it (the queue is not part of the
 * completion move, and the action and the route handler drop
 * historyTags(slug) only). Like the Active scope it lives in the static shell,
 * and the browser keeps it current through Realtime, the hydration rule and
 * the catch-up on every SUBSCRIBED.
 */
async function getQueueState(slug: string) {
  "use cache";

  return prefetch(queryKeys.queue(slug), () => getQueue(slug));
}

/**
 * One page of a project's completed runs, read inside a "use cache" scope
 * tagged `history:${slug}`. Plain rows, no clock read: getCompletedRuns stamps
 * nothing, so this scope is here for the lifetime and the tag, not for a
 * clock-read permission.
 *
 * Every page of a project carries the same tag on purpose, never a per-page
 * one: a completion adds a row at the head and so changes what page one
 * holds and every page's "N of M" (the two counts are read in this same
 * scope, next to the rows), and one tag drop must reach all of them. The
 * bookmark is a plain serialisable argument (its direction included), so it is
 * part of the cache key: one entry per page, all under that tag. The search
 * text q is a plain string (or null), normalised outside the scope, so each
 * search is its own entry too, under the same tag, never a per-query one. The lifetime
 * is explicit (stale 5 minutes, background refresh after a day, expiry after
 * 30 days); a completion drops the tag long before that. The rows never enter the React Query cache and no
 * Realtime event touches them. A completed run is immutable, so the entry is
 * only wrong when a run completes (or a completed run is deleted), and that is
 * when the browser calls the revalidateHistory action (dropping this tag) and
 * then refreshes the route, which re-renders the two History islands from the
 * database, or, for a completion no browser saw, when the database trigger posts to
 * /api/revalidate, which drops the same tag. Its spelling comes from
 * src/lib/history-tags.ts, shared with both.
 */
async function getHistory(
  slug: string,
  bookmark: HistoryBookmark | null,
  q: string | null,
): Promise<HistoryPage> {
  "use cache";
  cacheTag(historyTag(slug));
  cacheLife({ stale: 300, revalidate: 86400, expire: 2592000 });

  return getCompletedRuns(slug, bookmark, q);
}

// The History half of the pane: three async server components, the search box
// (HistorySearchBox), the arrows and the page indicator (HistoryPagination) and the list
// (CompletedRuns), each under its own SectionBoundary (Suspense plus an error
// boundary) so the Active half above never waits on them and never falls with
// them. The History heading (SectionHeading) is not part of any: it sits in the page, beside and above
// the boundaries, in the static shell.
//
// The search box island is a hole only for its initial text (the normalised
// `?q`); it calls no cache scope. The box itself rewrites the URL, and the two
// other islands read `q` next to `after` and `before`.
//
// Each island awaits the page's searchParams first. That is a request-time
// read, so under cacheComponents prerendering stops there and the hole is cut
// at the nearest Suspense, which is the island's own SectionBoundary. A
// hole is needed at all because a "use cache" scope that is prerendered into
// the shell is read, on every later request, from the shell's embedded Resume
// Data Cache (debug log: "use-cache: Resume Data Cache entry found"), which is
// frozen at build time; updateTag expires the live cache entry and re-executes
// getHistory, but a resumed render never consults the live handler for that
// scope, so the new rows are never served. Made a hole, the scope is resolved
// per request from the live cache handler, and the tag reaches it. The scope
// keeps its long explicit cacheLife, so history is still cached between
// completions (getHistory runs at build and once after the tag update, not per
// request). There is no connection() call: after the searchParams read it
// would be a redundant second marker. The documented alternative, a cacheLife
// with `expire` under 5 minutes (node_modules/next/dist/docs/01-app/
// 03-api-reference/04-functions/cacheLife.md, "Prerendering behavior"), is
// rejected because it gives up the long lifetime.
//
// Two islands are one read: getHistory is keyed by its arguments (the slug and
// a plain bookmark object with the same values in both), and Next joins an
// identical invocation within one request instead of running it twice
// (use-cache-wrapper.js, debug line "joining intra-request invocation" on a
// ?after or ?before page; on page one the second call logs nothing and still reads
// nothing).
//
// The same Resume Data Cache limitation applies to the Active prefetch scope
// (runs:<slug>), which IS prerendered into the shell: updateTag("runs:<slug>")
// does not refresh it on a resumed render. That is left as is on purpose. The
// browser patches Active through Realtime, hydration skips a dehydrated state
// older than the live entry (src/data/hydration.test.ts), and the catch-up on
// every SUBSCRIBED re-reads it. The action keeps dropping the tag because it
// is correct on a full regeneration of the page and on hosts whose cache
// handler behaves differently.
//
// `?after`, `?before` and `?q` are decoded here, outside the cache scope (an
// error thrown inside "use cache" loses its class); an invalid, foreign or
// mismatched-direction bookmark is page one, and an empty or repeated `q` is
// no search, never an error. readHistory is neither cached nor a boundary
// function; it only keeps the two islands from repeating the same lines.
async function readHistory(slug: string, searchParams: Promise<SearchParams>) {
  const { after, before, q: rawQuery } = await searchParams;
  const bookmark = readHistoryBookmark(after, before, slug);
  const q = readHistoryQuery(rawQuery);
  const page = await getHistory(slug, bookmark, q);
  return { q, ...page };
}

interface HistoryIslandProps {
  slug: string;
  searchParams: Promise<SearchParams>;
}

async function HistorySearchBox({ slug, searchParams }: HistoryIslandProps) {
  const { q } = await searchParams;
  return <HistorySearch slug={slug} initial={readHistoryQuery(q) ?? ""} />;
}

async function HistoryPagination({ slug, searchParams }: HistoryIslandProps) {
  const { q, page, pageCount, hasNewer, newerCursor, olderCursor } = await readHistory(
    slug,
    searchParams,
  );
  return (
    <HistoryLinks
      newerHref={hasNewer ? historyHref(slug, newerCursor, q) : null}
      olderHref={olderCursor ? historyHref(slug, olderCursor, q) : null}
      page={page}
      pageCount={pageCount}
    />
  );
}

async function CompletedRuns({ slug, searchParams }: HistoryIslandProps) {
  const { q, items } = await readHistory(slug, searchParams);
  return (
    <RunHistoryList
      runs={items}
      projectSlug={slug}
      emptyMessage={q ? `No completed runs match "${q}".` : "No completed runs yet."}
    />
  );
}

// Awaiting params makes this page request-time for slugs outside
// generateStaticParams. The sibling loading.tsx is the Suspense boundary for
// the segment, so the layout and sidebar above it still prerender.
// searchParams is handed to HistorySearchBox, HistoryPagination and
// CompletedRuns unawaited: only those request-time holes read it.
export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const slug = projectSlug(await params);

  // Both prefetches at once, so the queue read does not wait on the runs read.
  const [{ data, state }, queue] = await Promise.all([getRunsState(slug), getQueueState(slug)]);

  // The not-found decision is made here, before any boundary renders, from the
  // very data that was prefetched: getActiveRuns returns null for an unknown
  // slug, so the data layer is read once per slug, not twice. The queue is not
  // consulted (getQueue returns an empty list for an unknown slug, never shown). notFound()
  // renders the segment's not-found.tsx inside the two-pane shell. Caveat kept
  // from before: for a slug outside generateStaticParams the static shell has
  // already been sent with a 200 before this runs, so the not-found panel
  // streams in as a soft 404 (the body says not found, the status does not).
  if (data === null) notFound();

  // The section copy lives here, next to the sections. The Queue and Active
  // headings are slotted into their client views, so every heading stays a
  // server component; History's is rendered below, in the static shell.
  const queueHeading = (
    <SectionHeading
      title="Queue"
      description={
        <>
          Issues waiting for their turn. An issue joins when its repository labels it{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
            adw:queued
          </code>
          ; removing the label withdraws it. Runs start one at a time per project, in this order.
        </>
      }
      detail="Items added by hand show a manual marker; those stay until removed by hand."
    />
  );
  const activeHeading = (
    <SectionHeading
      title="Active"
      description="Runs in progress, and runs that failed and can be resumed. Each run plans, builds, tests, reviews and documents a change, then opens a pull request. The row updates live as phases complete."
      detail="A failed run keeps its branch and can be resumed from the phase that failed, which is why it stays here rather than in history."
    />
  );

  // The queue's own entry, under its own boundaries, slotted into
  // ActiveRunsView between the header and Active: a failed queue read shows
  // its panel in this slot while the header and Active stay up.
  const queueSection = (
    <HydrationBoundary state={queue.state}>
      <QueryBoundary
        fallback={
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading queue...</p>
        }
        detail="This project's queue did not load."
      >
        <QueueView slug={slug} heading={queueHeading} />
      </QueryBoundary>
    </HydrationBoundary>
  );

  return (
    <>
      {/* Two HydrationBoundary elements here, one per entry (the runs below,
          the queue in queueSection). Neither is nested inside the layout's:
          that one is scoped to the sidebar, and this page renders outside it.
          All hydrate into the one client Providers holds, so the sidebar's
          entry and this project's entries sit side by side in the same cache. On a
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
          <ActiveRunsView slug={slug} queue={queueSection} heading={activeHeading} />
        </QueryBoundary>
      </HydrationBoundary>

      {/* Server-rendered, not hydrated: no query, so not a QueryBoundary but a
          SectionBoundary, whose Retry refreshes the route instead of resetting
          a query. The heading (SectionHeading, with the search boundary in
          its controls slot and the pagination boundary in its actions slot)
          is static and in the prerendered
          shell, outside every boundary. Each
          island awaits searchParams, so the Suspense inside its boundary is a
          real streaming boundary: the shell carries the fallback (nothing for
          the links, a loading line for the list) and the island streams in at
          request time (from the cached scope, or from the database on a miss
          after a completion or the lifetime). If getHistory throws (database
          down, an RLS change), the error lands in that island's panel, in its
          slot, and the Active list above and the other island stay on screen,
          instead of the segment's error.tsx replacing the pane. A server
          component is a fine child of this client boundary; the hole
          semantics are unchanged. HistoryTransition holds the one transition
          the search box navigates in; HistoryResults dims the list while it is
          pending. A search-param-only navigation keeps the segment and a
          transition never re-hides revealed content, so the list dims instead
          of falling back to its loading line. */}
      <HistoryTransition>
        <section>
          <SectionHeading
            title="History"
            description="Completed runs, newest first. A run completes when its pull request was merged by the merge gate: tests green, review without blockers, CI green."
            detail="Completed runs never change, so this list is cached and only refreshed when a new run completes."
            controls={
              <SectionBoundary fallback={<HistorySearchFallback />} detail="Search did not load.">
                <HistorySearchBox slug={slug} searchParams={searchParams} />
              </SectionBoundary>
            }
            actions={
              <SectionBoundary fallback={null} detail="Pagination did not load.">
                <HistoryPagination slug={slug} searchParams={searchParams} />
              </SectionBoundary>
            }
          />
          <HistoryResults>
            <SectionBoundary
              fallback={
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading history...</p>
              }
              detail="This project's history did not load."
            >
              <CompletedRuns slug={slug} searchParams={searchParams} />
            </SectionBoundary>
          </HistoryResults>
        </section>
      </HistoryTransition>
    </>
  );
}
