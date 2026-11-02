import posthog from "posthog-js";
import { readAnalyticsContext, startAnalytics } from "@/lib/analytics";

// PostHog browser analytics, production only. All three variables are public
// and inlined at build time (read literally in readAnalyticsContext).
// NEXT_PUBLIC_VERCEL_ENV is set by Vercel itself ("production", "preview" or
// "development") and is absent in local builds, so local dev, ADW worktrees,
// e2e and preview deploys never initialise PostHog, even with a token in
// .env.local, and every posthog.capture call is a no-op. Automated browsers
// (navigator.webdriver) never initialise it either, and `?internal=1` /
// `?internal=0` tags or untags this browser as internal (see
// app_docs/analytics.md).
const { env, browser } = readAnalyticsContext();

startAnalytics(env, browser, {
  init: (token, host) => {
    posthog.init(token, {
      api_host: host,
      defaults: "2026-01-30",
      capture_exceptions: true,
      debug: process.env.NODE_ENV === "development",
    });
  },
  register: (properties) => {
    posthog.register(properties);
  },
  unregister: (property) => {
    posthog.unregister(property);
  },
});
