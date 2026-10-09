// The one accent colour: the "/bug" class hue (fuchsia, CLASS_BG in
// src/lib/chart-colors.ts), used by the header's Hire me button and the hire
// form's Send button, so the two always match. It is a class hue, not a status
// hue. The 500 fill of the chart fails WCAG AA with a white label, so the
// button uses 700 (hover 800) in both modes. Full literal class strings, so
// Tailwind sees every one of them.
export const HIRE_ACCENT =
  "bg-fuchsia-700 text-white hover:bg-fuchsia-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700 dark:focus-visible:outline-fuchsia-400";
