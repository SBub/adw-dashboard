import Link from "next/link";

interface HistoryLinksProps {
  /** The URL of the newer page, or null on page one. */
  newerHref: string | null;
  /** The URL of the older page, or null on the last page. */
  olderHref: string | null;
}

const PAGE_LINK = "text-sm text-neutral-600 hover:underline dark:text-neutral-400";

/**
 * The Newer and Older links of the History heading row, or nothing when
 * neither page exists. A server component with no state: the page's
 * HistoryPagination builds both hrefs with historyHref and passes them in;
 * null hides a link.
 */
export function HistoryLinks({ newerHref, olderHref }: HistoryLinksProps) {
  if (newerHref === null && olderHref === null) return null;

  return (
    <nav aria-label="History pages" className="flex items-center gap-4">
      {newerHref !== null && (
        <Link href={newerHref} className={PAGE_LINK}>
          Newer
        </Link>
      )}
      {olderHref !== null && (
        <Link href={olderHref} className={PAGE_LINK}>
          Older
        </Link>
      )}
    </nav>
  );
}
