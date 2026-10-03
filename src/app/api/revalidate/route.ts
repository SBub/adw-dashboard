// POST /api/revalidate: the server-side half of the history move.
//
// The browser-side half (the revalidateHistory server action, called by the
// Realtime listener) only runs when some browser had the channel open at the
// moment a run completed. This handler covers the other case: a database
// trigger on adw.runs (the toolkit's supabase/migrations/*_history_webhook.sql)
// posts here through pg_net whenever a run becomes completed, stops being
// completed, or a completed run is deleted, whether or not anyone is watching.
// It then drops the same two cache tags the action drops, so the project's
// next render reads the database. See README, "Webhook revalidation".
//
// It does nothing else. No database write, no second read beyond resolving
// the slug, no other side effect: an authenticated caller can make the next
// render of one project page read the database once, and that is all.
//
// Runs on the Node.js runtime, which is the default for route handlers in the
// installed Next (no `runtime` export is needed for node:crypto).
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getProjectSlug } from "@/data";
import { historyTags } from "@/lib/history-tags";
import { isProjectSlug } from "@/lib/slug";

/** A canonical lowercase-or-uppercase UUID, the shape of adw.projects.id. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The header the database trigger carries the shared secret in. */
const SECRET_HEADER = "x-adw-secret";

// Logged once per server process, not once per rejected request, so a missing
// variable in production is visible in the logs without flooding them.
let warnedUnconfigured = false;

/**
 * Constant-time comparison of the presented secret with the configured one.
 * timingSafeEqual requires equal-length buffers and throws otherwise, so a
 * length difference is answered as a mismatch before it is called. The length
 * itself is not a secret worth hiding: it is the length of the configured
 * value, which `openssl rand -hex 32` makes 64 for every deployment.
 */
function secretMatches(presented: string | null, configured: string): boolean {
  if (presented === null) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(configured, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The project_id of an adw.runs change, read from the Supabase database
 * webhook shape `{ type, schema, table, record, old_record }`, or null for
 * anything else: another table or schema, a body that is not an object, a
 * payload with no usable project_id in either row. The trigger sends `record`
 * null for DELETE and `old_record` null for INSERT, so both are tried. Only a
 * UUID is accepted, so the lookup below never hands the database a string it
 * would reject with an error.
 */
function runsProjectId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const { schema, table, record, old_record } = body as Record<string, unknown>;
  if (schema !== "adw" || table !== "runs") return null;
  for (const row of [record, old_record]) {
    if (typeof row !== "object" || row === null) continue;
    const { project_id } = row as Record<string, unknown>;
    if (typeof project_id === "string" && UUID.test(project_id)) return project_id;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  // ADW_REVALIDATE_SECRET is server-only (no NEXT_PUBLIC_ prefix) and shared
  // with the database trigger. Unset means nobody is allowed in: a 503 names
  // the deployment problem instead of a 401 blaming the caller.
  const configured = process.env.ADW_REVALIDATE_SECRET;
  if (!configured) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.error(
        "/api/revalidate: ADW_REVALIDATE_SECRET is not set; rejecting every request with 503",
      );
    }
    return Response.json({ error: "revalidation is not configured" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get(SECRET_HEADER), configured)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body is not JSON" }, { status: 400 });
  }

  const projectId = runsProjectId(body);
  if (projectId === null) return Response.json({ ignored: true });

  // The tags are keyed by slug and the trigger only knows the project_id, so
  // one read through the data boundary resolves it. The publishable key is
  // enough: RLS lets it see public projects, and a private (or unknown)
  // project has no page whose cache could be stale, so it is ignored. A slug
  // that fails the same check the action applies is ignored for the same
  // reason: no page is served for it.
  let slug: string | null;
  try {
    slug = await getProjectSlug(projectId);
  } catch (error) {
    console.error("/api/revalidate: project lookup failed", error);
    return Response.json({ error: "project lookup failed" }, { status: 502 });
  }
  if (slug === null || !isProjectSlug(slug)) return Response.json({ ignored: true });

  // revalidateTag with { expire: 0 }, not updateTag: per node_modules/next/
  // dist/docs/01-app/03-api-reference/04-functions/updateTag.md, updateTag
  // "can only be called from within Server Actions. It cannot be used in Route
  // Handlers". revalidateTag.md documents the profile object form: with
  // `{ expire: 0 }` "stale content is never served, so the next request is a
  // blocking revalidate/cache miss", which is the same outcome the action gets
  // from updateTag. "max" would be stale-while-revalidate and the next visitor
  // would still be shown the old History once.
  for (const tag of historyTags(slug)) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: slug });
}
