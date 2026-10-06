import { formatDay } from "@/lib/format-date";
import type { SummaryReport } from "@/types/adw";
import { SummaryDayCard } from "./SummaryDayCard";

/**
 * The summary's past days (the window ends the day before today), newest
 * first, one card per day. Today is not here: TodaySummary shows it above.
 */
export function DailySummaryList({ report }: { report: SummaryReport }) {
  const span = report.days === 1 ? "day" : `${report.days} days`;
  if (report.rows.length === 0 || report.to === null) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        No finished runs in the previous {span}.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {report.days === 1 ? "1 day" : `${report.days} days`} to{" "}
        <time dateTime={report.to}>{formatDay(report.to)}</time>, all projects
      </p>
      {report.rows.map((day) => (
        <SummaryDayCard key={day.day} day={day} />
      ))}
    </div>
  );
}
