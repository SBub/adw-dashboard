"use client";

// Error boundary for the project segment. Rendered inside the two-pane shell
// when the page throws, so the sidebar stays put and the next project is one
// click away. notFound() does not land here; it renders not-found.tsx instead.
export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Could not load this project.</h1>
        {error.digest ? (
          <p className="mt-1 font-mono text-xs text-neutral-500 dark:text-neutral-400">
            {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
