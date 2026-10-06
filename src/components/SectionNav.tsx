import Link from "next/link";

// The header's section link. The brand in the root layout leads to the summary
// at "/"; this nav holds the one other section, the project overview. A server
// component with no active state: highlighting the current section would need
// usePathname in a client component in the root layout, which suspends on
// routes with request-time params and would make the header stream.
export function SectionNav() {
  return (
    <nav aria-label="Sections" className="flex items-center gap-3 text-sm sm:gap-4">
      <Link
        href="/projects"
        className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        Projects
      </Link>
    </nav>
  );
}
