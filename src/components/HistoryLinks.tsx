import Link from "next/link";

interface HistoryLinksProps {
  /** The URL of the newer page (the left arrow), or null on page one. */
  newerHref: string | null;
  /** The URL of the older page (the right arrow), or null on the last page. */
  olderHref: string | null;
  /** The shown page, counted from the newest. */
  page: number;
  /** The number of pages. */
  pageCount: number;
}

const ARROW =
  "inline-flex w-6 justify-center text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100";

/**
 * The left arrow, the "N of M" indicator and the right arrow of the History
 * heading row, or nothing when there is a single page and no arrow. A server
 * component with no state: the page's HistoryPagination builds both hrefs
 * with historyHref and passes them in with the page numbers it read from the
 * cached page; null hides an arrow. A hidden arrow keeps its slot (an
 * invisible placeholder of the same width), so the indicator does not move.
 */
export function HistoryLinks({ newerHref, olderHref, page, pageCount }: HistoryLinksProps) {
  if (pageCount <= 1 && newerHref === null && olderHref === null) return null;

  return (
    <nav aria-label="History pages" className="flex items-center gap-3">
      {newerHref !== null ? (
        <Link href={newerHref} aria-label="Newer runs" className={ARROW}>
          ←
        </Link>
      ) : (
        <span aria-hidden="true" className={`${ARROW} invisible`}>
          ←
        </span>
      )}
      <span className="text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
        {page} of {pageCount}
      </span>
      {olderHref !== null ? (
        <Link href={olderHref} aria-label="Older runs" className={ARROW}>
          →
        </Link>
      ) : (
        <span aria-hidden="true" className={`${ARROW} invisible`}>
          →
        </span>
      )}
    </nav>
  );
}
