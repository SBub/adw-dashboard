// Answers "which header section is this pathname in?" for the root header's
// two links: the brand (the summary at "/") and "Projects" (/projects and
// every project page below it). Pure (a string in, a value out), so it is
// testable without a router and safe to call from anywhere.

export type HeaderSection = "summary" | "projects";

/**
 * The header section `pathname` belongs to, or `null` for a route in neither.
 *
 * The summary is exactly "/". The projects section is "/projects" and
 * anything below "/projects/"; the slash is part of the prefix, so
 * "/projectsx" matches nothing. No decoding is needed: the prefix is a literal
 * ASCII segment, so an encoded spelling further down never changes the answer.
 */
export function headerSection(pathname: string): HeaderSection | null {
  if (pathname === "/") return "summary";
  if (pathname === "/projects" || pathname.startsWith("/projects/")) return "projects";
  return null;
}
