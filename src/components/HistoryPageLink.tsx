"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useHistoryTransition } from "./HistoryTransition";

interface HistoryPageLinkProps {
  /** The History page URL HistoryPagination built with historyHref. */
  href: string;
  /** The arrow's accessible name. */
  label: string;
  className: string;
  children: ReactNode;
}

/**
 * One History arrow. A real link, so middle-click, open in a new tab, no-JS
 * and the production prefetch keep working. A plain click (the only kind
 * onNavigate sees) pushes the same URL inside the shared History transition
 * with `scroll: false`, so the window stays put and HistoryResults dims the
 * list until the new rows arrive. It builds no URL.
 */
export function HistoryPageLink({ href, label, className, children }: HistoryPageLinkProps) {
  const router = useRouter();
  const { startTransition } = useHistoryTransition();

  return (
    <Link
      href={href}
      aria-label={label}
      className={className}
      scroll={false}
      onNavigate={(e) => {
        e.preventDefault();
        startTransition(() => {
          router.push(href, { scroll: false });
        });
      }}
    >
      {children}
    </Link>
  );
}
