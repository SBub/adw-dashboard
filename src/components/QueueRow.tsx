import { queueSource } from "@/lib/queue-source";
import { STATUS_COLORS } from "@/lib/status-colors";
import type { QueueItem } from "@/types/adw";
import { StatusBadge } from "./StatusBadge";
import { Timestamp } from "./Timestamp";

interface QueueRowProps {
  item: QueueItem;
  /** "owner/repo", used to build the GitHub issue link. */
  projectSlug: string;
  /** 1-based ordinal in ledger order, from queuePositions; 1 is the head. */
  position: number;
}

const BADGE =
  "inline-flex items-center rounded-md border border-neutral-300 px-1.5 py-0.5 font-mono text-xs text-neutral-600 dark:border-neutral-600 dark:text-neutral-400";

/**
 * One queued item, as stored, as a stop on the queue rail. The left gutter
 * holds the marker (filled `next` for the head, the ordinal otherwise, both
 * from the `position` prop) and is reserved for a future drag handle. The
 * source is parsed from the row's own column by queueSource; everything else
 * is a column. The card is one row: the issue link, the title (shown in full,
 * wrapping), the hint for a manual item, `Queued <time>` and the status pill,
 * all top-aligned on the title's first line. Nothing here reads the clock.
 * A manual item carries a visible hint (a title alone is invisible on touch):
 * removing the issue's label does not take it out of the queue. The queued
 * badge uses the same colour map as run rows.
 */
export function QueueRow({ item, projectSlug, position }: QueueRowProps) {
  const source = queueSource(item.source);
  const isHead = position === 1;

  return (
    <li className="group relative flex gap-3">
      {/* The rail: from this marker's centre to the next row's, through the
          gutter's centre (the 12px row gap plus the next marker's 28px
          offset). The last row draws none, so the line ends on its marker. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute top-7 -bottom-10 left-5 border-l group-last:hidden ${STATUS_COLORS.queued.border}`}
      />
      {/* The gutter: the marker now, a drag handle later. */}
      <div className="flex w-10 shrink-0 justify-center pt-4">
        {isHead ? (
          <span
            className={`relative z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium text-white ${STATUS_COLORS.queued.dot}`}
          >
            next
          </span>
        ) : (
          <span
            className={`relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border bg-background text-xs text-neutral-500 tabular-nums dark:text-neutral-400 ${STATUS_COLORS.neutral.border}`}
          >
            {position}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2">
          <a
            href={`https://github.com/${projectSlug}/issues/${item.issue_number}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            #{item.issue_number}
          </a>
          {item.issue_title !== null && (
            <span className="min-w-0 flex-1 basis-40 wrap-break-word text-sm leading-6">
              {item.issue_title}
            </span>
          )}
          {source?.kind === "manual" && (
            <>
              <span className="flex h-6 items-center">
                <span
                  className={BADGE}
                  title="Added by hand with adw_queue.py add. Removing the issue's label does not take it out of the queue."
                >
                  manual
                </span>
              </span>
              <span className="text-xs leading-6 text-neutral-500 dark:text-neutral-400">
                Removing the label does not remove it.
              </span>
            </>
          )}
          <span className="ml-auto text-xs leading-6 text-neutral-500 dark:text-neutral-400">
            Queued{" "}
            {item.queued_at !== null ? (
              <Timestamp value={item.queued_at} />
            ) : (
              <span className="text-neutral-400 dark:text-neutral-600">none</span>
            )}
          </span>
          <span className="flex h-6 shrink-0 items-center">
            <StatusBadge status="queued" />
          </span>
        </div>
      </div>
    </li>
  );
}
