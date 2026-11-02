// The identity store behind the header's Login / Logout button. It never
// imports posthog-js: the client is passed in, so this file stays plain and
// testable in node, and the posthog-js import rule in app_docs/analytics.md
// holds. This is not authentication: Login only tells PostHog who the visitor
// is, so feature flags can target the owner by email.

// Both are literal strings PostHog conditions match on (the flag key and the
// identified distinct id). Never rename or derive them.
const OWNER_EMAIL = "sveta@issebya.com";
const LOGIN_FLAG = "login";

// The super property a tagged browser sends with every event; the PostHog
// test-account filter matches on this literal. Never rename or derive it.
const INTERNAL_PROPERTY = "internal";

/** The five PostHog methods the store uses; the real posthog instance satisfies it. */
export interface IdentityClient {
  isFeatureEnabled(key: string): boolean | undefined;
  onFeatureFlags(callback: () => void): () => void;
  get_distinct_id(): string | undefined;
  identify(distinctId: string, properties: { email: string }): void;
  reset(): void;
}

/** What the button offers: Login, Logout, or nothing (flag off, unknown, or on the server). */
export type IdentityAction = "login" | "logout" | null;

/**
 * A useSyncExternalStore store over `client`. The flag is the only gate and is
 * read first, so nothing else is read while it is off or PostHog is not
 * initialised. The label comes from the distinct id, so it survives a reload.
 * Login and Logout notify local listeners at once; PostHog's own flag reload
 * after identify or reset fires onFeatureFlags again later.
 */
export function createIdentityStore(client: IdentityClient) {
  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((l) => l());
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      const unsubscribe = client.onFeatureFlags(() => listener());
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
    getSnapshot(): IdentityAction {
      if (client.isFeatureEnabled(LOGIN_FLAG) !== true) return null;
      return client.get_distinct_id() === OWNER_EMAIL ? "logout" : "login";
    },
    getServerSnapshot(): IdentityAction {
      return null;
    },
    login() {
      client.identify(OWNER_EMAIL, { email: OWNER_EMAIL });
      notify();
    },
    logout() {
      client.reset();
      notify();
    },
  };
}

/** What the `internal` query parameter asks for: tag, untag, or nothing. */
export type InternalTagAction = "tag" | "untag" | null;

/** `?internal=1` tags, `?internal=0` untags, anything else (or nothing) is null. */
export function internalTagAction(search: string): InternalTagAction {
  const value = new URLSearchParams(search).get(INTERNAL_PROPERTY);
  if (value === "1") return "tag";
  if (value === "0") return "untag";
  return null;
}

/** The three public variables instrumentation-client.ts reads literally. */
export interface AnalyticsEnv {
  vercelEnv: string | undefined;
  projectToken: string | undefined;
  host: string | undefined;
}

/** What the browser tells us; undefined when there is no navigator or window. */
export interface AnalyticsBrowser {
  webdriver: boolean | undefined;
  search: string;
}

/** The three PostHog calls start-up needs; an adapter over posthog satisfies it. */
export interface AnalyticsClient {
  init(projectToken: string, host: string): void;
  register(properties: { [INTERNAL_PROPERTY]: true }): void;
  unregister(property: string): void;
}

/**
 * The one gate every PostHog send in this app goes through: the production
 * deploy, both public variables set, and a real browser (`navigator.webdriver`
 * not true). The server error handler (src/lib/server-errors.ts) passes no
 * browser check of its own, see serverAnalyticsEnabled.
 */
function analyticsEnabled(env: AnalyticsEnv, browser: AnalyticsBrowser | undefined): boolean {
  return serverAnalyticsEnabled(env) && browser !== undefined && browser.webdriver !== true;
}

/** The environment half of analyticsEnabled: production, with both variables set. */
export function serverAnalyticsEnabled(env: AnalyticsEnv): boolean {
  return env.vercelEnv === "production" && Boolean(env.projectToken) && Boolean(env.host);
}

/**
 * The three public variables, read literally so Next inlines them at build
 * time, and what the browser says about itself (undefined on the server).
 * instrumentation-client.ts and the client components that send events read
 * them through here, so the gate cannot drift between call sites.
 */
export function readAnalyticsContext(): {
  env: AnalyticsEnv;
  browser: AnalyticsBrowser | undefined;
} {
  return {
    env: {
      vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
      projectToken: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    },
    browser:
      typeof navigator !== "undefined" && typeof window !== "undefined"
        ? { webdriver: navigator.webdriver, search: window.location.search }
        : undefined,
  };
}

/**
 * Initialises PostHog on production, with both variables set, in a browser
 * that is not automated (`navigator.webdriver` is not true), then applies the
 * `?internal=` tag. The client is passed in, as with createIdentityStore, so
 * the whole condition is testable in node. Tagging only adds a super property
 * the PostHog filter hides; it never opts out, so identify and flag targeting
 * keep working. Returns whether PostHog was initialised.
 */
export function startAnalytics(
  env: AnalyticsEnv,
  browser: AnalyticsBrowser | undefined,
  client: AnalyticsClient,
): boolean {
  // The last three repeat the gate only so TypeScript narrows them.
  if (!analyticsEnabled(env, browser) || !env.projectToken || !env.host || !browser) return false;
  client.init(env.projectToken, env.host);
  const action = internalTagAction(browser.search);
  if (action === "tag") client.register({ [INTERNAL_PROPERTY]: true });
  if (action === "untag") client.unregister(INTERNAL_PROPERTY);
  return true;
}

/** The one PostHog call the realtime tracker needs; posthog satisfies it. */
export interface CaptureClient {
  capture(event: string, properties: Record<string, string | boolean>): void;
}

/** The channel states the tracker reports; REALTIME_SUBSCRIBE_STATES values. */
export type RealtimeState = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/**
 * The Realtime connection events, for a chart of sockets opened per visit.
 * Returns the status callback startRealtime calls on every channel state:
 * `realtime_connected` on each SUBSCRIBED, with `reconnect` false for the
 * first one in this page (this document, across Providers remounts, as long
 * as the same tracker is used) and true after it, and `realtime_disconnected`
 * with the `state` on CHANNEL_ERROR, TIMED_OUT and CLOSED. Outside the
 * analyticsEnabled gate (not production, a variable missing, an automated
 * browser, the server) it returns a callback that sends nothing. It never
 * throws: it runs inside the socket's status callback.
 */
export function createRealtimeTracker(
  env: AnalyticsEnv,
  browser: AnalyticsBrowser | undefined,
  client: CaptureClient,
): (state: RealtimeState) => void {
  if (!analyticsEnabled(env, browser)) return () => {};
  let connects = 0;
  return (state) => {
    try {
      if (state === "SUBSCRIBED") {
        client.capture("realtime_connected", { reconnect: connects > 0 });
        connects += 1;
      } else {
        client.capture("realtime_disconnected", { state });
      }
    } catch {
      // Analytics must never break the socket callback.
    }
  };
}

/** The one PostHog call an error boundary needs; posthog satisfies it. */
export interface ExceptionClient {
  captureException(error: unknown, properties: Record<string, string>): void;
}

/**
 * Sends an error a segment or section boundary caught, tagged with which
 * boundary (`boundary`) and, for a server render that failed, the `digest`
 * that matches the server-side exception (src/lib/server-errors.ts). The same
 * gate as every other send. Never throws: it runs while React renders the
 * fallback.
 */
export function reportBoundaryError(
  env: AnalyticsEnv,
  browser: AnalyticsBrowser | undefined,
  client: ExceptionClient,
  error: unknown,
  boundary: "project" | "section" | "query",
): void {
  if (!analyticsEnabled(env, browser)) return;
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  try {
    client.captureException(error, digest ? { boundary, digest } : { boundary });
  } catch {
    // Reporting must never break the error fallback.
  }
}
