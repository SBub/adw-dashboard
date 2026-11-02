// Server-side errors to PostHog error tracking. instrumentation.ts (repository
// root) hands Next's onRequestError to reportRequestError, on the Node.js
// runtime only. This is the one module that imports posthog-node; the browser
// side stays in src/lib/analytics.ts and never imports either SDK.
import { waitUntil } from "@vercel/functions";
import type { Instrumentation } from "next";
import { PostHog } from "posthog-node";
import { type AnalyticsEnv, serverAnalyticsEnabled } from "./analytics";

/** Every server exception carries this as `service`. */
export const SERVICE = "adw-dashboard";

/** PostHog's EU ingestion host; the project (302689) lives in the EU region. */
export const POSTHOG_SERVER_HOST = "https://eu.i.posthog.com";

/** The one posthog-node call the handler uses; a PostHog instance satisfies it. */
export interface ServerErrorClient {
  captureExceptionImmediate(
    error: unknown,
    distinctId?: string,
    properties?: Record<string, string | undefined>,
  ): Promise<void>;
}

export interface ServerErrorDeps {
  /** Builds the client once, on the first reported error. */
  makeClient: (projectToken: string, host: string) => ServerErrorClient;
  /** Keeps the serverless invocation alive until the send settles, after the response. */
  waitUntil: (promise: Promise<unknown>) => void;
}

type RequestErrorArgs = Parameters<Instrumentation.onRequestError>;

/**
 * The distinct id the browser's posthog-js keeps in its `ph_<token>_posthog`
 * cookie, so a server error is linked to the visitor's person and session when
 * there is one. Undefined when the cookie is missing or unreadable (posthog-node
 * then sends a personless event).
 */
export function distinctIdFromCookie(
  cookie: string | string[] | undefined,
  projectToken: string,
): string | undefined {
  const header = Array.isArray(cookie) ? cookie.join("; ") : cookie;
  if (!header) return undefined;
  const name = `ph_${projectToken}_posthog=`;
  const part = header
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(name));
  if (!part) return undefined;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(part.slice(name.length)));
    if (typeof parsed === "object" && parsed !== null && "distinct_id" in parsed) {
      const id = parsed.distinct_id;
      return typeof id === "string" && id !== "" ? id : undefined;
    }
  } catch {
    // A malformed cookie is no distinct id, not an error.
  }
  return undefined;
}

/**
 * Builds the onRequestError reporter. Outside the production deploy (the same
 * environment gate as the browser SDK, serverAnalyticsEnabled) it does
 * nothing. Otherwise it sends the exception with `environment`, `service`
 * and where it happened (the path without its query string, which can carry
 * search text, the method, the route and how it rendered) through
 * captureExceptionImmediate, hands that send to waitUntil and returns without
 * awaiting it, so the response never waits on PostHog and a serverless
 * instance is not frozen mid-send. (captureException would only queue the
 * event after an async stack-trace step, which a flush right after it can
 * miss.) It never throws, and a failed send is swallowed.
 */
export function createRequestErrorReporter(env: AnalyticsEnv, deps: ServerErrorDeps) {
  let client: ServerErrorClient | undefined;

  return (...[error, request, context]: RequestErrorArgs): void => {
    try {
      if (!serverAnalyticsEnabled(env) || !env.projectToken) return;
      client ??= deps.makeClient(env.projectToken, POSTHOG_SERVER_HOST);
      const sent = client.captureExceptionImmediate(
        error,
        distinctIdFromCookie(request.headers.cookie, env.projectToken),
        {
          environment: env.vercelEnv,
          service: SERVICE,
          path: request.path.split("?")[0],
          method: request.method,
          route_path: context.routePath,
          route_type: context.routeType,
          render_source: context.renderSource,
        },
      );
      deps.waitUntil(sent.catch(() => {}));
    } catch {
      // Error reporting must never add a second failure to the request.
    }
  };
}

/** The reporter instrumentation.ts calls, over the real posthog-node client. */
export const reportRequestError = createRequestErrorReporter(
  {
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
    projectToken: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
  {
    // flushAt 1 and flushInterval 0, as PostHog's Next.js guide sets them:
    // nothing waits in a batch a frozen serverless instance would lose.
    // Built once per server instance, on the first reported error.
    makeClient: (projectToken, host) =>
      new PostHog(projectToken, { host, flushAt: 1, flushInterval: 0 }),
    waitUntil,
  },
);
