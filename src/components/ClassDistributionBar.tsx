import { type ClassKey, classSegments } from "@/lib/daily-summary";
import type { DailySummary } from "@/types/adw";

// The issue class hues of IssueClassBadge, so a class has one colour across
// the app. Full literal class strings, so Tailwind sees them. Issue classes
// are not states: none of these is a status hue.
const FILL: Record<ClassKey, string> = {
  "/feature": "fill-violet-500",
  "/bug": "fill-fuchsia-500",
  "/chore": "fill-neutral-400",
  "/patch": "fill-lime-500",
  other: "fill-neutral-300 dark:fill-neutral-600",
};

const SWATCH: Record<ClassKey, string> = {
  "/feature": "bg-violet-500",
  "/bug": "bg-fuchsia-500",
  "/chore": "bg-neutral-400",
  "/patch": "bg-lime-500",
  other: "bg-neutral-300 dark:bg-neutral-600",
};

interface ClassDistributionBarProps {
  counts: Pick<DailySummary, "runs" | "features" | "bugs" | "chores" | "patches">;
  /** Hide the legend (the breakdown table, where the counts are in the bar's label). */
  compact?: boolean;
}

/**
 * The split of a day's runs by issue class: an inline-SVG stacked bar with an
 * accessible label listing every count, and a legend with the numbers as text.
 */
export function ClassDistributionBar({ counts, compact = false }: ClassDistributionBarProps) {
  const segments = classSegments(counts);
  if (segments.length === 0) return null;
  const label = `Issue classes: ${segments.map((s) => `${s.count} ${s.key}`).join(", ")}`;

  return (
    <div className={compact ? "min-w-24" : "space-y-1.5"}>
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
            className={FILL[segment.key]}
          />
        ))}
      </svg>
      {!compact && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`inline-block size-2 rounded-sm ${SWATCH[segment.key]}`}
              />
              <span className="font-mono">{segment.key}</span>
              <span className="tabular-nums">{segment.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
