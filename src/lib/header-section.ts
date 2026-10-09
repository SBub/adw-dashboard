// Answers "which header section is this pathname in?" for the root header's
// three links: the brand (the summary at "/"), "Projects" (/projects and
// every project page below it) and "Hire me" (/hire). Pure (a string in, a value out), so it is
// testable without a router and safe to call from anywhere.

export type HeaderSection = "summary" | "projects" | "hire";

/**
 * The header section `pathname` belongs to, or `null` for a route in neither.
 *
 * The summary is exactly "/". The projects section is "/projects" and
 * anything below "/projects/"; the slash is part of the prefix, so
 * "/projectsx" matches nothing. No decoding is needed: the prefix is a literal
 * ASCII segment, so an encoded spelling further down never changes the answer.
 * The hire section is exactly "/hire" (or "/hire/"); "/hirex" and "/hire-me"
 * match nothing.
 */
export function headerSection(pathname: string): HeaderSection | null {
  if (pathname === "/") return "summary";
  if (pathname === "/projects" || pathname.startsWith("/projects/")) return "projects";
  if (pathname === "/hire" || pathname === "/hire/") return "hire";
  return null;
}
