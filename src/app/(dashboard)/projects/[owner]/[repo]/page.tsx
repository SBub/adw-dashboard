import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActiveRunsView } from "@/components/ActiveRunsView";
import { HistoryLinks } from "@/components/HistoryLinks";
import { HistorySearch, HistorySearchFallback } from "@/components/HistorySearch";
import { HistoryResults, HistoryTransition } from "@/components/HistoryTransition";
import {
  ActiveRunsViewSkeleton,
  HistoryLinksSkeleton,
  QueueViewSkeleton,
  RunListSkeleton,
} from "@/components/LoadingSkeletons";
import { PageHeader } from "@/components/PageHeader";
import { QueryBoundary } from "@/components/QueryBoundary";
import { QueueView } from "@/components/QueueView";
import { RunHistoryList } from "@/components/RunHistoryList";
import { SectionBoundary } from "@/components/SectionBoundary";
import { SectionHeading } from "@/components/SectionHeading";
import { getCompletedRuns, getProjects, getQueue } from "@/data";
import { getActiveRunsState } from "@/data/active-runs-state";
import { prefetch } from "@/data/query-client";
import { queryKeys } from "@/data/query-keys";
import {
  HISTORY_PAGE_SIZE,
  type HistoryBookmark,
  type HistoryPage,
  historyHref,
  readHistoryBookmark,
} from "@/lib/history-bookmark";
import { readHistoryQuery } from "@/lib/history-search";
import { historyTag } from "@/lib/history-tags";

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
  // real project; "_/none" is not in the project list, so getProject returns
  // null and the page falls through to notFound(), like any other unknown slug.
  if (projects.length === 0) return [{ owner: "_", repo: "none" }];
  // A slug from the database always has exactly one slash (the toolkit's
  // owner/repo).
  return projects.map((project) => {
    const i = project.slug.indexOf("/");
    return { owner: project.slug.slice(0, i), repo: project.slug.slice(i + 1) };
  });
}

/**
 * The project for a slug, found in the project list, or null for an unknown
 * slug. The header, the metadata and the not-found decision all read it. A
 * "use cache" scope, tagged like the layout's project list ("projects"), so
 * generateMetadata and the page body share one read per slug and a server
 * side writer refills both with revalidateTag("projects"). It reads no clock.
 * Active is not read here: it is a request-time island (ProjectActiveRuns).
 */
async function getProject(slug: string) {
  "use cache";
  cacheTag("projects");

  return (await getProjects()).find((project) => project.slug === slug) ?? null;
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const project = await getProject(projectSlug(await params));
  return { title: project ? `${project.display_name} | ADW Dashboard` : "Not found" };
}

/**
 * One project's queued items, prefetched and dehydrated through the shared
 * prefetch helper, inside a "use cache" scope: React Query's query() and
 * dehydrate read the clock, which under Cache Components is only allowed in a
 * cache scope during the prerender. getQueue itself reads no clock. No tag: no
 * server writer drops it (the queue is not part of the completion move, and
 * the action and the route handler drop historyTags(slug) only). It lives in
 * the static shell, and the browser keeps it current through Realtime, the
 * hydration rule and the catch-up on every SUBSCRIBED.
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
// Active is not a cache scope at all, for the same Resume Data Cache reason:
// ProjectActiveRuns below reads the one all-projects entry per request, after
// connection() (getActiveRunsState), so it is never frozen into the shell.
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

/**
 * The Active half of the pane, a request-time island: it awaits the one
 * all-projects Active entry (getActiveRunsState, per request, shared with the
 * sidebar's island through React cache()) and hydrates it as the consumer's
 * own ancestor, so the entry exists before ActiveRunsView renders and selects
 * this project's rows from it.
 */
async function ProjectActiveRuns({
  projectId,
  slug,
  heading,
  queue,
  fallback,
}: {
  projectId: string;
  slug: string;
  heading: ReactNode;
  queue: ReactNode;
  fallback: ReactNode;
}) {
  const { state } = await getActiveRunsState();

  return (
    <HydrationBoundary state={state}>
      {/* The fallback shows only if the server ever hands over a still-pending
          query; it is the page's Active skeleton, the same element as the
          outer SectionBoundary's (this boundary renders only after that one
          resolved, so the two never stack). A failed browser fetch lands in
          the boundary's error panel, not in the segment's error.tsx, so the
          shell stays up. */}
      <QueryBoundary fallback={fallback} detail="This project's runs did not load.">
        <ActiveRunsView projectId={projectId} slug={slug} heading={heading} queue={queue} />
      </QueryBoundary>
    </HydrationBoundary>
  );
}

// Awaiting params makes this page request-time for slugs outside
// generateStaticParams. The sibling loading.tsx is the Suspense boundary for
// the segment, so the layout and sidebar above it still prerender.
// searchParams is handed to HistorySearchBox, HistoryPagination and
// CompletedRuns unawaited: only those request-time holes read it.
export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const slug = projectSlug(await params);

  // Both reads at once, so the queue read does not wait on the project read.
  const [project, queue] = await Promise.all([getProject(slug), getQueueState(slug)]);

  // The not-found decision is made here, before any boundary renders, from the
  // project list (getProject, shared with generateMetadata). The queue is not
  // consulted (getQueue returns an empty list for an unknown slug, never shown). notFound()
  // renders the segment's not-found.tsx inside the two-pane shell. Caveat kept
  // from before: for a slug outside generateStaticParams the static shell has
  // already been sent with a 200 before this runs, so the not-found panel
  // streams in as a soft 404 (the body says not found, the status does not).
  if (project === null) notFound();

  // The section copy lives here, next to the sections. The Queue and Active
  // headings are slotted into their client views, so every heading stays a
  // server component; History's is rendered below, in the static shell.
  const queueHeading = (
    <SectionHeading
      title="Queue"
      description={
        <>
          First in, first out. The top item starts when the running one finishes. An issue joins
          when its repository labels it{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
            adw:queued
          </code>
          ; removing the label withdraws it.
        </>
      }
      detail="Items added by hand stay until removed by hand. The numbers follow the queue ledger's order, so moving an item changes them."
    />
  );
  const activeHeading = (
    <SectionHeading
      title="Active"
      description="Runs in progress, and runs that failed and are not resolved yet. Each run plans, builds, tests, reviews and documents a change, then opens a pull request. The row updates live as phases complete."
      detail="A failed run keeps its branch and stays here, not in history, until it is run again."
    />
  );

  // The queue's own entry, under its own boundaries, slotted into
  // ActiveRunsView after Active: a failed queue read shows
  // its panel in this slot while the header and Active stay up.
  const queueSection = (
    <HydrationBoundary state={queue.state}>
      <QueryBoundary
        fallback={<QueueViewSkeleton heading={queueHeading} />}
        detail="This project's queue did not load."
      >
        <QueueView slug={slug} heading={queueHeading} />
      </QueryBoundary>
    </HydrationBoundary>
  );

  // The Active island's fallback: the real Active and Queue headings, with
  // skeleton rows under each, so both headings sit in the static shell at
  // their final position and only the rows are placeholders. The headings are
  // rendered here and again inside the island; only one copy is on screen at
  // a time, but while the island streams its copy waits in a hidden segment
  // until the swap, so the tooltip ids (section-active-detail,
  // section-queue-detail) are briefly in the DOM twice, never both visible.
  const activeFallback = (
    <ActiveRunsViewSkeleton
      heading={activeHeading}
      queue={<QueueViewSkeleton heading={queueHeading} />}
    />
  );

  return (
    <>
      <PageHeader title={project.display_name} subtitle={project.slug} repoUrl={project.repo_url} />

      {/* Active is a request-time island (ProjectActiveRuns, per request,
          never frozen into the shell) under its own SectionBoundary, so a
          failed read shows its panel here while the header and History stay
          up. Its HydrationBoundary and the queue's (in queueSection) are not
          nested inside the layout's; all hydrate into the one client
          Providers holds. On a router.refresh() a boundary receives a state
          again; React Query only overwrites the entry when the incoming
          dataUpdatedAt is newer (src/data/hydration.test.ts), so a live
          entry is never set back. */}
      <SectionBoundary fallback={activeFallback} detail="This project's runs did not load.">
        <ProjectActiveRuns
          projectId={project.id}
          slug={slug}
          heading={activeHeading}
          queue={queueSection}
          fallback={activeFallback}
        />
      </SectionBoundary>

      {/* Server-rendered, not hydrated: no query, so not a QueryBoundary but a
          SectionBoundary, whose Retry refreshes the route instead of resetting
          a query. The heading (SectionHeading, with the search boundary in
          its controls slot and the pagination boundary in its actions slot)
          is static and in the prerendered
          shell, outside every boundary. Each
          island awaits searchParams, so the Suspense inside its boundary is a
          real streaming boundary: the shell carries the fallback (the disabled
          box for the search, a skeleton for the links and for the list) and the island streams in at
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
          of falling back to its skeleton. */}
      <HistoryTransition>
        <section>
          <SectionHeading
            title="History"
            description="Completed runs, newest first. A run completes when its pull request was merged by the merge gate: tests green, review without blockers, CI green."
            detail="Completed runs never change, so this list is cached and only refreshed when a new run completes."
            controls={
              // Deliberately not a skeleton: the fallback is the real box,
              // disabled, already the live one's size.
              <SectionBoundary fallback={<HistorySearchFallback />} detail="Search did not load.">
                <HistorySearchBox slug={slug} searchParams={searchParams} />
              </SectionBoundary>
            }
            actions={
              // Known limit: a history of one page renders no links, so the
              // skeleton goes away. From md the slot sits on the title row and
              // no height changes; below md it is its own line, which
              // collapses.
              <SectionBoundary
                fallback={<HistoryLinksSkeleton />}
                detail="Pagination did not load."
              >
                <HistoryPagination slug={slug} searchParams={searchParams} />
              </SectionBoundary>
            }
          />
          <HistoryResults>
            <SectionBoundary
              fallback={<RunListSkeleton variant="history" rows={HISTORY_PAGE_SIZE} />}
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
