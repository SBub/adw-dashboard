import { SUMMARY_DAY_OPTIONS } from "@/lib/daily-summary";
import { FORM_BUTTON, FORM_SELECT, FORM_SELECT_CHEVRON } from "@/lib/form-controls";
import type { SummaryProject } from "@/types/adw";

interface SummaryFiltersProps {
  projects: SummaryProject[];
  project: string | null;
  days: number;
}

/**
 * The summary's project and window filters: a plain GET form, so the browser
 * builds the query string and no client state or router call is needed. The
 * selects stay native; their box and the button's come from
 * `src/lib/form-controls.ts`, and each select's chevron is drawn here. The
 * wrapper is `flex` so it is exactly the select's height, with no line box
 * below an inline select to push it off the button's centre line.
 */
export function SummaryFilters({ projects, project, days }: SummaryFiltersProps) {
  const dayOptions: readonly number[] = SUMMARY_DAY_OPTIONS.includes(
    days as (typeof SUMMARY_DAY_OPTIONS)[number],
  )
    ? SUMMARY_DAY_OPTIONS
    : [...SUMMARY_DAY_OPTIONS, days].sort((a, b) => a - b);

  return (
    <form method="get" action="/" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
        Project
        <span className="relative flex">
          <select name="project" defaultValue={project ?? ""} className={FORM_SELECT}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.display_name}
              </option>
            ))}
          </select>
          <ChevronIcon />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
        Window
        <span className="relative flex">
          <select name="days" defaultValue={String(days)} className={FORM_SELECT}>
            {dayOptions.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Last day" : `Last ${n} days`}
              </option>
            ))}
          </select>
          <ChevronIcon />
        </span>
      </label>
      <button type="submit" className={FORM_BUTTON}>
        Apply
      </button>
    </form>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={FORM_SELECT_CHEVRON}
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
