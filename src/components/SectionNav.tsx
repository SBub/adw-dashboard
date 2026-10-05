import Link from "next/link";

// The header's section links. A server component with no active state:
// highlighting the current section would need usePathname in a client
// component in the root layout, which suspends on routes with request-time
// params and would make the header stream.
export function SectionNav() {
  return (
    <nav aria-label="Sections" className="flex items-center gap-4 text-sm">
      <Link
        href="/"
        className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        Projects
      </Link>
      <Link
        href="/skills"
        className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        Skills
      </Link>
      <Link
        href="/summary"
        className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        Summary
      </Link>
    </nav>
  );
}
