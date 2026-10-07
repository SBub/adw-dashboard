"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { headerSection, type HeaderSection } from "@/lib/header-section";

// A header link that marks itself when the pathname is in its section. The one
// usePathname reader in the header; SectionNav.tsx wraps it in a Suspense whose
// fallback is the same link inactive. Exactly one of activeClassName and
// inactiveClassName is applied, so two text colours never meet in one class list.
export function HeaderLink({
  href,
  section,
  className,
  activeClassName,
  inactiveClassName,
  children,
}: {
  href: string;
  section: HeaderSection;
  className: string;
  activeClassName: string;
  inactiveClassName: string;
  children: ReactNode;
}) {
  const active = headerSection(usePathname()) === section;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? activeClassName : inactiveClassName}`.trim()}
    >
      {children}
    </Link>
  );
}
