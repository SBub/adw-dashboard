// The cache tags that key one project's server-rendered history and the
// summary page's (`/`) two halves, spelled in exactly one place. The project
// page's history scope tags itself with historyTag, the summary page's scopes
// with summaryPastTag and summaryTodayTag; the revalidateHistory server action
// and the /api/revalidate route handler drop two of them through historyTags
// (never summaryPastTag). Active has no tag: it is read per request (see
// getActiveRunsState in src/data/active-runs-state.ts) and never cached on
// the server.
// A tag that differs by one character on either side is a cache entry nothing
// can expire, so never write these strings inline.

/** The tag of the page's history scope (`getHistory`): the completed runs of one project. */
export function historyTag(slug: string): string {
  return `history:${slug}`;
}

/**
 * The tag of the summary page's (`/`) past days scope (`getPastDays`). Never
 * dropped by a completion: past days are immutable once their UTC day is over,
 * and the scope's lifetime and the date in its key are what move it on.
 */
export function summaryPastTag(): string {
  return "summary:past";
}

/**
 * The tag of the summary page's (`/`) today scope (`getTodayState`): today's
 * day across every project. One tag, not one per day or project: a
 * completion changes today's figures, and one drop must reach the entry.
 */
export function summaryTodayTag(): string {
  return "summary:today";
}

/**
 * The two tags a completion (or the deletion of a completed run) invalidates
 * for a project, history first. The action and the route handler iterate
 * this; see app_docs/history-revalidation.md ("The move" and "Webhook
 * revalidation"), and app_docs/summary.md for
 * the today scope (a completion changes today's counts). The past days tag is
 * never here, and there is no Active tag: Active is read per request.
 */
export function historyTags(slug: string): readonly [string, string] {
  return [historyTag(slug), summaryTodayTag()];
}
