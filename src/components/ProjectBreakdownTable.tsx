import { costLabel, tokensLabel } from "@/lib/daily-summary";
import { secondsLabel } from "@/lib/run-view";
import { STATUS_COLORS } from "@/lib/status-colors";
import type { SummaryDay, SummaryProjectDay } from "@/types/adw";
import { ClassDistributionBar } from "./ClassDistributionBar";

interface ProjectBreakdownTableProps {
  rows: SummaryProjectDay[];
  /** The day's sums over `rows` (`day.totals` from the report); rendered as the Total row, never recomputed here. */
  totals: SummaryDay["totals"];
  /** The day's display date, for the table's caption. */
  label: string;
}

const HEAD = "px-2 py-1.5 font-medium";
const NUM = "px-2 py-1.5 text-right tabular-nums";

function countClass(n: number, status: "completed" | "failed") {
  return n === 0 ? STATUS_COLORS.neutral.text : STATUS_COLORS[status].text;
}

/**
 * One day's rows per project, each value that project's sum for the day,
 * and a last Total row with the day's sums as given. Scrolls horizontally inside its card on a narrow screen.
 */
export function ProjectBreakdownTable({ rows, totals, label }: ProjectBreakdownTableProps) {
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
              Total duration
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Tokens in
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Cache read
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Tokens out
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Cost
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.project_id}
              className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
            >
              <td className="px-2 py-1.5">{row.display_name}</td>
              <td className={NUM}>{row.runs}</td>
              <td className={`${NUM} ${countClass(row.completed, "completed")}`}>
                {row.completed}
              </td>
              <td className={`${NUM} ${countClass(row.failed, "failed")}`}>{row.failed}</td>
              <td className="px-2 py-1.5">
                <ClassDistributionBar counts={row} compact />
              </td>
              <td className={NUM}>{secondsLabel(row.duration_sum_s)}</td>
              <td className={NUM}>{tokensLabel(row.tokens_in_sum)}</td>
              <td className={NUM}>{tokensLabel(row.tokens_cache_read_sum)}</td>
              <td className={NUM}>{tokensLabel(row.tokens_out_sum)}</td>
              <td className={NUM}>{costLabel(row.cost_usd_sum)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-300 font-medium dark:border-neutral-700">
            <th scope="row" className="px-2 py-1.5 text-left">
              Total
            </th>
            <td className={NUM}>{totals.runs}</td>
            <td className={`${NUM} ${countClass(totals.completed, "completed")}`}>
              {totals.completed}
            </td>
            <td className={`${NUM} ${countClass(totals.failed, "failed")}`}>{totals.failed}</td>
            <td className="px-2 py-1.5">
              <ClassDistributionBar counts={totals} compact />
            </td>
            <td className={NUM}>{secondsLabel(totals.duration_sum_s)}</td>
            <td className={NUM}>{tokensLabel(totals.tokens_in_sum)}</td>
            <td className={NUM}>{tokensLabel(totals.tokens_cache_read_sum)}</td>
            <td className={NUM}>{tokensLabel(totals.tokens_out_sum)}</td>
            <td className={NUM}>{costLabel(totals.cost_usd_sum)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
