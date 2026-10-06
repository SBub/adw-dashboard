import { SUMMARY_DAY_OPTIONS } from "@/lib/daily-summary";
import type { SummaryProject } from "@/types/adw";

interface SummaryFiltersProps {
  projects: SummaryProject[];
  project: string | null;
  days: number;
}

const SELECT =
  "rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900";

/**
 * The summary's project and window filters: a plain GET form, so the browser
 * builds the query string and no client state or router call is needed.
 */
export function SummaryFilters({ projects, project, days }: SummaryFiltersProps) {
  const dayOptions: readonly number[] = SUMMARY_DAY_OPTIONS.includes(
    days as (typeof SUMMARY_DAY_OPTIONS)[number],
  )
    ? SUMMARY_DAY_OPTIONS
    : [...SUMMARY_DAY_OPTIONS, days].sort((a, b) => a - b);

  return (
    <form method="get" action="/summary" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
        Project
        <select name="project" defaultValue={project ?? ""} className={SELECT}>
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
        <select name="days" defaultValue={String(days)} className={SELECT}>
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
    </form>
  );
}
