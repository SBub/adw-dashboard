import type { Instrumentation } from "next";

// Server-side errors to PostHog error tracking, Node.js runtime only. The
// reporter (src/lib/server-errors.ts) is production only, tags every exception
// with `environment` and `service`, and never makes the response wait on the
// send. It is imported lazily so posthog-node never reaches another runtime's
// bundle. See app_docs/analytics.md.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { reportRequestError } = await import("@/lib/server-errors");
    reportRequestError(error, request, context);
  } catch {
    // Reporting must never add a second failure to the request.
  }
};
