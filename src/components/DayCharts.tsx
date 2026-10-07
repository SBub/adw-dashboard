import type { SummaryDay } from "@/types/adw";
import { ClassColumnChart } from "./ClassColumnChart";
import { ModelColumnChart } from "./ModelColumnChart";

/**
 * A day card's two column charts side by side, runs by class first, on one
 * baseline; they wrap onto two lines on a narrow screen. Stateless, rendered
 * by the past days and the client today card alike.
 */
export function DayCharts({ day }: { day: SummaryDay }) {
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
      <ClassColumnChart counts={day.totals} day={day.day} />
      <ModelColumnChart models={day.models} day={day.day} />
    </div>
  );
}
