import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { DailySummaryList } from "@/components/DailySummaryList";
import { SectionBoundary } from "@/components/SectionBoundary";
import { getDailySummary } from "@/data";
import { SUMMARY_DEFAULT_DAYS } from "@/lib/daily-summary";
import { summaryTag } from "@/lib/history-tags";

export const metadata: Metadata = {
  title: "ADW Dashboard: what an AI developer workflow gets done",
};

/**
 * The summary report, every visible project over SUMMARY_DEFAULT_DAYS days,
 * read inside a "use cache" scope tagged `summary`: one report, one entry
 * under the tag.
 *
 * It is called only from SummaryContent, after its connection() call, so it
 * is a hole resolved from the live cache handler on every request and the tag
 * drops reach it; prerendered into the shell it would be read from the
 * shell's Resume Data Cache, frozen at build time (the same reason as
 * getHistory on the project page; README, "What is prerendered and what is
 * not"). The lifetime is explicit. `stale` stays at 300 seconds because the
 * router cache's staleTimes.dynamic must stay at or under it. `revalidate` is
 * 15 minutes, not a day as for History: a run that finishes failed or halted,
 * and tokens and cost written after a completion, reach the view without any
 * tag drop, and this bounds how long they wait. `expire` is a day, well above
 * the 5 minutes under which the scope would stop being a cached hole.
 */
async function getSummary() {
  "use cache";
  cacheTag(summaryTag());
  cacheLife({ stale: 300, revalidate: 900, expire: 86400 });

  return getDailySummary(SUMMARY_DEFAULT_DAYS);
}

// The request-time island. The page reads no searchParams (there are no
// filters, issue #97), so connection() is the one request-time marker: it
// stops the prerender here and makes its SectionBoundary the hole. It is
// required; without it getSummary would be prerendered into the shell.
async function SummaryContent() {
  await connection();
  const report = await getSummary();

  return (
    <div className="mt-6">
      <DailySummaryList report={report} />
    </div>
  );
}

// Not async: the heading, the intro and the reading note are the static
// shell, the report is the hole.
export default function SummaryPage() {
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
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Times are UTC. Tokens and cost count runs that published metrics.
      </p>
      <SectionBoundary
        fallback={
          <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">Loading summary...</p>
        }
        detail="The summary did not load."
      >
        <SummaryContent />
      </SectionBoundary>
    </div>
  );
}
