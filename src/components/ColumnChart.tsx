import type { ReactNode } from "react";
import { columnHeights } from "@/lib/daily-summary";

export interface ChartColumn {
  key: string;
  value: number;
  /** The value as text, above the column. */
  valueLabel: string;
  /** The column's name, below it. */
  name: ReactNode;
  /** The column's accessible label, with its value. */
  ariaLabel: string;
  /** The bar's background, a full literal class string from src/lib/chart-colors.ts. */
  colorClass: string;
  /** Rows shown on hover and keyboard focus. */
  detail?: { label: string; value: string }[];
}

interface ColumnChartProps {
  title: string;
  /** Unique on the page; the detail ids derive from it. */
  idPrefix: string;
  columns: ChartColumn[];
  /** The chart's text alternative. */
  summary: string;
  /** Shown in place of the columns, in a box of the same height, when there are none. */
  empty?: ReactNode;
}

/** An id fragment of `[A-Za-z0-9_-]` only. */
function idPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * A small column chart: CSS columns on a shared baseline, each scaled to the
 * chart's own maximum (columnHeights), the value above and the name below.
 * Every plot box is `h-12`, so two charts side by side share one baseline and
 * one height. A column with `detail` is focusable and holds a CSS-only
 * popover (group hover and focus-within, like SectionHeading's), always in
 * the DOM and referenced by `aria-describedby`. Stateless and without
 * "use client": it computes no business value and is rendered by the client
 * TodaySummary too.
 */
export function ColumnChart({ title, idPrefix, columns, summary, empty }: ColumnChartProps) {
  const heights = columnHeights(columns.map((column) => column.value));

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {title}
      </figcaption>
      <p className="sr-only">{summary}</p>
      {columns.length === 0 ? (
        <div className="flex h-20 items-center text-xs text-neutral-500 dark:text-neutral-400">
          {empty}
        </div>
      ) : (
        <ul className="flex items-end gap-2">
          {columns.map((column, i) => {
            const detailId = column.detail
              ? `${idPart(idPrefix)}-${idPart(column.key)}-detail`
              : undefined;
            return (
              <li
                key={column.key}
                aria-label={column.ariaLabel}
                aria-describedby={detailId}
                tabIndex={column.detail ? 0 : undefined}
                className="group relative flex w-12 flex-col items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500"
              >
                <span className="text-xs tabular-nums">{column.valueLabel}</span>
                <span className="flex h-12 items-end">
                  <span
                    className={`block min-h-px w-6 rounded-t-sm ${column.colorClass}`}
                    style={{ height: `${heights[i] ?? 0}%` }}
                  />
                </span>
                <span className="w-full truncate text-center text-xs">{column.name}</span>
                {column.detail && (
                  <span
                    id={detailId}
                    role="tooltip"
                    className="absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 pb-1 group-focus-within:block group-hover:block"
                  >
                    <span className="block w-max rounded-md border border-neutral-200 bg-white p-2 text-xs text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
                      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
                        {column.detail.map((row) => (
                          <div key={row.label} className="contents">
                            <dt className="text-neutral-500 dark:text-neutral-400">{row.label}</dt>
                            <dd className="text-right tabular-nums">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
