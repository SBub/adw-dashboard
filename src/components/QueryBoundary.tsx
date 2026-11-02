"use client";

import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import posthog from "posthog-js";
import { type ReactNode, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { readAnalyticsContext, reportBoundaryError } from "@/lib/analytics";
import { ErrorPanel } from "./ErrorPanel";

type QueryBoundaryProps = {
  children: ReactNode;
  /** Shown while a query under the boundary suspends. */
  fallback: ReactNode;
  /** One line under the default panel's heading, naming what did not load. */
  detail?: string;
  /** Replaces the default panel. Call `retry` to reset the boundary and refetch. */
  errorFallback?: (retry: () => void) => ReactNode;
};

/** Sends a caught error to PostHog (production only, never from an automated browser). */
function reportError(error: unknown) {
  const { env, browser } = readAnalyticsContext();
  reportBoundaryError(env, browser, posthog, error, "query");
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
 *
 * For a server-rendered section that is not a query (the page's History), use
 * SectionBoundary instead: there is no query error to reset there, and its
 * Retry has to re-request the server segment.
 */
export function QueryBoundary({ children, fallback, detail, errorFallback }: QueryBoundaryProps) {
  const { reset } = useQueryErrorResetBoundary();

  return (
    <ErrorBoundary
      onError={reportError}
      onReset={reset}
      fallbackRender={({ resetErrorBoundary }) =>
        errorFallback ? (
          errorFallback(resetErrorBoundary)
        ) : (
          <ErrorPanel detail={detail} retry={resetErrorBoundary} />
        )
      }
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}
