// The one place an issue class or a model gets a chart colour. The class hues
// are IssueClassBadge's, so a class has one colour across the app; the model
// hues sit outside both the class and the status palettes. Full literal class
// strings, so Tailwind sees them. Neither classes nor models are states: none
// of these is a status hue.
import type { ClassKey } from "./daily-summary";
import type { ModelFamily } from "./model-usage";

/** Class fills for the SVG class bar (ClassDistributionBar). */
export const CLASS_FILL: Record<ClassKey, string> = {
  "/feature": "fill-violet-500",
  "/bug": "fill-fuchsia-500",
  "/chore": "fill-neutral-400",
  "/patch": "fill-lime-500",
  other: "fill-neutral-300 dark:fill-neutral-600",
};

/** The same class hues as backgrounds, for CSS columns (ClassColumnChart). */
export const CLASS_BG: Record<ClassKey, string> = {
  "/feature": "bg-violet-500",
  "/bug": "bg-fuchsia-500",
  "/chore": "bg-neutral-400",
  "/patch": "bg-lime-500",
  other: "bg-neutral-300 dark:bg-neutral-600",
};

/** Model family backgrounds, for CSS columns (ModelColumnChart). */
export const MODEL_BG: Record<ModelFamily, string> = {
  opus: "bg-indigo-500",
  sonnet: "bg-teal-500",
  haiku: "bg-orange-400",
  other: "bg-neutral-300 dark:bg-neutral-600",
};
