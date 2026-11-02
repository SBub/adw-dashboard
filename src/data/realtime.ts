// The Realtime subscription: one channel on the Supabase client, started once
// per browser session from Providers, that patches the React Query cache and
// drives the connection indicator. The data itself still comes from
// the data boundary; this module only applies changes to it, and refreshes it
// through the boundary when the channel (re)connects.
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { ConnectionStatus, setConnectionStatus } from "@/components/ConnectionIndicator";
import type { Project, ProjectSummary, QueueItem, Run } from "@/types/adw";
import { applyProjectChange } from "./apply-project-change";
import {
  applyQueueChange,
  applyQueueChangeToSummaries,
  type QueueChange,
  queuedIn,
} from "./apply-queue-change";
import {
  applyChangedRuns,
  applyRunChange,
  applyRunChangeToSummaries,
  isHistoryChange,
  type RunChange,
  runStatusIn,
} from "./apply-run-change";
import { type ActiveRuns, getActiveRuns, getChangedRuns, getProjects, getQueue } from "./index";
import { queryKeys } from "./query-keys";
import { latestUpdatedAt } from "@/lib/active-runs";
import { createCoalescedRunner } from "@/lib/request-pacing";
import { getSupabase, realtimeBackoff } from "./supabase";

/**
 * The runs cursor of one startRealtime: the highest server updated_at this
 * tab has read or been sent, or null before the first full read. Held by
 * reference so the catch-up and the event handler share it.
 */
interface RunsCursor {
  seen: string | null;
}

export interface RealtimeOptions {
  /**
   * Called with the project's slug when an event changed that project's
   * completed runs (a run completed, or a completed run was deleted). History
   * is server-rendered and not in the query cache, so nothing in here can
   * update it; the caller (Providers) asks the server to drop its cache tag
   * and then refreshes the route if that project's page is the one on screen.
   * Called after the cache writes for the event.
   */
  onHistoryChange?: (slug: string) => void;
  /**
   * Called with every channel state after the indicator is set, so Providers
   * can send the Realtime connection events (createRealtimeTracker in
   * src/lib/analytics.ts). It only observes: nothing here depends on it, and
   * it must not throw.
   */
  onStatus?: (state: `${REALTIME_SUBSCRIBE_STATES}`) => void;
}

/**
 * Opens the "adw" channel and subscribes to every change on adw.projects,
 * adw.runs and adw.queue_items. Each event is folded into the cache with
 * setQueryData through a pure reducer (apply-project-change.ts,
 * apply-run-change.ts, apply-queue-change.ts), which is the
 * update path for a static query (invalidation would skip it). Every updater
 * is written `current => current && reducer(current, ev)`: an entry that is
 * not in the cache stays absent (setQueryData ignores an undefined result),
 * because seeding one from a single event would create a one-row list that
 * looks complete and is not. The channel's status callback is the one writer
 * of the connection indicator, the trigger of the catch-up read (through a
 * coalesced runner) and the up and down signal of the reconnect backoff.
 *
 * Returns the closer: it cancels any pending catch-up, removes the channel,
 * resets the runs cursor and puts the indicator back to Connecting, so the
 * next start begins from the same state as a fresh page (its first SUBSCRIBED
 * catches up with a full read).
 */
export function startRealtime(queryClient: QueryClient, options: RealtimeOptions = {}): () => void {
  const supabase = getSupabase();
  const runsCursor: RunsCursor = { seen: null };
  const catchUpRunner = createCoalescedRunner(() => catchUp(queryClient, runsCursor));

  const channel: RealtimeChannel = supabase
    .channel("adw")
    .on<Project>("postgres_changes", { event: "*", schema: "adw", table: "projects" }, (ev) => {
      queryClient.setQueryData<ProjectSummary[]>(
        queryKeys.projects,
        (current) => current && applyProjectChange(current, ev),
      );
    })
    .on<Run>("postgres_changes", { event: "*", schema: "adw", table: "runs" }, (ev) => {
      applyRunEvent(queryClient, ev, options, runsCursor);
    })
    .on<QueueItem>(
      "postgres_changes",
      { event: "*", schema: "adw", table: "queue_items" },
      (ev) => {
        applyQueueEvent(queryClient, ev);
      },
    )
    .subscribe((state) => {
      switch (state) {
        case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
          setConnectionStatus(ConnectionStatus.Live);
          realtimeBackoff.up();
          catchUpRunner.request();
          break;
        case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
        case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
          setConnectionStatus(ConnectionStatus.Reconnecting);
          realtimeBackoff.down();
          break;
        case REALTIME_SUBSCRIBE_STATES.CLOSED:
          setConnectionStatus(ConnectionStatus.Connecting);
          realtimeBackoff.down();
          break;
      }
      options.onStatus?.(state);
    });

  return () => {
    catchUpRunner.cancel();
    runsCursor.seen = null;
    void supabase.removeChannel(channel);
    setConnectionStatus(ConnectionStatus.Connecting);
  };
}

/**
 * One adw.runs event into the two entries it touches, plus the history
 * callback. The event names the project by id; the slug the history callback
 * takes comes from the cached project list, so an event for a project that
 * list does not hold (a private project, or a list that is not in the cache at
 * all) is dropped. That is the correct outcome, not an error: nothing on
 * screen could show it.
 *
 * Order matters. The previous status of the run is read from the one Active
 * entry (every project's running and failed runs) BEFORE that entry is
 * rewritten: Supabase sends `old` with only the primary key columns under the
 * default replica identity, so an UPDATE or DELETE event does not say what
 * status the run had, and both the completed count and the history test need
 * it. Because the entry holds every project, the previous status of an active
 * run is always known, whichever page is open. Then the Active entry, then
 * the project list, each through its reducer and `current && ...`, and last
 * the history callback, so by the time the server re-renders the completed
 * run is already out of the Active entry (step one of the move; see Providers
 * for steps two and three).
 *
 * An INSERT or UPDATE advances the runs cursor to its updated_at (a server
 * timestamp) when that is later, but only once the cursor is set: an event
 * that lands before the first catch-up must not turn that first catch-up
 * incremental. An event dropped for an unknown project does not advance it;
 * the overlap and the next full read cover that.
 */
function applyRunEvent(
  queryClient: QueryClient,
  ev: RunChange,
  options: RealtimeOptions,
  cursor: RunsCursor,
) {
  const key = ev.eventType === "DELETE" ? ev.old : ev.new;
  const { project_id: projectId, adw_id: adwId } = key;
  if (projectId === undefined || adwId === undefined) return;

  const project = queryClient
    .getQueryData<ProjectSummary[]>(queryKeys.projects)
    ?.find((candidate) => candidate.id === projectId);
  if (!project) return;

  const oldStatus =
    ev.eventType === "INSERT"
      ? undefined
      : (ev.old.status ??
        runStatusIn(queryClient.getQueryData<ActiveRuns>(queryKeys.activeRuns), projectId, adwId));

  queryClient.setQueryData<ActiveRuns>(
    queryKeys.activeRuns,
    (current) => current && applyRunChange(current, ev),
  );
  queryClient.setQueryData<ProjectSummary[]>(
    queryKeys.projects,
    (current) => current && applyRunChangeToSummaries(current, ev, oldStatus),
  );
  if (ev.eventType !== "DELETE" && cursor.seen !== null) {
    cursor.seen = latestUpdatedAt([ev.new], cursor.seen);
  }

  if (isHistoryChange(ev, oldStatus)) options.onHistoryChange?.(project.slug);
}

/**
 * One adw.queue_items event into the two entries it touches: the project's
 * queue and the project list's queued count. Same shape as applyRunEvent: the
 * slug comes from the cached project list, and an event for a project that
 * list does not hold is dropped.
 *
 * Order matters for the same reason. Whether the item was queued is read from
 * the queue cache BEFORE that entry is rewritten (`old` carries only
 * project_id and issue_number), then the queue entry, then the project list,
 * each through its reducer and `current && ...`. There is no history callback:
 * the queue is not history.
 */
function applyQueueEvent(queryClient: QueryClient, ev: QueueChange) {
  const key = ev.eventType === "DELETE" ? ev.old : ev.new;
  const { project_id: projectId, issue_number: issueNumber } = key;
  if (projectId === undefined || issueNumber === undefined) return;

  const project = queryClient
    .getQueryData<ProjectSummary[]>(queryKeys.projects)
    ?.find((candidate) => candidate.id === projectId);
  if (!project) return;

  const queueKey = queryKeys.queue(project.slug);
  const wasQueued = queuedIn(queryClient.getQueryData<QueueItem[]>(queueKey), issueNumber);

  queryClient.setQueryData<QueueItem[]>(
    queueKey,
    (current) => current && applyQueueChange(current, ev),
  );
  queryClient.setQueryData<ProjectSummary[]>(
    queryKeys.projects,
    (current) => current && applyQueueChangeToSummaries(current, ev, wasQueued),
  );
}

/** The slugs of the cached entries whose key starts with `prefix`. */
function cachedSlugs(queryClient: QueryClient, prefix: readonly string[]): string[] {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: prefix })
    .map((query) => query.queryKey[1])
    .filter((slug): slug is string => typeof slug === "string");
}

/**
 * Refreshes the cached entries from the database. Every SUBSCRIBED requests
 * it through the coalesced runner in startRealtime (src/lib/request-pacing.ts):
 * SUBSCRIBED callbacks within 1 s give one catch-up, a catch-up never runs
 * while another is in flight, and one requested less than 10 s after the
 * previous one finished is skipped. The first SUBSCRIBED always catches up.
 *
 * Why on every SUBSCRIBED and not only after a drop. Events that happen while
 * the channel is down are never delivered, so a reconnect must re-read. But
 * the first connect has the same gap: the project list and the queue come
 * from a static shell whose cache entries may be minutes old (the server
 * caches them for 15 minutes), the Active entry from a read made when the
 * page was served, and anything that changed between that fill and the moment the
 * channel joined was never an event this browser saw. One path for both
 * cases, with no "was I disconnected" flag to keep in step.
 *
 * Why setQueryData and not invalidateQueries or refetchQueries. Both skip
 * queries with `staleTime: "static"`, which every query here has (see
 * ProjectNav for why), so they would be a silent no-op. The data is read
 * through the boundary functions themselves and written under the same keys
 * the reads use, which is also what keeps the hydration-era prefetch and this
 * refresh identical in shape. Both runs reads stamp a fresh fetched_at, which
 * nothing in the UI reads today.
 *
 * Runs: full first, then incremental (issue #243). The first catch-up of a
 * startRealtime is a full windowed read (getActiveRuns), because the served
 * page can be old; it sets the runs cursor to the highest updated_at it read.
 * Every later catch-up reads only the runs changed since the cursor minus 60 s
 * (getChangedRuns, any status) and merges them (applyChangedRuns). The cursor
 * is always a server updated_at, never the client clock, and only moves after
 * its write succeeded. An empty full read leaves it null, so the next
 * catch-up is another (tiny) full read. A run deleted, or a project made
 * private, while the tab is open stays until the next page load: an
 * incremental read cannot see either. Queues stay full reads, because a
 * deleted queue item is invisible to an incremental read.
 *
 * History needs no catch-up: it is server-rendered from a cache scope that a
 * completion drops through the server action, and a completion this browser
 * missed while disconnected leaves that page's History as the server has it,
 * which is refilled on the cache lifetime or the next completion anyone sees.
 *
 * The full read writes the Active entry unconditionally, unlike the per-event
 * updaters (`current && ...`): getActiveRuns is the complete list read from
 * the database, not a one-row seed, so writing it when it was absent cannot
 * make a partial list look complete. The incremental read is never a seed: it
 * only merges into an entry that is there, and when the entry is absent it
 * resets the cursor so the next catch-up is a full read. The queue entries are only refreshed where
 * they are cached (one per project page visited this session).
 *
 * Cost: one project_summaries read, one runs read (the windowed narrow list
 * the first time, only the rows changed since the cursor afterwards; never the
 * state jsonb), and one getQueue (two reads) per queue entry in the cache, per
 * catch-up: once per page that stays
 * visible for 2 s (Providers defers the channel), plus at most one per burst
 * of reconnects, which the backoff in getSupabase() spaces out. Events missed
 * by a reconnect inside the 10 s skip window are recovered at the next
 * catch-up or the next event for that row.
 *
 * Failures are logged and swallowed: a failed refresh leaves the cache as it
 * was, which is the state before the refresh, and the next event or
 * reconnect tries again. Throwing from a socket callback would help nobody.
 * An event arriving while a read is in flight is applied to the cache first
 * and then overwritten by the read's result, which may predate it by the
 * round-trip time; the next event for that row corrects it.
 */
async function catchUp(queryClient: QueryClient, cursor: RunsCursor) {
  try {
    const projects = await getProjects();
    queryClient.setQueryData<ProjectSummary[]>(queryKeys.projects, projects);

    if (cursor.seen === null) {
      const active = await getActiveRuns();
      queryClient.setQueryData<ActiveRuns>(queryKeys.activeRuns, active);
      cursor.seen = latestUpdatedAt(active.active, null);
    } else {
      const read = await getChangedRuns(cursor.seen);
      if (queryClient.getQueryData<ActiveRuns>(queryKeys.activeRuns)) {
        queryClient.setQueryData<ActiveRuns>(
          queryKeys.activeRuns,
          (current) => current && applyChangedRuns(current, read),
        );
        cursor.seen = latestUpdatedAt(read.changed, cursor.seen);
      } else {
        cursor.seen = null;
      }
    }
    await Promise.all(
      cachedSlugs(queryClient, queryKeys.allQueues).map(async (slug) => {
        const items = await getQueue(slug);
        queryClient.setQueryData<QueueItem[]>(queryKeys.queue(slug), items);
      }),
    );
  } catch (error) {
    console.warn("realtime: catch-up read failed, cache left as it was", error);
  }
}
