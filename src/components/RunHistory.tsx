import type { Run } from "@/types/adw";
import { RunRow } from "./RunRow";

interface RunHistoryProps {
  /** Completed runs, as stored, most recently updated first. */
  runs: Run[];
  projectSlug: string;
}

/**
 * The History section: the project's completed runs. A server component with
 * no state: history is completed-only now (a failed run can be resumed, so it
 * is live and shown under Active), which is what made the all/completed/failed
 * toggle redundant. The page renders it from a "use cache" scope tagged per
 * project; it is not in the query cache and no Realtime event touches it.
 */
export function RunHistory({ runs, projectSlug }: RunHistoryProps) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">History</h2>
      {runs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No completed runs yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {runs.map((run) => (
            <RunRow key={run.adw_id} run={run} projectSlug={projectSlug} variant="history" />
          ))}
        </ul>
      )}
    </section>
  );
}
