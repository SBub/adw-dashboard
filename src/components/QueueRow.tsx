import { dependencyHoldReason, isDependencyHeld } from "@/lib/queue-hold";
import { STATUS_COLORS } from "@/lib/status-colors";
import type { QueueItem } from "@/types/adw";
import { StatusBadge } from "./StatusBadge";

interface QueueRowProps {
  item: QueueItem;
  /** "owner/repo", used to build the GitHub issue link. */
  projectSlug: string;
  /**
   * 1-based ordinal among the queued items in ledger order, from
   * queuePositions; 1 is the head. Null for an item held on a dependency,
   * which cannot start and has no ordinal.
   */
  position: number | null;
}

/**
 * One Queue section item, as stored, as a stop on the queue rail. The left
 * gutter holds the marker (filled `next` for the head, the ordinal for a later
 * queued item, an empty hollow circle for an item held on a dependency, all
 * from the `position` prop) and is reserved for a future drag handle. The card
 * holds the issue link, the title (shown in full, wrapping and taking the
 * remaining width of the first line) and the status pill (`queued`, or
 * `waiting` when held on a dependency), top-aligned on the title's first line
 * at every width, the pill right-aligned. For an item held on a dependency it
 * adds the toolkit's reason after the prefix, one truncated line (the full
 * text in `title`): on its own full-width line under the title below `sm`,
 * inline after the title from `sm` up, where it shares the remaining width
 * equally with the title (both flex basis 0) and truncates inside its share,
 * so it never takes width from the title. `source` and `queued_at` are not
 * rendered (the queue is ordered by `position`). Nothing here reads the clock. The pill uses the same
 * colour map as run rows.
 */
export function QueueRow({ item, projectSlug, position }: QueueRowProps) {
  const isHead = position === 1;
  const status = isDependencyHeld(item) ? "waiting" : "queued";
  const reason = dependencyHoldReason(item);

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
          ) : position === null ? (
            <span
              aria-hidden
              className={`relative z-10 inline-flex size-5 rounded-full border bg-background ${STATUS_COLORS.waiting.border}`}
            />
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
        {/* Below `sm` the row wraps only to put a held row's reason on its own
            line under the title; the link, title and pill never wrap apart,
            so the pill stays on the title's first line. */}
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1 sm:flex-nowrap">
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
          {reason !== null && (
            <span
              title={reason}
              className="order-last min-w-0 basis-full truncate text-sm leading-6 text-neutral-500 sm:order-none sm:flex-1 sm:basis-0 dark:text-neutral-400"
            >
              {reason}
            </span>
          )}
          <div className="ml-auto flex h-6 shrink-0 items-center">
            <StatusBadge status={status} />
          </div>
        </div>
      </div>
    </li>
  );
}
