// The cache tags that key one project's server-rendered history and its
// Active prefetch, spelled in exactly one place. The page's two "use cache"
// scopes tag themselves with historyTag and runsTag; the revalidateHistory
// server action and the /api/revalidate route handler drop both through
// historyTags. A tag that differs by one character on either side is a cache
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
 * Both tags a completion (or the deletion of a completed run) invalidates for
 * a project, history first. The action and the route handler iterate this;
 * see README, "The move" and "Webhook revalidation", for why the Active scope
 * is dropped alongside history.
 */
export function historyTags(slug: string): readonly [string, string] {
  return [historyTag(slug), runsTag(slug)];
}
