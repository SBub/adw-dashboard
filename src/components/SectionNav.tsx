import Link from "next/link";
import { Suspense } from "react";
import { HeaderLink } from "@/components/HeaderLink";

// The header's two links: the brand (BrandLink, rendered by the root layout)
// leads to the summary at "/", and this nav holds the one other section, the
// project overview. Both mark the current section through HeaderLink, the one
// usePathname reader in the header. Each sits in a plain Suspense whose
// fallback is the same link inactive, because usePathname suspends during
// prerender on a project page outside generateStaticParams; there the shell
// carries the unmarked link and the active one streams in. Everywhere else the
// pathname is known at build time and the active state is in the static HTML.

const SECTION_LINK = "hover:text-neutral-900 dark:hover:text-neutral-100";
const SECTION_LINK_INACTIVE = "text-neutral-500 dark:text-neutral-400";
const SECTION_LINK_ACTIVE = "text-neutral-900 dark:text-neutral-100";
const BRAND_LINK = "font-semibold tracking-tight";

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
