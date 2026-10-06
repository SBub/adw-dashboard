/**
 * The one place a run or queue state gets a colour. Every surface that shows
 * a state (StatusBadge, the sidebar counts, the queue rows) reads it here.
 *
 * - queued: amber, waiting, not yet alive.
 * - running: emerald, with the pulse dot, alive right now.
 * - completed: sky, finished well.
 * - failed: rose, needs attention.
 * - neutral: a zero count, nothing to see.
 *
 * Light mode is 700 text on a 100 background, dark mode 400 text on a 950
 * background. Every class is written out in full because Tailwind finds
 * classes by scanning source text: never interpolate a hue name.
 *
 * The sidebar's connection pill (ConnectionIndicator) keeps its own colours on
 * purpose: it describes the socket, not a run, and it is the one exemption in
 * status-colors.test.ts. Issue class badges are not states and use hues
 * outside this palette.
 */
import type { RunStatus } from "@/types/adw";

export type StatusKey = RunStatus | "queued";

interface StatusColors {
  text: string;
  badge: string;
  border: string;
  dot: string;
}

export const STATUS_COLORS: Record<StatusKey | "neutral", StatusColors> = {
  queued: {
    text: "text-amber-700 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    border: "border-amber-300 dark:border-amber-700",
    dot: "bg-amber-500",
  },
  running: {
    text: "text-emerald-700 dark:text-emerald-400",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    border: "border-emerald-300 dark:border-emerald-700",
    dot: "bg-emerald-500",
  },
  completed: {
    text: "text-sky-700 dark:text-sky-400",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
    border: "border-sky-300 dark:border-sky-700",
    dot: "bg-sky-500",
  },
  failed: {
    text: "text-rose-700 dark:text-rose-400",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
    border: "border-rose-300 dark:border-rose-700",
    dot: "bg-rose-500",
  },
  neutral: {
    text: "text-neutral-400 dark:text-neutral-600",
    badge: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-400",
    border: "border-neutral-300 dark:border-neutral-600",
    dot: "bg-neutral-400",
  },
};
