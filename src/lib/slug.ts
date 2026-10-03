// The one definition of what a project slug looks like. Both public entry
// points that accept a slug from outside (the revalidateHistory server action,
// which takes it from the browser, and the /api/revalidate route handler,
// which reads it back from the database for a webhook's project_id) validate
// against this before building a cache tag from it.

// A project slug is "owner/repo": one slash, and on each side only the
// characters GitHub allows in a user, organisation or repository name. Static
// (not built from input), so the lint rule against non-literal regexps is
// satisfied and the pattern cannot be made pathological by a caller.
const SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * True when `value` is a string of the form `owner/repo`, with only the
 * characters GitHub allows on each side. Anything else (another type, an empty
 * side, a second slash, a space, a percent sequence) is false. Pure.
 */
export function isProjectSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG.test(value);
}
