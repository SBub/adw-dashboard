import Link from "next/link";
import { costLabel, summaryHref, tokensLabel } from "@/lib/daily-summary";
import { secondsLabel } from "@/lib/run-view";
import { STATUS_COLORS } from "@/lib/status-colors";
import type { SummaryProjectDay } from "@/types/adw";
import { ClassDistributionBar } from "./ClassDistributionBar";

interface ProjectBreakdownTableProps {
  rows: SummaryProjectDay[];
  days: number;
  /** The day's display date, for the table's caption. */
  label: string;
}

const HEAD = "px-2 py-1.5 font-medium";
const NUM = "px-2 py-1.5 text-right tabular-nums";

function countClass(n: number, status: "completed" | "failed") {
  return n === 0 ? STATUS_COLORS.neutral.text : STATUS_COLORS[status].text;
}

/**
 * One day's rows per project, with each project's exact medians. Scrolls
 * horizontally inside its card on a narrow screen.
 */
export function ProjectBreakdownTable({ rows, days, label }: ProjectBreakdownTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">Per project, {label}</caption>
        <thead className="text-left text-xs text-neutral-500 dark:text-neutral-400">
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            <th scope="col" className={HEAD}>
              Project
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Runs
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Completed
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Failed
            </th>
            <th scope="col" className={HEAD}>
              Classes
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Median duration
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Tokens in (sum / median)
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Tokens out (sum / median)
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Cost (sum / median)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.project_id}
              className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
            >
              <td className="px-2 py-1.5">
                <Link href={summaryHref(days, row.slug)} className="hover:underline">
                  {row.display_name}
                </Link>
              </td>
              <td className={NUM}>{row.runs}</td>
              <td className={`${NUM} ${countClass(row.completed, "completed")}`}>
                {row.completed}
              </td>
              <td className={`${NUM} ${countClass(row.failed, "failed")}`}>{row.failed}</td>
              <td className="px-2 py-1.5">
                <ClassDistributionBar counts={row} compact />
              </td>
              <td className={NUM}>{secondsLabel(row.median_duration_s) ?? "n/a"}</td>
              <td className={NUM}>
                {tokensLabel(row.tokens_in_sum)} / {tokensLabel(row.tokens_in_median)}
              </td>
              <td className={NUM}>
                {tokensLabel(row.tokens_out_sum)} / {tokensLabel(row.tokens_out_median)}
              </td>
              <td className={NUM}>
                {costLabel(row.cost_usd_sum)} / {costLabel(row.cost_usd_median)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
