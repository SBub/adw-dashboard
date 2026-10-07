import type { SummaryDay } from "@/types/adw";
import { ClassColumnChart } from "./ClassColumnChart";
import { ModelColumnChart } from "./ModelColumnChart";
import { PhaseColumnChart } from "./PhaseColumnChart";

/**
 * A day card's three chart cards, work by class first, then tokens by model
 * and cost by phase: one row from 1024px (`lg`), stacked below. Stateless,
 * rendered by the past days and the client today card alike.
 */
export function DayCharts({ day }: { day: SummaryDay }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <ClassColumnChart counts={day.totals} day={day.day} />
      <ModelColumnChart models={day.models} day={day.day} />
      <PhaseColumnChart phases={day.phases} day={day.day} />
    </div>
  );
}
