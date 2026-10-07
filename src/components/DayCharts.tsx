import type { SummaryDay } from "@/types/adw";
import { ClassColumnChart } from "./ClassColumnChart";
import { ModelColumnChart } from "./ModelColumnChart";

/**
 * A day card's two chart cards, work by class first: side by side from 640px
 * (`sm`), stacked below. Stateless, rendered by the past days and the client
 * today card alike.
 */
export function DayCharts({ day }: { day: SummaryDay }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ClassColumnChart counts={day.totals} day={day.day} />
      <ModelColumnChart models={day.models} day={day.day} />
    </div>
  );
}
