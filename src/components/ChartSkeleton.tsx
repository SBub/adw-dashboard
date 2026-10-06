/**
 * A chart's placeholder: the server HTML and the lazy chart's loading state,
 * the same height as the chart so nothing shifts when it arrives. No state.
 */
export function ChartSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading chart"
      className="h-72 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900"
    >
      <span className="sr-only">Loading chart</span>
    </div>
  );
}
