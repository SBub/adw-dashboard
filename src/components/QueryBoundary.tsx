"use client";

import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { type ReactNode, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

type QueryBoundaryProps = {
  children: ReactNode;
  /** Shown while a query under the boundary suspends. */
  fallback: ReactNode;
  /** One line under the default panel's heading, naming what did not load. */
  detail?: string;
  /** Replaces the default panel. Call `retry` to reset the boundary and refetch. */
  errorFallback?: (retry: () => void) => ReactNode;
};

function DefaultErrorPanel({ detail, retry }: { detail?: string; retry: () => void }) {
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

/**
 * The boundary every suspended query is rendered inside: a Suspense boundary
 * for the pending state and an error boundary for the failed one.
 *
 * useSuspenseQuery throws a failed fetch to the nearest error boundary, and
 * React Query keeps that error on the query. A plain error boundary reset
 * would re-mount the child, which reads the same errored query and throws
 * again, so Retry would loop on the cached error. useQueryErrorResetBoundary
 * provides the reset that clears that state; wired through onReset, it runs
 * before the child re-mounts, so the re-mounted query refetches instead.
 *
 * Renders inside Providers: the queries it guards read the client the
 * provider holds, and that is the client whose error state the reset clears.
 */
export function QueryBoundary({ children, fallback, detail, errorFallback }: QueryBoundaryProps) {
  const { reset } = useQueryErrorResetBoundary();

  return (
    <ErrorBoundary
      onReset={reset}
      fallbackRender={({ resetErrorBoundary }) =>
        errorFallback ? (
          errorFallback(resetErrorBoundary)
        ) : (
          <DefaultErrorPanel detail={detail} retry={resetErrorBoundary} />
        )
      }
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}
