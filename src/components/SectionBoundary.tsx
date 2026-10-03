"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorPanel } from "./ErrorPanel";

type SectionBoundaryProps = {
  /** A server-rendered section, typically an async server component. */
  children: ReactNode;
  /** Shown while the section is still streaming in. */
  fallback: ReactNode;
  /** One line under the panel's heading, naming what did not load. */
  detail?: string;
};

/**
 * The boundary for a server-rendered section that can fail on its own: a
 * Suspense boundary for the streaming state inside a react-error-boundary
 * ErrorBoundary for the failed one. Without it, a throw inside the section
 * (a database read failing while the server renders it) escapes to the
 * segment's error.tsx and replaces the whole detail pane, including siblings
 * that had already rendered fine.
 *
 * This is a client component so it can hold the error state, and a server
 * component is a perfectly good child of it: the server renders the child,
 * and if that render throws, React carries the error across in the RSC
 * payload and this boundary catches it in the browser.
 *
 * Retry here is not QueryBoundary's retry. The sections this wraps are not
 * in the React Query cache, so useQueryErrorResetBoundary has nothing to
 * reset and is deliberately not used. Resetting the error boundary alone
 * would also not help: the child is a server component whose render already
 * happened on the server, so a local reset only re-mounts the same failed
 * output. The retry therefore calls router.refresh() first, which asks the
 * server for a fresh render of the route (the section's cache scope is read
 * again and, on a miss, the database with it), and only then resets the
 * boundary, so the re-mounted child is the fresh server result streaming in
 * behind the Suspense fallback rather than a replay of the old error.
 */
export function SectionBoundary({ children, fallback, detail }: SectionBoundaryProps) {
  const router = useRouter();

  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <ErrorPanel
          detail={detail}
          retry={() => {
            router.refresh();
            resetErrorBoundary();
          }}
        />
      )}
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}
