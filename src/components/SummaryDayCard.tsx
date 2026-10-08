import type { ReactNode } from "react";
import { formatDay } from "@/lib/format-date";
import { STATUS_COLORS } from "@/lib/status-colors";
import type { SummaryDay } from "@/types/adw";
import { DayCharts } from "./DayCharts";
import { ProjectBreakdownTable } from "./ProjectBreakdownTable";

/**
 * One day of the summary, with its heading, counts, class, model and phase charts
 * and per-project table. Stateless and without "use client", so both the
 * server-rendered past days (DailySummaryList) and the client today card
 * (TodaySummary) render the same markup. `title` replaces the date heading's content, `actions` sits at
 * the end of the header row.
 */
export function SummaryDayCard({
  day,
  title,
  actions,
}: {
  day: SummaryDay;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  const { totals } = day;
  const label = formatDay(day.day);
  return (
    <article className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-semibold">{title ?? <time dateTime={day.day}>{label}</time>}</h2>
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
        {actions}
      </header>
      <DayCharts day={day} />
      {day.projects.length > 0 && (
        <ProjectBreakdownTable rows={day.projects} totals={totals} label={label} />
      )}
    </article>
  );
}
