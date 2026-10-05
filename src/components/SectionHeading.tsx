import type { ReactNode } from "react";

interface SectionHeadingProps {
  title: string;
  /** One short line, always visible, muted, under the heading row. */
  description: ReactNode;
  /** A longer sentence behind the info button: hover, keyboard focus, screen readers. */
  detail?: string;
  /** Rendered right after the title and info button, in the left group (History's search box). */
  controls?: ReactNode;
  /** Rendered at the right edge of the row; below `md` on its own line, right-aligned (History's pagination). */
  actions?: ReactNode;
}

/**
 * A section's `<h2>`, an always-visible muted description under it (the path
 * on touch devices, where nothing hovers) and, when `detail` is set, an info
 * button next to the title. A server component with no state: the detail is
 * CSS-only, shown while the button's group is hovered or holds focus, so it
 * needs no client JS. It is always in the DOM, `sr-only` while hidden, and
 * referenced by the button's `aria-describedby`, so screen readers announce
 * it on focus. Its id is derived from the title, deterministic, so server and
 * client markup agree; the titles are unique on the page.
 *
 * `not-sr-only` resets position, width and padding, so the element it toggles
 * carries none of them: the positioned wrapper sits around it and the surface
 * inside it. The wrapper hangs from the bottom of the title row (`top-full`),
 * and the group stretches to that row's full height (`self-stretch`), so the
 * hover area runs without a gap from the button through the wrapper's `pt-2`
 * bridge onto the popover.
 *
 * The row owns the layout: `controls` stays next to the title and `actions`
 * stays at the right edge, whatever either renders.
 */
export function SectionHeading({
  title,
  description,
  detail,
  controls,
  actions,
}: SectionHeadingProps) {
  const detailId = `section-${title.toLowerCase()}-detail`;

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex items-center gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            {detail && (
              <span className="group inline-flex items-center self-stretch">
                <button
                  type="button"
                  aria-label={`About ${title}`}
                  aria-describedby={detailId}
                  className="inline-flex size-5 items-center justify-center rounded-full text-neutral-500 hover:text-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  <InfoIcon />
                </button>
                <span className="absolute top-full left-0 z-10 pt-2">
                  <span
                    id={detailId}
                    role="tooltip"
                    className="sr-only group-focus-within:not-sr-only group-hover:not-sr-only"
                  >
                    <span className="block w-72 max-w-[calc(100vw-2rem)] rounded-md border border-neutral-200 bg-white p-3 text-sm font-normal text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
                      {detail}
                    </span>
                  </span>
                </span>
              </span>
            )}
          </div>
          {controls}
        </div>
        {actions && (
          <div className="ml-auto flex shrink-0 justify-end empty:hidden max-md:basis-full">
            {actions}
          </div>
        )}
      </div>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7.25v4" />
      <circle cx="8" cy="4.75" r="0.5" fill="currentColor" />
    </svg>
  );
}
