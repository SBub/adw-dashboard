"use server";

import { updateTag } from "next/cache";
import { historyTags } from "@/lib/history-tags";
import { isProjectSlug } from "@/lib/slug";

/**
 * Drops the server cache for one project's history and active prefetch, so
 * the next render of that project page reads both from the database.
 *
 * Called from the browser (Providers, through the Realtime listener) right
 * after a run completes: the reducer has already removed the run from the
 * Active entry in the query cache, and this is step two of the move; step
 * three, router.refresh(), re-renders the server-rendered History with the new
 * row when that project's page is the route on screen. This step runs for
 * every completion regardless, so the project's next render is fresh for
 * whoever opens it. Two tags, from historyTags in src/lib/history-tags.ts,
 * the one place their spelling lives:
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
 * behaves like updateTag but is on its way out. The route handler in
 * src/app/api/revalidate/route.ts drops the same two tags for a completion no
 * browser saw; it cannot use updateTag (Server Actions only) and uses
 * revalidateTag(tag, { expire: 0 }) instead, which has the same effect.
 *
 * A Server Action is a public endpoint: anyone who can reach the site can
 * call it with any string. So it validates the slug strictly (isProjectSlug,
 * src/lib/slug.ts) and does nothing else: no database write, no read, no
 * return value worth having. The worst a caller can do is make the next
 * render of one project page read the database once.
 */
export async function revalidateHistory(slug: string): Promise<void> {
  if (!isProjectSlug(slug)) return;
  for (const tag of historyTags(slug)) updateTag(tag);
}
