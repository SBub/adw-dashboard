// Answers "is this pathname that project's page?" for the route
// /projects/[...slug]. Pure (a string in, a boolean out), so it is testable
// without a router and safe to call from anywhere.

/**
 * True when `pathname` (as `window.location.pathname` reports it) is the page
 * of the project with this slug, i.e. the route that renders its History.
 *
 * The pathname is decoded before the comparison. Next decodes every route
 * param (route-matcher.js runs decodeURIComponent on each one), so a
 * percent-encoded spelling (`/projects/owner%2Frepo`) and the plain one
 * (`/projects/owner/repo`) both render the page for `owner/repo`, while
 * `window.location.pathname` keeps the spelling the address bar holds. The
 * test file has the concrete cases. Comparing the decoded form is what agrees
 * with the page. A valid slug (`[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+`) never needs
 * encoding, so for every link the app itself builds the decode is a no-op; a
 * malformed sequence (`%E0%A4%A`) throws a URIError in decodeURIComponent and
 * is answered with false, because no project page is served for it either.
 */
export function isProjectPath(pathname: string, slug: string): boolean {
  try {
    return decodeURIComponent(pathname) === `/projects/${slug}`;
  } catch {
    return false;
  }
}
