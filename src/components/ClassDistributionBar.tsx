import { CLASS_FILL } from "@/lib/chart-colors";
import { classSegments } from "@/lib/daily-summary";
import type { DailySummary } from "@/types/adw";

interface ClassDistributionBarProps {
  counts: Pick<DailySummary, "runs" | "features" | "bugs" | "chores" | "patches">;
}

/**
 * The split of a day's runs by issue class in the per-project table: a compact
 * inline-SVG stacked bar with an accessible label listing every count (the
 * counts themselves are in the table's columns).
 */
export function ClassDistributionBar({ counts }: ClassDistributionBarProps) {
  const segments = classSegments(counts);
  if (segments.length === 0) return null;
  const label = `Issue classes: ${segments.map((s) => `${s.count} ${s.key}`).join(", ")}`;

  return (
    <div className="min-w-24">
      <svg
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        className="block h-2 w-full overflow-hidden rounded-sm"
        role="img"
        aria-label={label}
      >
        {segments.map((segment) => (
          <rect
            key={segment.key}
            x={segment.offset}
            y={0}
            width={segment.width}
            height={8}
            className={CLASS_FILL[segment.key]}
          />
        ))}
      </svg>
    </div>
  );
}
