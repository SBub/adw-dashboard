/**
 * The one place an issue class or a model gets a colour. Issue classes and
 * models are not states: they never use a status hue (those are
 * STATUS_COLORS's alone, see status-colors.ts and its guard test).
 *
 * - badge: the IssueClassBadge classes (border and text, light and dark).
 * - swatch: a background class for a legend dot.
 * - fill: an SVG fill for the charts, a `--chart-*` custom property defined in
 *   globals.css (on Tailwind's palette), so it follows dark mode without a
 *   class. The class hues there match the swatches here.
 *
 * Every class is written out in full because Tailwind finds classes by
 * scanning source text: never interpolate a hue name.
 */
import type { ClassKey } from "@/types/adw";

interface ClassColors {
  badge: string;
  swatch: string;
  fill: string;
}

export const CLASS_COLORS: Record<ClassKey, ClassColors> = {
  "/feature": {
    badge: "border-violet-300 text-violet-800 dark:border-violet-700 dark:text-violet-300",
    swatch: "bg-violet-500",
    fill: "var(--chart-class-feature)",
  },
  "/bug": {
    badge: "border-fuchsia-300 text-fuchsia-800 dark:border-fuchsia-700 dark:text-fuchsia-300",
    swatch: "bg-fuchsia-500",
    fill: "var(--chart-class-bug)",
  },
  "/chore": {
    badge: "border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300",
    swatch: "bg-neutral-400",
    fill: "var(--chart-class-chore)",
  },
  "/patch": {
    badge: "border-lime-300 text-lime-800 dark:border-lime-700 dark:text-lime-300",
    swatch: "bg-lime-500",
    fill: "var(--chart-class-patch)",
  },
  other: {
    badge: "border-neutral-300 text-neutral-600 dark:border-neutral-600 dark:text-neutral-400",
    swatch: "bg-neutral-300 dark:bg-neutral-600",
    fill: "var(--chart-class-other)",
  },
};

/** The model series' fills, in the order of the sorted model list; modelColor cycles them. */
export const MODEL_COLORS = [
  "var(--chart-model-1)",
  "var(--chart-model-2)",
  "var(--chart-model-3)",
  "var(--chart-model-4)",
  "var(--chart-model-5)",
  "var(--chart-model-6)",
] as const;

/** The fill of the tokens and cost no phase attributes to a model. */
export const UNATTRIBUTED_COLOR = "var(--chart-unattributed)";

/** The fill of the `index`-th series of a model (or project) list, cycling the palette. */
export function modelColor(index: number): string {
  return MODEL_COLORS[index % MODEL_COLORS.length] ?? MODEL_COLORS[0];
}
