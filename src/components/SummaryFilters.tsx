import Form from "next/form";
import { SUMMARY_DAY_OPTIONS } from "@/lib/daily-summary";
import { SUMMARY_FILTER_FORM_ID } from "@/lib/summary-charts";
import type { SummaryProject } from "@/types/adw";

interface SummaryFiltersProps {
  projects: SummaryProject[];
  project: string | null;
  days: number;
}

/** The summary's select style, shared with the chart selectors in SummaryCharts. */
export const SUMMARY_SELECT =
  "rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900";

/**
 * The summary's project and window filters: a GET form through next/form, so
 * applying it is a client-side navigation (a plain GET without JavaScript)
 * and the browser builds the query string. The chart selectors join it with
 * `form={SUMMARY_FILTER_FORM_ID}`, so the URL carries all four parameters.
 */
export function SummaryFilters({ projects, project, days }: SummaryFiltersProps) {
  const dayOptions: readonly number[] = SUMMARY_DAY_OPTIONS.includes(
    days as (typeof SUMMARY_DAY_OPTIONS)[number],
  )
    ? SUMMARY_DAY_OPTIONS
    : [...SUMMARY_DAY_OPTIONS, days].sort((a, b) => a - b);

  return (
    <Form action="/summary" id={SUMMARY_FILTER_FORM_ID} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
        Project
        <select name="project" defaultValue={project ?? ""} className={SUMMARY_SELECT}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.display_name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
        Window
        <select name="days" defaultValue={String(days)} className={SUMMARY_SELECT}>
          {dayOptions.map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "Last day" : `Last ${n} days`}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-500"
      >
        Apply
      </button>
    </Form>
  );
}
