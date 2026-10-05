import Link from "next/link";
import type { Run } from "@/types/adw";
import { RunRow } from "./RunRow";

interface RunHistoryProps {
  /** One page of completed runs, as stored, most recently updated first. */
  runs: Run[];
  projectSlug: string;
  /** The URL of the newer page, or null on page one. */
  newerHref: string | null;
  /** The URL of the older page, or null on the last page. */
  olderHref: string | null;
}

const PAGE_LINK = "text-sm text-neutral-600 hover:underline dark:text-neutral-400";

/**
 * The History section: one page of the project's completed runs, with Newer
 * and Older links in the header when those pages exist. A server component
 * with no state: history is completed-only (a failed run can be resumed, so it
 * is live and shown under Active), and the page builds both hrefs and passes
 * them in. The page renders it from a "use cache" scope tagged per project; it
 * is not in the query cache and no Realtime event touches it.
 */
export function RunHistory({ runs, projectSlug, newerHref, olderHref }: RunHistoryProps) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">History</h2>
        {(newerHref !== null || olderHref !== null) && (
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
        )}
      </div>
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
