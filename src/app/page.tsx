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
  title: "ADW Dashboard: what an AI developer workflow gets done",
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
      <div className="space-y-2">
        <SummaryFilters projects={report.projects} project={project} days={days} />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Times are UTC. Tokens and cost count runs that published metrics.
        </p>
      </div>
      <DailySummaryList report={report} />
    </div>
  );
}

// Not async, and searchParams is handed down unawaited: the heading and the
// intro are the static shell, the report is the hole.
export default function SummaryPage({ searchParams }: SummaryPageProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        What an AI developer workflow gets done
      </h1>
      <p className="mt-2 max-w-[70ch] text-base text-neutral-700 dark:text-neutral-300">
        ADW is an autonomous pipeline that takes a GitHub issue and plans, builds, tests, reviews
        and documents the change, then opens a pull request and merges it once checks are green.
        This page is its public ledger: every finished run per day across the connected
        repositories, what kind of work it was, how long it took, how many tokens it used and what
        it cost. Pick a project in the header to watch runs live.
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
