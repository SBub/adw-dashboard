# Analytics

**Specifications:**

- specs/issue-195-adw-dd62c7aa-sdlc_planner-login-logout-header-flag.md
- specs/issue-206-adw-2b58cbdf-sdlc_planner-separate-internal-automated-analytics.md
- specs/issue-214-adw-b4882b73-sdlc_planner-header-one-row-floating-hire.md

## Overview

PostHog runs in the browser on every page. It is initialised once in
`instrumentation-client.ts` (repository root), which Next loads before the app
hydrates. On the server, `instrumentation.ts` (repository root) sends request
errors to PostHog error tracking; that is the only server-side send, there are
no server-side events. System health (Realtime connections, server and
boundary errors, release markers) goes to the same PostHog project as the
product events: project 302689, EU region. Data only, no alerts.

## How it works

### Initialisation

`posthog.init` runs only on the production deploy: when
`NEXT_PUBLIC_VERCEL_ENV` is `production` and both
`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` are set.
`NEXT_PUBLIC_VERCEL_ENV` is a Vercel system variable, absent in local builds,
so local dev, ADW worktrees, e2e and preview deploys never send events, even
with a token in `.env.local`. It also requires a browser whose
`navigator.webdriver` is not `true`, so Playwright and other automated
browsers never start PostHog. The whole condition lives in `analyticsEnabled` in
`src/lib/analytics.ts` (its environment half is `serverAnalyticsEnabled`), and
`readAnalyticsContext` in the same file reads the three variables literally
and the browser facts; `startAnalytics` applies it at start-up, which takes the environment, the browser
(`navigator.webdriver` and `window.location.search`, or nothing when either is
missing) and a small client adapter over `posthog`, so it is testable in node.
All three are inlined at build time, so a change
needs a new deploy. Elsewhere every `posthog.capture` is a no-op.

`defaults: "2026-01-30"` turns on PostHog's default capture: pageviews and
page leaves on client-side navigation, and autocapture of clicks.
`capture_exceptions: true` sends unhandled browser errors.

### Events

| event                     | sent from                            | properties                                |
| ------------------------- | ------------------------------------ | ----------------------------------------- |
| `hire_request_submitted`  | `src/components/HireRequestForm.tsx` | `offer` (the `OFFERS` value), `from_door` |
| `radio_played`            | `src/components/RadioBar.tsx`        | none                                      |
| `radio_stopped`           | `src/components/RadioBar.tsx`        | none                                      |
| `run_history_searched`    | `src/components/HistorySearch.tsx`   | `query_length`                            |
| `today_summary_refreshed` | `src/components/TodaySummary.tsx`    | `trigger` (`button` or `retry`)           |
| `realtime_connected`      | `src/app/providers.tsx`              | `reconnect` (boolean)                     |
| `realtime_disconnected`   | `src/app/providers.tsx`              | `state`                                   |

`hire_request_submitted` fires on submit, before the server action validates
the form, so it counts attempts, not delivered emails. `from_door` is true when
the offer came from `?offer=` rather than the select.

`radio_played` and `radio_stopped` fire on the visitor's click, not when the
stream actually starts or fails.

`realtime_connected` fires on every `SUBSCRIBED` of the `adw` channel;
`reconnect` is false for the first one in this page (this document) and true
for every later one, including the reconnect after leaving the dashboard
routes and coming back, so a chart of `realtime_connected` per session shows
the sockets opened per visit. `realtime_disconnected` fires on
`CHANNEL_ERROR`, `TIMED_OUT` and `CLOSED`, with that string as `state`
(`CLOSED` also fires when the channel is removed on leaving the dashboard
routes). Both come from `createRealtimeTracker` in `src/lib/analytics.ts`,
built once at module scope in `src/app/providers.tsx` and passed to
`startRealtime` as its `onStatus` option; the tracker checks
`analyticsEnabled` itself, so it sends nothing off production or from an
automated browser, and it never throws out of the socket callback. It only
observes: reconnect, backoff and the catch-up read do not depend on it.

`src/app/global-error.tsx` sends an error that takes down the root layout with
`posthog.captureException`. The project segment's `error.tsx`
(`src/app/(dashboard)/projects/[owner]/[repo]/error.tsx`), `SectionBoundary`
and `QueryBoundary` send the error they catch through `reportBoundaryError` in
`src/lib/analytics.ts`, with `boundary` (`project`, `section` or `query`) and,
when the error came from a failed server render, its `digest`, which matches
the server-side exception below. Same `analyticsEnabled` gate.

### Server errors

`instrumentation.ts` exports Next's `onRequestError`. On the Node.js runtime
it imports `reportRequestError` from `src/lib/server-errors.ts` (lazily, so
`posthog-node` never reaches another runtime's bundle) and hands it the error.
The reporter does nothing unless `serverAnalyticsEnabled` holds: the same
production condition as the browser (`NEXT_PUBLIC_VERCEL_ENV` is
`production`, both PostHog variables set), using the same public project
token, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`. No new variable. It always sends
to the EU ingestion host `https://eu.i.posthog.com` (`POSTHOG_SERVER_HOST`),
not `NEXT_PUBLIC_POSTHOG_HOST`, which may be a browser-side proxy.

Each exception is sent with `captureExceptionImmediate`, tagged with
`environment` (the Vercel environment, so `production`) and `service`
(`adw-dashboard`), plus `path` (without its query string), `method`,
`route_path`, `route_type` and `render_source`. The distinct id is read from
the visitor's `ph_<token>_posthog` cookie when there is one
(`distinctIdFromCookie`), so the error joins the visitor's person and session;
without it the event is personless. The send is handed to Vercel's
`waitUntil` (`@vercel/functions`) and not awaited, so the response never
waits on PostHog and the instance stays alive until the send settles. The
client is built once per server instance with `flushAt: 1` and
`flushInterval: 0`, as PostHog's Next.js guide sets them.

### Release markers

The `Create PostHog annotation` step of `.github/workflows/release.yml` creates a
PostHog annotation in project 302689 only when that run created the release
tag (`tag_created`), so once per release. Its text is
`adw-dashboard release-<YYYY-MM-DD>-pr<N>` and its `date_marker` is the
production pull request's merge time (`merged_at`), sent through
`POST https://eu.posthog.com/api/projects/302689/annotations/`. It
authenticates with a personal API key from the repository secret
`POSTHOG_PERSONAL_API_KEY` (scope: annotation write). When the secret is not
set, the step prints a notice and skips; a failed request is a warning. The
step is `continue-on-error`, so a marker never fails the release, and the key
is only ever sent as a header, never printed. It uses no third-party action.
It replaces the earlier workflow that annotated every push to `master`; see
`app_docs/changelog.md`, Release workflow.

### Feature flags

The `login` flag is a boolean flag created and targeted by hand in PostHog (by
the owner's email). It gates the header's Login / Logout button,
`src/components/IdentifyButton.tsx`, whose store is `createIdentityStore` in
`src/lib/analytics.ts`: a `useSyncExternalStore` store, with `posthog` passed
in as an `IdentityClient`. From `sm` up the button sits in the header just
before Work with me; below `sm` it floats in the bottom-right corner, stacked
above the floating Work with me button.

Login calls `identify(OWNER_EMAIL, { email: OWNER_EMAIL })`; Logout calls
`reset()`. The label comes from `get_distinct_id()` (Logout when it equals
`OWNER_EMAIL`, Login otherwise), so it survives a reload. The store re-reads
on `onFeatureFlags`.

The button renders `null` on the server, on the first (hydration) render, and
wherever PostHog is not initialised (local dev, worktrees, e2e, preview
deploys), where the flag reads `undefined`.

It is not authentication: Login only tells PostHog who the visitor is so flags
can target the owner; it unlocks nothing in the app.

### Internal devices

Tag a browser once by opening `https://build.issebya.com/?internal=1`
directly. Any page works, but it must be a full page load: instrumentation runs
once per document, so a client-side navigation does not count. Right after
`init`, `startAnalytics` calls `register({ internal: true })`, a persistent
super property sent with every later event from that browser.

`?internal=0` calls `unregister("internal")`. Any other value, or no
parameter, does nothing (`internalTagAction` in `src/lib/analytics.ts`).

Logout calls `posthog.reset()`, which clears super properties, so after Logout
open `?internal=1` again.

The PostHog side is set by hand: Settings, Project, Product analytics,
"Filter out internal and test users", with the event property `internal` is
not set.
Enable the filter on new insights by default.

Tagging never opts the browser out: events are still captured, `identify` and
the `login` flag keep working, and the filter hides them from insights.

## Rules

- Never send what a visitor typed: no email, name, message or search text. Send
  lengths, counts and enum values only.
- `posthog-js` is imported only in client components, `instrumentation-client.ts`
  and `src/app/global-error.tsx`.
- `posthog-node` is imported only in `src/lib/server-errors.ts`, and that
  module is loaded only from `instrumentation.ts` on the Node.js runtime.
- The server error reporter never throws and never makes the response wait:
  the send goes to `waitUntil`, never `await`ed in `onRequestError`. It never
  sends a query string, a header or a cookie value; the distinct id is the
  only thing read from the cookie.
- Every server exception carries `environment` and `service: "adw-dashboard"`.
- Never send the Realtime connection events, a boundary error or a server
  error outside the production gate (`analyticsEnabled` in the browser,
  `serverAnalyticsEnabled` on the server), or from an automated browser.
- The Realtime tracker only observes: never make reconnect, backoff or the
  catch-up read depend on it.
- The release annotation step never fails the workflow and never prints
  `POSTHOG_PERSONAL_API_KEY`.
- `instrumentation-client.ts` never throws: a missing variable, no
  `?internal=` parameter, a malformed query and a missing `navigator` or
  `window` all leave it silent.
- Never initialise PostHog outside the production deploy: keep the
  `NEXT_PUBLIC_VERCEL_ENV === "production"` check.
- Never initialise PostHog when `navigator.webdriver` is `true`.
- `login` (the flag key) and `sveta@issebya.com` (the owner's email) are
  literal strings PostHog matches on. Never rename or derive them; they live
  only in `src/lib/analytics.ts`.
- `internal` (the super property name) with boolean `true` is a literal
  PostHog filters match on. Never rename or derive it; it lives only in
  `src/lib/analytics.ts`.
- Never call `opt_out_capturing` (or otherwise stop capturing) for the owner or
  a tagged device: it stops `identify` and breaks flag targeting. Tag only.
- The only property sent with `identify` is `email`.
- The Login / Logout button returns `null` until the `login` flag is `true`.
- `src/lib/analytics.ts` never imports `posthog-js`, not even as a type: the
  client is passed in.
