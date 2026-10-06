import { costLabel, tokensLabel } from "@/lib/daily-summary";
import { formatDay } from "@/lib/format-date";
import { secondsLabel } from "@/lib/run-view";
import { STATUS_COLORS } from "@/lib/status-colors";
import type { SummaryReport } from "@/types/adw";
import { ClassDistributionBar } from "./ClassDistributionBar";
import { ProjectBreakdownTable } from "./ProjectBreakdownTable";

function Metric({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">{term}</dt>
      <dd className="mt-0.5 tabular-nums">{value}</dd>
    </div>
  );
}

/** The summary's days, newest first, one card per day. */
export function DailySummaryList({ report }: { report: SummaryReport }) {
  if (report.rows.length === 0 || report.to === null) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        No finished runs in this window.
      </p>
    );
  }
  const allProjects = report.project === null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {report.days === 1 ? "1 day" : `${report.days} days`} to{" "}
        <time dateTime={report.to}>{formatDay(report.to)}</time>
        {report.project ? `, ${report.project.display_name}` : ", all projects"}
      </p>
      {report.rows.map((day) => {
        const { totals } = day;
        const label = formatDay(day.day);
        return (
          <article
            key={day.day}
            className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="font-semibold">
                <time dateTime={day.day}>{label}</time>
              </h2>
              <span className="text-sm tabular-nums">
                {totals.runs} {totals.runs === 1 ? "run" : "runs"}
              </span>
              <span
                className={`text-sm tabular-nums ${totals.completed === 0 ? STATUS_COLORS.neutral.text : STATUS_COLORS.completed.text}`}
              >
                {totals.completed} completed
              </span>
              <span
                className={`text-sm tabular-nums ${totals.failed === 0 ? STATUS_COLORS.neutral.text : STATUS_COLORS.failed.text}`}
              >
                {totals.failed} failed
              </span>
              {totals.halted > 0 && (
                <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
                  {totals.halted} halted
                </span>
              )}
            </header>
            <ClassDistributionBar counts={totals} />
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <Metric term="Total duration" value={secondsLabel(totals.duration_sum_s)} />
              <Metric term="Tokens in" value={tokensLabel(totals.tokens_in_sum)} />
              <Metric term="Cache read" value={tokensLabel(totals.tokens_cache_read_sum)} />
              <Metric term="Tokens out" value={tokensLabel(totals.tokens_out_sum)} />
              <Metric term="Cost" value={costLabel(totals.cost_usd_sum)} />
            </dl>
            {allProjects && day.projects.length > 0 && (
              <ProjectBreakdownTable rows={day.projects} days={report.days} label={label} />
            )}
          </article>
        );
      })}
    </div>
  );
}
