"use server";

import { updateTag } from "next/cache";

// A project slug is "owner/repo": one slash, and on each side only the
// characters GitHub allows in a user, organisation or repository name. Static
// (not built from input), so the lint rule against non-literal regexps is
// satisfied and the pattern cannot be made pathological by a caller.
const SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Drops the server cache for one project's history and active prefetch, so
 * the next render of that project page reads both from the database.
 *
 * Called from the browser (Providers, through the Realtime listener) right
 * after a run completes: the reducer has already removed the run from the
 * Active entry in the query cache, and this is step two of the move; step
 * three, router.refresh(), re-renders the server-rendered History with the new
 * row. Two tags:
 *
 * - history:<slug>, the "use cache" scope the page renders History from.
 * - runs:<slug>, the "use cache" scope of the Active prefetch, so the refresh
 *   (and the next visitor) does not get an Active list that still contains
 *   the completed run.
 *
 * updateTag, not revalidateTag. Per node_modules/next/dist/docs/01-app/
 * 03-api-reference/04-functions/updateTag.md and revalidateTag.md: updateTag
 * is the Server Action form for read-your-own-writes, it expires the tag at
 * once and the next read (including the route re-render Next ships in this
 * action's own response, see 02-guides/server-actions.md, "Revalidation")
 * waits for fresh data. revalidateTag(tag, "max") is stale-while-revalidate:
 * the refresh that follows would be served the old History and the new row
 * would only show on a later visit. The deprecated one-argument revalidateTag
 * behaves like updateTag but is on its way out.
 *
 * A Server Action is a public endpoint: anyone who can reach the site can
 * call it with any string. So it validates the slug strictly and does nothing
 * else: no database write, no read, no return value worth having. The worst a
 * caller can do is make the next render of one project page read the
 * database once.
 */
export async function revalidateHistory(slug: string): Promise<void> {
  if (typeof slug !== "string" || !SLUG.test(slug)) return;
  updateTag(`history:${slug}`);
  updateTag(`runs:${slug}`);
}
