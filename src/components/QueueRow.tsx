import { STATUS_COLORS } from "@/lib/status-colors";
import type { QueueItem } from "@/types/adw";
import { StatusBadge } from "./StatusBadge";

interface QueueRowProps {
  item: QueueItem;
  /** "owner/repo", used to build the GitHub issue link. */
  projectSlug: string;
  /** 1-based ordinal in ledger order, from queuePositions; 1 is the head. */
  position: number;
}

/**
 * One queued item, as stored, as a stop on the queue rail. The left gutter
 * holds the marker (filled `next` for the head, the ordinal otherwise, both
 * from the `position` prop) and is reserved for a future drag handle. The
 * card is one row: the issue link, the title (shown in full, wrapping and
 * taking the remaining width) and the status pill, all top-aligned on the
 * title's first line, the pill right-aligned on that line at every width.
 * `source` and `queued_at` are not rendered (the queue is ordered by
 * `position`). Nothing here reads the clock. The queued pill uses the same
 * colour map as run rows.
 */
export function QueueRow({ item, projectSlug, position }: QueueRowProps) {
  const isHead = position === 1;

  return (
    <li className="group relative flex gap-3">
      {/* The rail: from this marker's centre to the next row's, through the
          gutter's centre (the 12px row gap plus the next marker's 29px
          offset). The last row draws none, so the line ends on its marker. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute top-[29px] -bottom-[41px] left-5 border-l group-last:hidden ${STATUS_COLORS.queued.border}`}
      />
      {/* The gutter: the marker now, a drag handle later. Its 24px box sits
          level with the title's first line box (the card's 1px border plus
          its 16px padding), and the 20px marker is centred in it, like the
          status pill. */}
      <div className="flex w-10 shrink-0 justify-center pt-[17px]">
        <span className="flex h-6 items-center">
          {isHead ? (
            <span
              className={`relative z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium text-white ${STATUS_COLORS.queued.dot}`}
            >
              next
            </span>
          ) : (
            <span
              className={`relative z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full border bg-background px-1 text-xs text-neutral-500 tabular-nums dark:text-neutral-400 ${STATUS_COLORS.neutral.border}`}
            >
              {position}
            </span>
          )}
        </span>
      </div>
      <div className="min-w-0 flex-1 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        {/* The row never wraps, so the pill stays on the title's first line. */}
        <div className="flex items-start gap-x-3">
          <a
            href={`https://github.com/${projectSlug}/issues/${item.issue_number}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 font-medium underline underline-offset-4 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            #{item.issue_number}
          </a>
          {item.issue_title !== null && (
            <span className="min-w-0 flex-1 wrap-break-word text-sm leading-6">
              {item.issue_title}
            </span>
          )}
          <div className="ml-auto flex h-6 shrink-0 items-center">
            <StatusBadge status="queued" />
          </div>
        </div>
      </div>
    </li>
  );
}
