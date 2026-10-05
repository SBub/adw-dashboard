import { queueSource } from "@/lib/queue-source";
import type { QueueItem } from "@/types/adw";
import { Timestamp } from "./Timestamp";

interface QueueRowProps {
  item: QueueItem;
  /** "owner/repo", used to build the GitHub issue link. */
  projectSlug: string;
}

const BADGE =
  "inline-flex items-center rounded-md border border-neutral-300 px-1.5 py-0.5 font-mono text-xs text-neutral-600 dark:border-neutral-600 dark:text-neutral-400";

/**
 * One queued item, as stored. The source is parsed from the row's own column
 * by queueSource; everything else is a column. Nothing here reads the clock.
 * A manual item carries a visible hint (a title alone is invisible on touch):
 * removing the issue's label does not take it out of the queue.
 */
export function QueueRow({ item, projectSlug }: QueueRowProps) {
  const source = queueSource(item.source);

  return (
    <li className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <a
          href={`https://github.com/${projectSlug}/issues/${item.issue_number}`}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-4 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          #{item.issue_number}
        </a>
        {item.issue_title !== null && (
          <span className="min-w-0 flex-1 basis-40 truncate text-sm" title={item.issue_title}>
            {item.issue_title}
          </span>
        )}
        {source?.kind === "label" && <span className={BADGE}>label: {source.name}</span>}
        {source?.kind === "manual" && (
          <>
            <span
              className={BADGE}
              title="Added by hand with adw_queue.py add. Removing the issue's label does not take it out of the queue."
            >
              manual
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Removing the label does not remove it.
            </span>
          </>
        )}
        <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
          Queued{" "}
          {item.queued_at !== null ? (
            <Timestamp value={item.queued_at} />
          ) : (
            <span className="text-neutral-400 dark:text-neutral-600">none</span>
          )}
        </span>
      </div>
    </li>
  );
}
