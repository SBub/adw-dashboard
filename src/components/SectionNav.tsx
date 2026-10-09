import Link from "next/link";
import { Suspense } from "react";
import { HeaderLink } from "@/components/HeaderLink";
import { HIRE_ACCENT } from "@/lib/accent";

// The header's three links: the brand (BrandLink, rendered by the root layout)
// leads to the summary at "/", this nav holds the one other section, the
// project overview, and the Hire me button (HireLink, in the header's right
// group) leads to /hire. All mark the current section through HeaderLink, the
// one usePathname reader in the header. Each sits in a plain Suspense whose
// fallback is the same link inactive, because usePathname suspends during
// prerender on a project page outside generateStaticParams; there the shell
// carries the unmarked link and the active one streams in. Everywhere else the
// pathname is known at build time and the active state is in the static HTML.

const SECTION_LINK = "hover:text-neutral-900 dark:hover:text-neutral-100";
const SECTION_LINK_INACTIVE = "text-neutral-500 dark:text-neutral-400";
const SECTION_LINK_ACTIVE = "text-neutral-900 dark:text-neutral-100";
const BRAND_LINK = "font-semibold tracking-tight";
const HIRE_LINK = `rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap ${HIRE_ACCENT}`;

export function SectionNav() {
  return (
    <nav aria-label="Sections" className="flex items-center gap-3 text-sm sm:gap-4">
      <Suspense
        fallback={
          <Link href="/projects" className={`${SECTION_LINK} ${SECTION_LINK_INACTIVE}`}>
            Projects
          </Link>
        }
      >
        <HeaderLink
          href="/projects"
          section="projects"
          className={SECTION_LINK}
          activeClassName={SECTION_LINK_ACTIVE}
          inactiveClassName={SECTION_LINK_INACTIVE}
        >
          Projects
        </HeaderLink>
      </Suspense>
    </nav>
  );
}

// The brand keeps its styling on every route; only aria-current marks "/".
export function BrandLink() {
  return (
    <Suspense
      fallback={
        <Link href="/" className={BRAND_LINK}>
          ADW Dashboard
        </Link>
      }
    >
      <HeaderLink
        href="/"
        section="summary"
        className={BRAND_LINK}
        activeClassName=""
        inactiveClassName=""
      >
        ADW Dashboard
      </HeaderLink>
    </Suspense>
  );
}

// The solid Hire me button keeps its accent on every route; only aria-current
// marks "/hire".
export function HireLink() {
  return (
    <Suspense
      fallback={
        <Link href="/hire" className={HIRE_LINK}>
          Hire me
        </Link>
      }
    >
      <HeaderLink
        href="/hire"
        section="hire"
        className={HIRE_LINK}
        activeClassName=""
        inactiveClassName=""
      >
        Hire me
      </HeaderLink>
    </Suspense>
  );
}
