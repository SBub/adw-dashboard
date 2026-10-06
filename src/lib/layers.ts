/**
 * The section tooltip's z-index class (the detail popover of
 * `SectionHeading`), the topmost layer of the page. Every other `z-<n>` in
 * `src/` stays below it, pinned by `layers.test.ts`. Written out in full so
 * Tailwind sees it.
 */
export const TOOLTIP_LAYER = "z-50";
