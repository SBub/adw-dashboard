import type { Run } from "@/types/adw";
import { RunRow } from "./RunRow";

interface RunHistoryListProps {
  /** One page of completed runs, as stored, most recently updated first. */
  runs: Run[];
  projectSlug: string;
  /** The empty state's text; the page words it for a search with no match. */
  emptyMessage: string;
}

/**
 * One page of the project's completed runs, or the empty state. A server
 * component with no state: history is completed-only (a failed run can be
 * resumed, so it is live and shown under Active). The page's CompletedRuns
 * renders it from a "use cache" scope tagged per project; it is not in the
 * query cache and no Realtime event touches it.
 */
export function RunHistoryList({ runs, projectSlug, emptyMessage }: RunHistoryListProps) {
  if (runs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {runs.map((run) => (
        <RunRow key={run.adw_id} run={run} projectSlug={projectSlug} variant="history" />
      ))}
    </ul>
  );
}
