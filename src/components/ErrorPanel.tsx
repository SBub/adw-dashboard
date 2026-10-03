/**
 * The default failed-state panel shared by QueryBoundary and SectionBoundary:
 * a heading, an optional detail line naming what did not load, and a Retry
 * button. It knows nothing about what failed or how a retry works; each
 * boundary passes the `retry` that is right for its kind of child.
 */
export function ErrorPanel({ detail, retry }: { detail?: string; retry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-dashed border-neutral-300 p-4 text-center dark:border-neutral-700"
    >
      <p className="text-sm font-semibold tracking-tight">Could not load.</p>
      {detail ? (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>
      ) : null}
      <button
        type="button"
        onClick={retry}
        className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Retry
      </button>
    </div>
  );
}
