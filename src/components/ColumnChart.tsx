import type { ReactNode } from "react";
import { barValueInside, columnHeights } from "@/lib/daily-summary";

export interface ChartColumn {
  key: string;
  value: number;
  /** The value as text, inside the bar or just above a bar too short for it. */
  valueLabel: string;
  /** The column's name, under the plot beside a colour dot. */
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
  /** One muted line under the title. */
  subtitle: string;
  /** The caption's square, a full literal class string from src/lib/chart-colors.ts. */
  swatchClass: string;
  /** Unique on the page; the detail ids derive from it. */
  idPrefix: string;
  columns: ChartColumn[];
  /** The chart's text alternative. */
  summary: string;
  /** Shown in place of the columns, in a box of the plot's height, when there are none. */
  empty?: ReactNode;
}

/** The guide lines, in percent of the plot height from its baseline. */
const GUIDES = [25, 50, 75, 100] as const;

/** An id fragment of `[A-Za-z0-9_-]` only. */
function idPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * A chart card: a bordered figure with a coloured square, a title and a
 * muted subtitle, then CSS columns on a 180px plot (`h-45`) over faint dotted
 * guide lines, each scaled to the chart's own maximum (columnHeights), with
 * rounded tops and a capped width. The value sits inside the bar in white
 * when barValueInside says the bar holds it, otherwise just above the bar;
 * the name sits under the plot beside a dot of the bar's colour. A column
 * with `detail` is focusable and holds a CSS-only popover (group hover and
 * focus-within, like SectionHeading's), always in the DOM and referenced by
 * `aria-describedby`. Stateless and without "use client": it computes no
 * business value and is rendered by the client TodaySummary too.
 */
export function ColumnChart({
  title,
  subtitle,
  swatchClass,
  idPrefix,
  columns,
  summary,
  empty,
}: ColumnChartProps) {
  const heights = columnHeights(columns.map((column) => column.value));

  return (
    <figure className="min-w-0 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <figcaption className="mb-3">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${swatchClass}`} />
          <span className="text-sm font-medium">{title}</span>
        </span>
        <span className="block text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</span>
      </figcaption>
      <p className="sr-only">{summary}</p>
      {columns.length === 0 ? (
        <div className="flex h-45 items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
          {empty}
        </div>
      ) : (
        <div className="relative">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-45">
            {GUIDES.map((guide) => (
              <span
                key={guide}
                className="absolute inset-x-0 border-t border-dotted border-neutral-200 dark:border-neutral-800"
                style={{ bottom: `${guide}%` }}
              />
            ))}
          </div>
          <ul className="relative flex items-start justify-center gap-2 sm:gap-4">
            {columns.map((column, i) => {
              const detailId = column.detail
                ? `${idPart(idPrefix)}-${idPart(column.key)}-detail`
                : undefined;
              const height = heights[i] ?? 0;
              const inside = barValueInside(height);
              return (
                <li
                  key={column.key}
                  aria-label={column.ariaLabel}
                  aria-describedby={detailId}
                  tabIndex={column.detail ? 0 : undefined}
                  className="group relative flex max-w-20 min-w-12 flex-1 flex-col items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500"
                >
                  <span className="flex h-45 w-full flex-col items-center justify-end">
                    {!inside && (
                      <span data-value-placement="above" className="mb-1 text-xs tabular-nums">
                        {column.valueLabel}
                      </span>
                    )}
                    <span
                      className={`flex min-h-px w-full max-w-14 items-center justify-center rounded-t-md ${column.colorClass}`}
                      style={{ height: `${height}%` }}
                    >
                      {inside && (
                        <span
                          data-value-placement="inside"
                          className="text-xs font-semibold tabular-nums text-white"
                        >
                          {column.valueLabel}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="mt-2 flex items-center gap-1 whitespace-nowrap text-xs">
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${column.colorClass}`}
                    />
                    {column.name}
                  </span>
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
                              <dt className="text-neutral-500 dark:text-neutral-400">
                                {row.label}
                              </dt>
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
        </div>
      )}
    </figure>
  );
}
