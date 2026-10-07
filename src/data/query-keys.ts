// Every React Query key in the application, in one place. The server prefetch
// and the browser read of a resource must hash to the same key or the browser
// fetches again what the server already put in the HTML, and the Realtime
// listener must write under the same key or its updates land in an entry
// nobody reads. Defining each key once here, and importing it everywhere, is
// what rules that drift out. Never build a key inline anywhere else.
export const queryKeys = {
  /** The project list: the layout's prefetch, ProjectNav, and realtime.ts. */
  projects: ["projects"] as const,
  /**
   * The one Active entry: every visible project's running and failed runs.
   * Prefetched per request by getActiveRunsState, read (through
   * activeRunsQuery) by ProjectNav, ActiveRunsOverview and ActiveRunsView,
   * each narrowing it with a select, and written by the runs listener and the
   * catch-up in realtime.ts. There is no per-project runs key.
   */
  activeRuns: ["active-runs"] as const,
  /**
   * The prefix every queue key starts with. Nothing is stored under it; realtime.ts hands it to queryCache.findAll in the catch-up to
   * enumerate the queue entries present in the cache.
   */
  allQueues: ["queue"] as const,
  /**
   * One project's queued items, by slug: prefetched by the page, read by
   * QueueView, written by the queue_items listener and the catch-up. The slug is
   * part of the hash; the page assembles it once and every caller passes it
   * as is.
   */
  queue: (slug: string) => ["queue", slug] as const,
  /**
   * The summary page's (`/`) today card, by UTC day: prefetched by the page's
   * getTodayState, read by TodaySummary. The day is part of the hash, so an
   * entry can never be read for another day.
   */
  summaryToday: (day: string) => ["summary-today", day] as const,
} as const;
