import type { ReactNode } from "react";
import { columnHeights } from "@/lib/daily-summary";

export interface ChartColumn {
  key: string;
  value: number;
  /** The value as text, above its bar. */
  valueLabel: string;
  /** The column's name, under the plot, beside a colour dot when the chart has dots. */
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
  /** Unique on the page; the detail ids derive from it. */
  idPrefix: string;
  columns: ChartColumn[];
  /** The chart's text alternative. */
  summary: string;
  /** Shown in place of the columns, in a box of the plot's height, when there are none. */
  empty?: ReactNode;
  /** A dot of the bar's colour beside each name; off when every bar is the same gray. */
  dots?: boolean;
  /** Values tilted 45 degrees (the default); upright and centred when false, for short counts. */
  tiltValues?: boolean;
}

/** The guide lines, in percent of the plot height from its baseline. */
const GUIDES = [25, 50, 75, 100] as const;

/** An id fragment of `[A-Za-z0-9_-]` only. */
function idPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * A chart card: a bordered figure with a title and a muted subtitle, then
 * CSS columns on a 180px plot (`h-45`) over faint dotted guide lines, each
 * scaled to the chart's own maximum (columnHeights), with rounded tops and
 * a capped width. Every value sits above its bar, never inside it, in the
 * card's text colour and regular weight, rotated 45 degrees up to the right
 * from the bar's top centre (upright and centred over the bar when
 * `tiltValues` is false, for short counts), in a 56px band (`pt-14`) above the plot that
 * holds the tallest bar's value inside the card; the row keeps 16px of
 * right padding (`pr-4`) so the last column's tilted value stays inside the
 * card too. The rotation is a `transform`, not the `rotate` property. The name sits under the
 * plot, beside a dot of the bar's colour when `dots` (the default). Every
 * column takes an equal grid slot of at most 80px (`minmax(0, 5rem)`), never
 * sized from its name; the bar is capped at 28px (`max-w-7`) and centred in
 * its slot, so adjacent bars are equally spaced. A name wider than its slot wraps (under
 * its dot when there is one) and then inside the word, never widening the slot; four or more
 * columns take a 4px gap, so the row fits a one-third card at 1024px and a
 * stacked card at 375px. A column with
 * `detail` is focusable and holds a CSS-only popover (group hover and
 * focus-within, like SectionHeading's), always in the DOM and referenced by
 * `aria-describedby`. Stateless and without "use client": it computes no
 * business value and is rendered by the client TodaySummary too.
 */
export function ColumnChart({
  title,
  subtitle,
  idPrefix,
  columns,
  summary,
  empty,
  dots = true,
  tiltValues = true,
}: ColumnChartProps) {
  const heights = columnHeights(columns.map((column) => column.value));
  const gap = columns.length >= 4 ? "gap-1" : "gap-2 sm:gap-4";

  return (
    <figure className="min-w-0 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <figcaption className="mb-3">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</span>
      </figcaption>
      <p className="sr-only">{summary}</p>
      {columns.length === 0 ? (
        <div className="flex h-59 items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
          {empty}
        </div>
      ) : (
        <div className="relative">
          <div aria-hidden="true" className="absolute inset-x-0 top-14 h-45">
            {GUIDES.map((guide) => (
              <span
                key={guide}
                className="absolute inset-x-0 border-t border-dotted border-neutral-200 dark:border-neutral-800"
                style={{ bottom: `${guide}%` }}
              />
            ))}
          </div>
          <ul
            className={`relative grid items-start justify-center pr-4 ${gap}`}
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 5rem))` }}
          >
            {columns.map((column, i) => {
              const detailId = column.detail
                ? `${idPart(idPrefix)}-${idPart(column.key)}-detail`
                : undefined;
              const height = heights[i] ?? 0;
              return (
                <li
                  key={column.key}
                  aria-label={column.ariaLabel}
                  aria-describedby={detailId}
                  tabIndex={column.detail ? 0 : undefined}
                  className="group relative flex min-w-0 flex-col items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500"
                >
                  <span className="box-content flex h-45 w-full flex-col items-center justify-end pt-14">
                    <span className="relative h-0 w-full">
                      <span
                        data-value-placement="above"
                        className={`absolute bottom-1 left-1/2 text-xs whitespace-nowrap tabular-nums ${tiltValues ? "origin-bottom-left [transform:rotate(-45deg)]" : "-translate-x-1/2"}`}
                      >
                        {column.valueLabel}
                      </span>
                    </span>
                    <span
                      className={`flex min-h-px w-full max-w-7 rounded-t-md ${column.colorClass}`}
                      style={{ height: `${height}%` }}
                    />
                  </span>
                  <span className="mt-2 flex w-full min-w-0 flex-wrap items-center justify-center gap-1 text-center text-xs">
                    {dots && (
                      <span
                        aria-hidden="true"
                        className={`size-2 shrink-0 rounded-full ${column.colorClass}`}
                      />
                    )}
                    <span className="min-w-0 wrap-anywhere">{column.name}</span>
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
