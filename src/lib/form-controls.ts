/**
 * The one place the summary's filter controls get their box. The selects
 * reset the native appearance: with `appearance: auto` WebKit on macOS draws
 * the native pill control, which ignores height, padding and most border
 * styling. The selects and the button share one explicit height, so a row
 * aligned to the bottom edge gives all three one centre line. The chevron the
 * reset removes is drawn by the component, positioned with
 * `FORM_SELECT_CHEVRON` over the select's right padding.
 *
 * Every class is written out in full because Tailwind finds classes by
 * scanning source text: interpolate whole class strings only, never part of a
 * class name.
 */
const CONTROL =
  "h-8 rounded-md border border-neutral-300 text-sm leading-none dark:border-neutral-700";

export const FORM_SELECT = `${CONTROL} appearance-none [-webkit-appearance:none] bg-white pl-2 pr-8 dark:bg-neutral-900`;

export const FORM_BUTTON = `${CONTROL} px-3 hover:border-neutral-500 dark:hover:border-neutral-500`;

export const FORM_SELECT_CHEVRON =
  "pointer-events-none absolute inset-y-0 right-2 my-auto text-neutral-500 dark:text-neutral-400";
