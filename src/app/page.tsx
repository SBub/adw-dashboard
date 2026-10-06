import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { DailySummaryList } from "@/components/DailySummaryList";
import { SectionBoundary } from "@/components/SectionBoundary";
import { SummaryFilters } from "@/components/SummaryFilters";
import { getDailySummary } from "@/data";
import { readSummaryDays, readSummaryProject } from "@/lib/daily-summary";
import { summaryTag } from "@/lib/history-tags";

export const metadata: Metadata = {
  title: "Summary | ADW Dashboard",
};

type SearchParams = { [key: string]: string | string[] | undefined };

interface SummaryPageProps {
  searchParams: Promise<SearchParams>;
}

/**
 * The summary report for one window and one project filter (null for all),
 * read inside a "use cache" scope tagged `summary`, one tag for every window
 * and every filter (both are arguments, so each is its own entry under it).
 *
 * It is called only from SummaryContent, after its request-time searchParams
 * read, so it is a hole resolved from the live cache handler on every request
 * and the tag drops reach it; prerendered into the shell it would be read from
 * the shell's Resume Data Cache, frozen at build time (the same reason as
 * getHistory on the project page; README, "What is prerendered and what is
 * not"). The lifetime is explicit. `stale` stays at 300 seconds because the
 * router cache's staleTimes.dynamic must stay at or under it. `revalidate` is
 * 15 minutes, not a day as for History: a run that finishes failed or halted,
 * and tokens and cost written after a completion, reach the view without any
 * tag drop, and this bounds how long they wait. `expire` is a day, well above
 * the 5 minutes under which the scope would stop being a cached hole.
 */
async function getSummary(days: number, project: string | null) {
  "use cache";
  cacheTag(summaryTag());
  cacheLife({ stale: 300, revalidate: 900, expire: 86400 });

  return getDailySummary(days, project);
}

// The request-time island. It awaits searchParams first, which stops the
// prerender here and makes its SectionBoundary the hole; there is no
// connection() call, which after that read would be a redundant second marker
// (the History rule in AGENTS.md). `?days` and `?project` are normalised here,
// outside the cache scope, and never surface an error.
async function SummaryContent({ searchParams }: SummaryPageProps) {
  const { days: rawDays, project: rawProject } = await searchParams;
  const days = readSummaryDays(rawDays);
  const project = readSummaryProject(rawProject);
  const report = await getSummary(days, project);

  if (report === null) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        No public project named {project}.{" "}
        <Link href="/" className="underline hover:text-neutral-900 dark:hover:text-neutral-100">
          Show all projects
        </Link>
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <SummaryFilters projects={report.projects} project={project} days={days} />
      <DailySummaryList report={report} />
    </div>
  );
}

// Not async, and searchParams is handed down unawaited: the heading and the
// description are the static shell, the report is the hole.
export default function SummaryPage({ searchParams }: SummaryPageProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Summary</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Finished runs per UTC day: what kind of work, how long, and what it cost. Totals per day;
        tokens and cost count runs that published metrics.
      </p>
      <SectionBoundary
        fallback={
          <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">Loading summary...</p>
        }
        detail="The summary did not load."
      >
        <SummaryContent searchParams={searchParams} />
      </SectionBoundary>
    </div>
  );
}
