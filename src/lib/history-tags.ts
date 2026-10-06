// The cache tags that key one project's server-rendered history, its Active
// prefetch and the summary page (`/`), spelled in exactly one place. The project
// page's two "use cache" scopes tag themselves with historyTag and runsTag,
// the summary page's with summaryTag; the revalidateHistory server action and
// the /api/revalidate route handler drop all three through historyTags. A tag that differs by one character on either side is a cache
// entry nothing can expire, so never write these template strings inline.

/** The tag of the page's history scope (`getHistory`): the completed runs of one project. */
export function historyTag(slug: string): string {
  return `history:${slug}`;
}

/** The tag of the page's Active prefetch scope (`getRunsState`) for one project. */
export function runsTag(slug: string): string {
  return `runs:${slug}`;
}

/**
 * The tag of the summary page's (`/`) scope (`getSummary`). One tag for every
 * project filter and every window: a completion changes the all-projects view
 * and the project's own, and one drop must reach every cached variant.
 */
export function summaryTag(): string {
  return "summary";
}

/**
 * The three tags a completion (or the deletion of a completed run)
 * invalidates for a project, history first. The action and the route handler
 * iterate this; see README, "The move" and "Webhook revalidation", for why the
 * Active scope is dropped alongside history, and "Summary" for the summary
 * scope (a completion changes that day's counts).
 */
export function historyTags(slug: string): readonly [string, string, string] {
  return [historyTag(slug), runsTag(slug), summaryTag()];
}
