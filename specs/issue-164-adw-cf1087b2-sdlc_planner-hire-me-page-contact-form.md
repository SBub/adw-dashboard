# Feature: Hire me header button and /hire page with a contact form

## Metadata

issue_number: `164`
adw_id: `cf1087b2`
issue_json: `{"number":164,"title":"Hire me: header button and /hire page with a contact form to hire@issebya.com", ...}` (body as filed in issue #164)

## Feature Description

A solid, fuchsia **Hire me** button in the root header, on every route, opens a new `/hire` page.
That page has a short intro (a generalized cover letter), a LinkedIn link and a contact form. The
form posts to a server action. The action checks a Cloudflare Turnstile token with Siteverify,
validates the input on the server and then sends one plain-text email through Resend to
`hire@issebya.com`, with the visitor's email as reply-to. The page then shows a confirmation
(`?sent=1`) in place of the form, or an error message above the form (`?error=<code>`).

`/hire` sits outside the `(dashboard)` group, like `/`: no sidebar, no `Providers`, no Realtime
and no connection pill. The intro and heading are part of the static shell. The status and form
part reads `searchParams` and renders under a `SectionBoundary`.

## User Story

As a recruiter or prospective client visiting the dashboard
I want a visible "Hire me" entry point and a short form to send a request
So that I can contact the owner about product engineering or AI consulting work without leaving the site

## Problem Statement

The dashboard is the owner's public showcase of autonomous development work, but a visitor has no
way to act on it. There is no contact path, no statement of what the owner offers and no link to
the owner's profile. A naive contact form on a public site would also be a spam and
header-injection target, and it could relay email to arbitrary recipients.

## Solution Statement

- Add one accent class string, `HIRE_ACCENT`, in a new `src/lib/accent.ts`, using the `/bug` class
  hue (fuchsia). It is used by the header button and the form's Send button, so the two always
  match.
- Add a third header section, `"hire"`, to `headerSection`. The new `HireLink` reuses
  `HeaderLink`, so `/hire` gets `aria-current="page"` the same way the brand and Projects do.
- Add the static copy module `src/content/hire.ts` (`HIRE_INTRO`, `LINKEDIN_URL`, `OFFERS`). Its
  text is clearly marked placeholder text.
- Add a pure, unit-tested request module `src/lib/hire-request.ts`. It contains
  `parseHireRequest(formData)`, the subject and body builders, the error-code type and the status
  reader for `searchParams`.
- Add the server action `src/app/actions/send-hire-request.ts`. It checks configuration, then the
  Turnstile token (Siteverify), then validates the input, then sends one email (Resend). It
  redirects exactly once, outside any `try`, to `?sent=1` or `?error=<code>`. The recipient is a
  constant.
- Add the page `src/app/hire/page.tsx`, a server component. The heading, intro and LinkedIn link
  form the static shell. A `HireStatus` island under a `SectionBoundary` awaits `searchParams` and
  renders the confirmation, or the optional error plus the `<form action={sendHireRequest}>`.
- Add two client leaves: `SubmitButton` (`useFormStatus`) and `TurnstileScript` (see Notes for why
  it is a separate leaf and not a React wrapper).

## Relevant Files

Use these files to implement the feature:

- `README.md`: overview. Its Documentation list gets the new doc's link.
- `AGENTS.md`: repository rules. Per its own Documentation rule, feature rules live in
  `app_docs/`, not here (see Notes). It is left unchanged.
- `.adw/project.md`: the ADW profile. Install (the env files now may carry four more variables),
  Tests (the new journey), Protected (never submit the form against real keys) and Review (the
  `/hire` path). Keep the nine `##` headings and their order.
- `docs/conditional-docs.md`: add the `app_docs/hire.md` line. Extend the routing line's
  situations if needed.
- `app_docs/routing-and-navigation.md`: route tree (`/hire` outside `(dashboard)`), the header's
  third link and its current-section marking, the `headerSection` rule.
- `app_docs/screens-and-components.md`: the `"use client"` list gains `SubmitButton` and
  `TurnstileScript`. Add the `HIRE_ACCENT` colour rule.
- `app_docs/data-boundary.md`: the env rule at about line 393 currently says
  `ADW_REVALIDATE_SECRET` is "the one server-only variable". It must list the three new ones, each
  read only in `send-hire-request.ts`, plus the public `NEXT_PUBLIC_TURNSTILE_SITE_KEY` read only
  by the page.
- `app_docs/error-and-loading-boundaries.md`: the bare-`Suspense` exception names `HeaderLink` in
  `SectionNav.tsx`. `HireLink` uses the same exception. Also add `HireStatus` to the list of
  `SectionBoundary` islands.
- `app_docs/clock-and-prerender.md`: read for the "no clock read" rule. This feature adds none.
- `src/app/layout.tsx`: the root header. `HireLink` goes in the `ml-auto` group.
- `src/components/SectionNav.tsx`: home of `BrandLink` and `SectionNav`. `HireLink` goes here,
  same Suspense-with-inactive-fallback pattern.
- `src/components/HeaderLink.tsx`: the one `usePathname` reader. It is reused unchanged.
- `src/lib/header-section.ts` and `src/lib/header-section.test.ts`: add the `"hire"` section and
  its test cases.
- `src/lib/chart-colors.ts`: `CLASS_BG["/bug"]` is `bg-fuchsia-500`. The accent's comment points
  here. This file is not changed.
- `src/lib/status-colors.test.ts`: the status-hue guard scans `src/`. Fuchsia is not a status
  hue, so it is unaffected. Do not use `rose`, `red`, `emerald`, `amber` or `sky` for the error
  message. Use neutral or fuchsia text.
- `src/components/SectionBoundary.tsx`: the boundary for the request-time island.
- `src/app/page.tsx`: pattern for a page outside `(dashboard)` with a static shell and a
  `SectionBoundary` hole.
- `src/app/actions/revalidate-history.ts`: pattern and comment style for a `"use server"` action
  as a public endpoint.
- `src/app/api/revalidate/route.ts`: pattern for the "log once when unconfigured" flag
  (`warnedUnconfigured`).
- `.env.example`: add the four variables.
- `package.json`: gains `resend` (via `yarn add resend`).
- `knip.json`, `vitest.config.ts`, `eslint.config.mjs`: unchanged. Tests must match
  `src/**/*.test.ts`. `no-secrets` must not flag the test keys.
- `e2e/test_header_section_active.md`: model for the new journey.
- `node_modules/next/dist/docs/01-app/02-guides/forms.md`, `server-actions.md`,
  `environment-variables.md`, and the `redirect`, `headers`, `useFormStatus` and `next/script` API
  references under `node_modules/next/dist/docs/01-app/03-api-reference/`: read before writing the
  page and action.

### New Files

- `src/lib/accent.ts`: `HIRE_ACCENT`, the one accent class string.
- `src/content/hire.ts`: `HIRE_INTRO: string[]`, `LINKEDIN_URL: string`, `OFFERS` (placeholder
  copy, clearly marked).
- `src/lib/hire-request.ts`: `parseHireRequest`, `hireSubject`, `hireBody`, `HireErrorCode`,
  `hireStatus`, limits as named constants.
- `src/lib/hire-request.test.ts`: unit tests for the above.
- `src/app/actions/send-hire-request.ts`: the `"use server"` action `sendHireRequest`.
- `src/app/actions/send-hire-request.test.ts`: action tests with mocked Siteverify (`fetch`),
  Resend, `next/headers` and `next/navigation`.
- `src/app/hire/page.tsx`: the page, `metadata`, the `HireStatus` island and the form.
- `src/components/SubmitButton.tsx`: `"use client"`, `useFormStatus`.
- `src/components/TurnstileScript.tsx`: `"use client"`, the Cloudflare script via `next/script`.
- `app_docs/hire.md`: the feature doc.
- `e2e/test_hire_page.md`: the agent-driven journey (see Testing Strategy for why).

## Implementation Plan

### Phase 1: Foundation

- Add the `resend` dependency.
- Add the env placeholders.
- Add the accent constant.
- Add the copy module.
- Add the pure request module with its tests.
- Extend `headerSection` with `"hire"` and its tests.

### Phase 2: Core Implementation

- Add the server action and its tests.
- Add the two client leaves.
- Add the `/hire` page.

### Phase 3: Integration

- Add `HireLink` to the header on every route.
- Add the docs (`app_docs/hire.md`, the index line and the touched feature docs), the profile and
  README link updates.
- Add the e2e journey.
- Run the full validation.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the Next guides

- Read `forms.md`, `server-actions.md` and `environment-variables.md` under
  `node_modules/next/dist/docs/01-app/02-guides/`.
- Read the API references for `redirect`, `headers`, `Script` and the page `searchParams` prop.
- Confirm the following before writing any code:
  - `redirect()` throws and must be called outside `try/catch`.
  - `headers()` is async.
  - `searchParams` is a `Promise`, and awaiting it under `cacheComponents` makes that subtree
    request-time, so it must sit under a boundary.

### 2. Add the dependency

- Run `yarn add resend`.
- Confirm that `yarn.lock` and `package.json` change and nothing else.
- Check the installed API in `node_modules/resend`:
  - `new Resend(key).emails.send({ from, to, replyTo, subject, text })` returns
    `{ data, error }`.
  - Note whether it can also throw on a network failure. Handle both.

### 3. Update `.env.example`

- Add a commented block after `ADW_REVALIDATE_SECRET`. The comment says:
  - The three server-only variables are read only in `src/app/actions/send-hire-request.ts`.
  - The public site key is read only by `src/app/hire/page.tsx`.
  - The placeholders are Cloudflare's documented always-pass Turnstile test keys.
  - The real values go in `.env.local` and the host's environment, never in this file.
- The block contains:
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`
  - `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`
  - `RESEND_API_KEY=re_replace_me`
  - `RESEND_FROM_EMAIL="Hire form <hire-form@example.com>"`
- No em-dashes.

### 4. Add `src/lib/accent.ts`

- Comment the file. The comment says this is the one accent colour, the `/bug` class hue
  (fuchsia, `CLASS_BG` in `src/lib/chart-colors.ts`), used by the header's Hire me button and the
  hire form's Send button. It also says this is a class hue, not a status hue, and that the class
  strings are full literals so Tailwind sees them.
- `export const HIRE_ACCENT = "bg-fuchsia-700 text-white hover:bg-fuchsia-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700 dark:bg-fuchsia-600 dark:hover:bg-fuchsia-700 dark:focus-visible:outline-fuchsia-400";`
- Contrast: the white label must meet WCAG AA (4.5:1 for normal-size text).
  - fuchsia-700 passes comfortably.
  - Measure fuchsia-600 from the compiled CSS. If it is under 4.5:1, use 700 (hover 800) in dark
    mode too.
  - The 500 hue of `CLASS_BG` fails AA with white, so do not use it for the button.

### 5. Add `src/content/hire.ts`

- Comment the file. The comment says this is the one place the `/hire` copy lives, that the owner
  edits it and that no copy belongs elsewhere.
- `export const OFFERS = ["Product engineer", "AI consulting"] as const;`
- `export type Offer = (typeof OFFERS)[number];`
- `export const HIRE_INTRO: string[]`: two or three paragraphs, each starting with
  `"[Placeholder]"`, so it is clearly unfinished copy.
- `export const LINKEDIN_URL = "https://www.linkedin.com/in/REPLACE_ME";`, marked as a placeholder
  in a comment.

### 6. Add `src/lib/hire-request.ts` (pure, no env, no clock, no I/O)

- Constants:
  - `HIRE_RECIPIENT = "hire@issebya.com"`. Exported, used by the action. This is the only place
    the address is spelled.
  - `MOTIVATION_MIN = 20`
  - `MOTIVATION_MAX = 4000`
  - `NAME_MAX = 100`
  - `EMAIL_MAX = 254`
- `export type HireErrorCode = "verification" | "invalid" | "send";`
- `export type HireRequest = { offer: Offer; email: string; name: string; motivation: string };`
- `parseHireRequest(formData: FormData): HireRequest | null`:
  - **Field types:** read each field with `formData.get`. A non-string value (a `File`) or a
    missing field is invalid.
  - **offer:** must be exactly one of `OFFERS`.
  - **email:**
    1. Trim it.
    2. Reject it if it contains any control character, including CR and LF.
    3. Reject it if it is longer than `EMAIL_MAX`.
    4. Reject it unless it matches a simple `local@domain.tld` pattern with no whitespace (for
       example `^[^\s@]+@[^\s@]+\.[^\s@]+$`).
  - **name:** optional.
    1. Replace every run of CR/LF and other control characters with one space.
    2. Collapse whitespace.
    3. Trim.
    4. Cap at `NAME_MAX` characters (slice).
    5. An empty result is `""`.
  - **motivation:**
    1. Normalise `\r\n` to `\n`.
    2. Trim.
    3. The length must be within `[MOTIVATION_MIN, MOTIVATION_MAX]`.
    4. Newlines are allowed (it goes only in the body).
- `hireSubject(r: HireRequest): string`:
  - Returns `` `Hire: ${r.offer} - ${r.name || r.email}` ``.
  - As defence in depth, strip CR/LF from the result.
- `hireBody(r: HireRequest): string`: plain text with `Offer:`, `Name:` (or `(not given)`),
  `Email:`, then a blank line and the motivation.
- `hireStatus(params: { sent?: string | string[]; error?: string | string[] }): { kind: "sent" } | { kind: "error"; code: HireErrorCode } | null`:
  - `sent === "1"` gives `sent`.
  - A known error code gives `error`.
  - Anything else (an unknown code, an array) gives `null`, so a hand-edited URL shows the plain
    form.
- `HIRE_ERROR_MESSAGES: Record<HireErrorCode, string>`:
  - `verification`: "We could not verify you are human. Please try again."
  - `invalid`: "Some fields were not valid. Check them and send again."
  - `send`: "The message could not be sent. Please try again later."
  - Messages never contain input.

### 7. Add `src/lib/hire-request.test.ts`

- **A valid form** parses to the expected `HireRequest`. Name and motivation are trimmed.
- **Each invalid field** returns `null`:
  - The offer is missing, unknown or differently cased.
  - The email is missing or has no `@`, a space or no TLD.
  - The email is over 254 characters.
  - The motivation is missing, is 19 characters after trimming, or is 4001 characters.
  - A field is a `File`.
- **Bounds:** a motivation of exactly 20 and exactly 4000 characters is valid. A name of 150
  characters is capped to 100.
- **Header injection:**
  - The name `"Eve\r\nBcc: x@y.z"` becomes a single-line name with no CR/LF.
  - The email `"a@b.c\r\nBcc: x@y.z"` and `"a@b.c\nX: y"` are rejected.
  - `hireSubject` of the parsed result contains no `\r` or `\n`.
- **`hireSubject`:** uses the name when it is given and the email when it is not.
- **`hireBody`:** contains the offer, name, email and motivation.
- **`hireStatus`:**
  - `{ sent: "1" }` gives `sent`.
  - Each of the three codes gives `error`.
  - `{ error: "boom" }`, `{ sent: "yes" }`, an array and `{}` give `null`.

### 8. Extend `src/lib/header-section.ts` and its test

- `HeaderSection` becomes `"summary" | "projects" | "hire"`.
- `"/hire"` and `"/hire/"` map to `"hire"`. `"/hirex"` and `"/hire-me"` map to `null`.
- Update the file comment ("two links" becomes three).
- Test cases:
  - `/hire` and `/hire/` are `"hire"`.
  - `/hirex` and `/hire-me` are `null`.
  - `/` and `/projects` are never `"hire"`.

### 9. Add the server action `src/app/actions/send-hire-request.ts`

- Start the file with `"use server"`. Export only `sendHireRequest(formData: FormData): Promise<never>`.
  Helpers are module-private: an exported function in a `"use server"` file is a public action.
- Write a block comment in the style of `revalidate-history.ts`. It says:
  - This is a public endpoint.
  - Nothing is sent without a passed Turnstile check.
  - The recipient is the constant `HIRE_RECIPIENT`, never taken from input.
  - The secrets are read only here.
  - The redirect carries only a fixed code.
- A private `async function handle(formData): Promise<"sent" | HireErrorCode>`:
  1. **Configuration:** read `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `TURNSTILE_SECRET_KEY`. If
     any is unset or empty:
     - Log once per process (module-level `let warnedUnconfigured = false`, as in the revalidate
       route), naming only the missing variable names.
     - Return `"send"`.
     - Never continue without verification.
  2. **Token:** `formData.get("cf-turnstile-response")`. If it is not a non-empty string, return
     `"verification"` without calling Siteverify.
  3. **Siteverify:**
     - Read the client IP from `(await headers())`: the first entry of `x-forwarded-for`,
       trimmed, else `x-real-ip`. Omit it when there is neither.
     - `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with a
       `URLSearchParams` body (`secret`, `response`, optional `remoteip`) and
       `signal: AbortSignal.timeout(10_000)`.
     - Any throw, a non-OK status or `success !== true` returns `"verification"`.
     - Log the `error-codes` array only, never the secret or the token.
  4. **Validation:** `parseHireRequest(formData)`. `null` returns `"invalid"`.
  5. **Send:** `new Resend(apiKey).emails.send({ from, to: HIRE_RECIPIENT, replyTo: req.email, subject: hireSubject(req), text: hireBody(req) })`.
     - A returned `error` or a throw: log `error.name`/`error.message` (no key, no input) and
       return `"send"`.
     - Otherwise return `"sent"`.
- `sendHireRequest`:
  - `const outcome = await handle(formData);`
  - Then, outside any `try`, `redirect(outcome === "sent" ? "/hire?sent=1" : `/hire?error=${outcome}`)`.
- Constraints:
  - No `Date.now()` or `new Date()`.
  - No `NEXT_PUBLIC_` reads.

### 10. Add `src/app/actions/send-hire-request.test.ts`

- Mock `next/navigation`: `redirect` throws `new Error(`REDIRECT ${url}`)`, so the test asserts
  the target.
- Mock `next/headers`: `headers` resolves to `new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })`.
- Mock `resend`: `Resend` is a `vi.fn` returning `{ emails: { send } }`, where `send` is a
  `vi.fn` that resolves `{ data: { id: "x" }, error: null }` by default.
- Stub `fetch` with `vi.stubGlobal`. It emulates Siteverify with Cloudflare's test secrets: it
  returns `{ success: true }` for the always-pass secret `1x0000000000000000000000000000000AA` and
  `{ success: false, "error-codes": ["invalid-input-response"] }` for the always-fail secret
  `2x0000000000000000000000000000000AA`.
- Set the env with `vi.stubEnv`. Reset everything in `afterEach`.
- Cases:
  - **Pass:** a valid form, a token and the pass secret.
    - The redirect is `/hire?sent=1`.
    - `fetch` is called once, at the Siteverify URL, with `remoteip=203.0.113.7`.
    - `send` is called exactly once with `to: "hire@issebya.com"`, `replyTo` equal to the
      visitor's email, the expected subject and a body containing the motivation.
  - **Fail secret:** the redirect is `/hire?error=verification` and `send` is not called.
  - **Missing token:** the redirect is `/hire?error=verification`. Neither `fetch` nor `send` is
    called.
  - **Siteverify throws, or answers non-OK:** the redirect is `/hire?error=verification` and
    `send` is not called.
  - **Invalid input with a passed check** (a motivation that is too short): the redirect is
    `/hire?error=invalid` and `send` is not called.
  - **Injection attempt:** the form carries a `to` or `recipient` field with
    `attacker@example.com`. `send` is still called with `to: "hire@issebya.com"` only.
  - **Resend failure:** `send` resolves `{ data: null, error: {...} }`, or rejects. The redirect is
    `/hire?error=send`.
  - **Missing configuration:** each of the three variables is unset in turn. The redirect is
    `/hire?error=send`. Neither `fetch` nor `send` is called. `console.error` (spied) is called
    once across two consecutive calls.
  - **No input in redirect URLs:** across all cases, the redirect URL never contains the
    visitor's input.
- No real network access: the `fetch` stub fails the test on any other URL.

### 11. Add `src/components/SubmitButton.tsx`

- Start the file with `"use client"`. Use `useFormStatus` from `react-dom`.
- `<button type="submit" disabled={pending} aria-disabled={pending} className={`... ${HIRE_ACCENT} disabled:opacity-70`}>`.
- The label is `{pending ? "Sending..." : "Send"}`.
- No state of its own and no effects.

### 12. Add `src/components/TurnstileScript.tsx`

- Start the file with `"use client"`. This is a client leaf with no library wrapper.
- Render `<Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={...} />`.
  (`next/script` controls loading itself, so `async`/`defer` are implied. Keep `async` if the docs
  allow passing it.)
- `onReady` runs on first load and on every later mount. In it, find every
  `.cf-turnstile` container that has no rendered widget yet (no child), and call
  `window.turnstile.render(el)` on it. The container's own `data-sitekey` supplies the key.
- Declare a minimal `window.turnstile` type locally.
- See Notes for why this is needed: implicit rendering scans the DOM only once per script load,
  and both the header's `next/link` and the action's error redirect are soft navigations.

### 13. Add the page `src/app/hire/page.tsx`

- `export const metadata: Metadata = { title: "Hire me", description: "Hire the author of ADW for product engineering or AI consulting." }`.
  Check how the root layout's title composes; there is no template today, so the title is just
  "Hire me".
- `HirePage({ searchParams })`, not async. Layout: `mx-auto max-w-6xl px-4 py-6`, as on `/`.
  - `<h1>Hire me</h1>`.
  - `HIRE_INTRO` paragraphs, in a `max-w-[70ch]` text block.
  - The LinkedIn link: `href={LINKEDIN_URL}`, `target="_blank"`, `rel="noreferrer"`, text "LinkedIn
    profile".
  - `<SectionBoundary fallback={<p ...>Loading form...</p>} detail="The form did not load."><HireStatus searchParams={searchParams} /></SectionBoundary>`.
- `async function HireStatus({ searchParams })`:
  - `const status = hireStatus(await searchParams);`
  - If `sent`: a confirmation block (`role="status"`, for example "Thanks, your message was sent.
    I will reply to the email you gave."). No form.
  - Otherwise: an optional error `<p role="alert">` with `HIRE_ERROR_MESSAGES[code]`, in neutral
    or fuchsia text (never a status hue), then the form.
- The form: `<form action={sendHireRequest}>`.
  - **Offer:** a labelled `<select name="offer" required>` with a disabled empty first option
    ("Choose one") and the `OFFERS` values. The e2e check counts the two real offers, so the
    placeholder option must have `value=""` and be `disabled`.
    - Alternative: no placeholder option, `OFFERS[0]` preselected.
    - Choose the placeholder variant only if the select still has exactly two selectable options.
      Prefer no placeholder, to meet the issue's "exactly two options" literally.
  - **Email:** `type="email" name="email" required maxLength={254} autoComplete="email"`.
  - **Name:** `name="name" maxLength={100} autoComplete="name"`. Optional.
  - **Motivation:** `<textarea name="motivation" required minLength={20} maxLength={4000}>`.
    Import the bounds from `hire-request.ts`.
  - **Turnstile:** `<div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""} />`.
  - `<TurnstileScript />`.
  - `<SubmitButton />`.
- Every field has a visible `<label htmlFor>`.
- No clock reads. No `Providers`.

### 14. Add `HireLink` to the header

- In `src/components/SectionNav.tsx`, add `export function HireLink()`:
  - A `Suspense` whose fallback is `<Link href="/hire" className={HIRE_LINK}>Hire me</Link>`.
  - Its child is `<HeaderLink href="/hire" section="hire" className={HIRE_LINK} activeClassName="" inactiveClassName="">Hire me</HeaderLink>`.
  - `HIRE_LINK = `rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap ${HIRE_ACCENT}``.
- Update the file comment ("two links" becomes three).
- In `src/app/layout.tsx`, render `<HireLink />` after the tagline `<span>` in the `ml-auto` group.
- At 375px: brand, Projects and the button fit on one row. The tagline is already `hidden` below
  `sm`. If they do not fit, reduce nothing else; the header already wraps (`flex-wrap`).

### 15. Write `app_docs/hire.md` and update the docs

- **`app_docs/hire.md`:** follow the existing doc shape (Specifications listing this spec,
  Overview, How it works, Rules). Cover:
  - The page and its static shell versus the `HireStatus` hole.
  - The form fields.
  - The action's order: config, token, Siteverify, parse, send, redirect.
  - The error codes.
  - The four variables and where each is read.
  - How to change the copy (`src/content/hire.ts` only).
  - Local testing with the Cloudflare test keys.
  - Rules:
    - Never send without a passed Turnstile check.
    - Never take a recipient from input (`HIRE_RECIPIENT` only).
    - Never put input or a provider error in the URL.
    - Never read the three secrets outside `send-hire-request.ts`, and never prefix them
      `NEXT_PUBLIC_`.
    - Never mount `Providers` or Realtime on `/hire`.
    - Never use a bare `Suspense` for the status part.
    - No clock reads.
    - Copy only in `src/content/hire.ts`.
    - `parseHireRequest` changes go with a test case.
- **`docs/conditional-docs.md`:** add
  ``- `app_docs/hire.md`: read when changing `/hire`, its form, the `sendHireRequest` action, `src/content/hire.ts`, the Turnstile or Resend configuration or the Hire me button.``
- **`app_docs/routing-and-navigation.md`:**
  - Add `/hire` to the Overview's route list and to How it works, as outside `(dashboard)` like
    `/`, with no `Providers`, Realtime or pill.
  - Describe the header's Hire me button on every route, with `aria-current="page"` on `/hire`.
  - Extend the `headerSection` rule with `"hire"` (exactly `/hire`, never `/hirex`).
- **`app_docs/screens-and-components.md`:**
  - Add `SubmitButton` (reads the form's pending state) and `TurnstileScript` (renders the
    Turnstile widget on mount) to the `"use client"` list.
  - Add a rule: the Hire me button and the Send button take their colour only from `HIRE_ACCENT`
    in `src/lib/accent.ts` (the `/bug` class hue, not a status hue).
- **`app_docs/data-boundary.md`:** rewrite the env rule:
  - `ADW_REVALIDATE_SECRET` is read only in the route handler.
  - `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `TURNSTILE_SECRET_KEY` are server-only and read only
    in `src/app/actions/send-hire-request.ts`.
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is public and read only in `src/app/hire/page.tsx`.
- **`app_docs/error-and-loading-boundaries.md`:**
  - Widen the bare-`Suspense` exception to `HeaderLink`'s reads in `SectionNav.tsx` (brand,
    Projects, Hire me).
  - Name `HireStatus` among the `SectionBoundary` islands.
- **`README.md`:** add `- [Hire me page](app_docs/hire.md)` to the Documentation list.
- **`AGENTS.md`:** no change. Its Documentation rule says that feature rules live in `app_docs/`
  and that `AGENTS.md` never describes a feature, and the existing equivalents of the rules the
  issue lists (server-only variables, client list, route tree, colours) live in those docs (see
  Notes).
- No em-dashes anywhere.

### 16. Update `.adw/project.md` (keep the nine `##` headings)

- **Install, step 1:** `.env.local` may also carry the four hire variables (see `.env.example`).
  They are optional for `yarn build`: the page builds with an empty site key and the action
  rejects with `?error=send` when unconfigured.
- **Tests:** add `e2e/test_hire_page.md` to the journey list.
- **Protected:** never submit the `/hire` form against a server running with real Resend and
  Turnstile keys: it emails `hire@issebya.com`. Never commit the real values.
- **Review:** add `/hire` (heading, intro, LinkedIn link, the form with the two offers, the
  Turnstile widget, the fuchsia Send button; no sidebar, no pill). Note that the Hire me button is
  in the header on every route. Also note that the action has no rendered surface beyond the
  `?sent=1` and `?error=` states, which can be opened directly by URL.

### 17. Add the journey `e2e/test_hire_page.md`

- Model it on `e2e/test_header_section_active.md`.
- Sections: `## User Story`, `## Test Steps` (numbered, with `**Verify**` lines),
  `## Success Criteria`.
- Steps:
  1. On `/`, **Verify** a `Hire me` link in the header (`href="/hire"`).
  2. Repeat on `/projects`.
  3. Repeat on the first project page from the sidebar.
  4. Click it and **Verify** the URL is `/hire` and the link has `aria-current="page"`.
  5. **Verify** the heading "Hire me", the intro paragraphs and a LinkedIn link with
     `target="_blank"` and `rel="noreferrer"`.
  6. **Verify** the `offer` select has exactly the options `Product engineer` and `AI consulting`.
  7. **Verify** the Send button's `class` contains the same `bg-fuchsia-*` classes as the header's
     Hire me link (compare with `browser_evaluate`).
  8. **Verify** there is no connection indicator and no `Projects` sidebar.
  9. Fill offer and email, leave motivation empty, and click Send. **Verify** the URL is still
     `/hire` with no query, and the motivation textarea reports `validity.valueMissing === true`
     (the browser blocked the submit).
  10. Navigate to `/hire?sent=1` and **Verify** the confirmation shows and the form is absent.
  11. Navigate to `/hire?error=verification` and **Verify** the error message is above the form.
  12. Navigate to `/hire?error=<script>` and **Verify** the plain form with no error, and that no
      query text appears on the page.
  13. Screenshot `/hire` at 1920x1080 and at 375x667. **Verify** at 375 that the header shows the
      brand, Projects and Hire me without horizontal overflow
      (`document.documentElement.scrollWidth <= 375`).
- The journey deliberately never submits a valid form (see Testing Strategy).

### 18. Run the Validation Commands

- Run every command below.
- Fix any failure at its source. Never weaken a rule, a type or a test.

## Testing Strategy

### Unit Tests

- `src/lib/hire-request.test.ts`: `parseHireRequest` (valid, each invalid field, length bounds,
  header-injection attempts in name and email), `hireSubject`, `hireBody` and `hireStatus`.
- `src/app/actions/send-hire-request.test.ts`: the action end to end, with mocked Siteverify
  (`fetch` stub emulating the always-pass and always-fail test secrets), mocked Resend,
  `next/headers` and `next/navigation`. It sends only after Turnstile passes, sends exactly one
  email to `hire@issebya.com` with the visitor as reply-to, and redirects with the right code on
  each failure, including missing configuration.
- `src/lib/header-section.test.ts`: new `"hire"` cases.

### Test Coverage

- **`src/lib/hire-request.test.ts` (vitest unit):** catches header injection through name or
  email, out-of-bounds motivation, an offer outside `OFFERS`, and a hand-edited `?error=` being
  rendered. Nothing tests these today, and the tests fail without the module.
- **`src/app/actions/send-hire-request.test.ts` (vitest unit):** catches the following, none of
  which any test covers today:
  - an email sent without a passed Turnstile check;
  - an email sent to a recipient other than `hire@issebya.com`;
  - a missing reply-to;
  - a wrong redirect code;
  - sending while unconfigured.
- **`src/lib/header-section.test.ts` (vitest unit), extended:** catches `/hire` not being marked
  as the current header section, or `/hirex` being marked. It fails without the change.
- **`e2e/test_hire_page.md` (agent-driven journey, a task in step 17, not a regression layer):**
  - The profile has no code E2E suite and no component test layer, and the issue explicitly asks
    for browser checks. So the header button on three routes, the select's two options, the
    accent match, the browser-blocked empty motivation and the status states are covered by a
    journey.
  - The valid-submit path ("Sending..." and then the confirmation) is deliberately not in the
    journey. The review server runs with the owner's real keys copied into the worktree, so a
    valid submit would send a real email to `hire@issebya.com`, which the issue forbids. There is
    also no in-app stub boundary for Resend.
  - That path is proven by the action unit tests and by the owner's post-merge real test
    submission. `SubmitButton`'s pending label is a one-line `useFormStatus` read with no logic
    to regress.
- **No test for `HIRE_ACCENT` itself:** it is a constant string. The status-hue guard already
  scans it, and the journey checks that the header and Send buttons share it.

### Edge Cases

- A name or email with `\r\n` or `\n` followed by a fake header.
- A motivation of 19 and 20 characters, and of 4000 and 4001 characters. Whitespace-only padding
  is trimmed before counting.
- The offer differs by case or whitespace (`"ai consulting"`), or is missing.
- A field submitted as a file.
- A missing `cf-turnstile-response`. Siteverify network failure, timeout or a non-JSON body.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` or `TURNSTILE_SECRET_KEY` unset or empty. It is logged
  once, not per request.
- Resend returns `{ error }` versus throws.
- An extra `to` or `recipient` field in the posted form is ignored.
- `?error=` with an unknown value, repeated params (array), and `?sent=` with any value other
  than `1`.
- Soft navigation to `/hire` from the header, and the error redirect back to `/hire`: the widget
  must render again (`TurnstileScript`'s `onReady`).
- No `x-forwarded-for` header: `remoteip` is omitted.
- A 375px viewport: the header fits.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` unset at build: the page still builds, and the action rejects
  for the missing token.

## Acceptance Criteria

**Header**

- A fuchsia, solid "Hire me" `next/link` to `/hire` is in the header's right group on `/`,
  `/projects`, project pages and `/hire`.
- It carries `aria-current="page"` only on `/hire`.
- It fits the header at 375px.
- The header button and the Send button use the same `HIRE_ACCENT` from `src/lib/accent.ts`.
- The white label meets WCAG AA contrast in light and dark modes.

**`/hire` page**

- `/hire` is a server page outside `(dashboard)`: no sidebar, no `Providers`, no Realtime and no
  connection pill.
- It has the title "Hire me" and a one-line description.
- The intro paragraphs, the LinkedIn URL and the offers come only from `src/content/hire.ts`,
  marked as placeholders.
- The LinkedIn link has `target="_blank"` and `rel="noreferrer"`.

**Form**

- The form is `<form action={sendHireRequest}>` with:
  - a required select of exactly `Product engineer` and `AI consulting`;
  - a required email;
  - an optional name;
  - a required textarea with `minLength` 20 and `maxLength` 4000;
  - a `.cf-turnstile` div with the public site key;
  - the Cloudflare script via `next/script`;
  - `SubmitButton`, which shows "Sending..." and is disabled while pending.
- `?sent=1` shows a confirmation in place of the form.
- `?error=verification|invalid|send` shows a fixed message above the form.
- Any other query shows the plain form.
- The status and form part renders under a `SectionBoundary`. The heading and intro are in the
  static shell.

**Action**

- `sendHireRequest` sends only after Siteverify returns `success: true`.
- It sends exactly one email:
  - `to` the constant `hire@issebya.com`;
  - `from` `RESEND_FROM_EMAIL`;
  - `replyTo` the visitor's email;
  - subject `Hire: <offer> - <name or email>`, with no CR/LF;
  - a plain-text body with offer, name, email and motivation.
- It redirects to `/hire?sent=1` or `/hire?error=<code>`, never with input or provider text in
  the URL.
- It rejects with `?error=send`, logging once, when any of the three server variables is unset.

**Environment, documentation and checks**

- The three secrets are read only in `send-hire-request.ts`. The site key is read only in the
  page. `.env.example` lists all four with placeholders.
- No clock reads are added.
- `app_docs/hire.md` exists and is indexed. The routing, screens, data-boundary and boundaries
  docs, `.adw/project.md` and the README docs list are updated. No em-dashes are added.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test` and `yarn build`
  pass.
- The served HTML of `/` and of a project page still contains the run rows.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint, including `no-secrets` (the Turnstile test keys in tests must not trip it)
  and `security`.
- `yarn typecheck`: `next typegen` then `tsc --noEmit`. It types the new route's `searchParams`
  and the action.
- `yarn knip`: no unused files, exports or dependencies. `resend` is used, and every new export
  is imported.
- `yarn format:check`: Prettier over the new and changed files.
- `yarn test`: vitest. The new `hire-request` and `send-hire-request` tests, the extended
  `header-section` test, and the status-hue and layer guards still pass.
- `yarn build`: production build. `/hire` prerenders its shell with the status part as a hole, and
  `/` and project pages still build and read the database.
- After `yarn build`, `yarn start` on `$PORT` (from `.ports.env`, default 3000). Check that the
  served HTML of `/` and `/projects/SBub/issebya-homes-ai-system` (or the first listed project)
  still contains the run rows, and that `/hire` contains "Hire me", the select and the
  `cf-turnstile` div. Example: `curl -s http://localhost:$PORT/hire | grep -c 'cf-turnstile'`.
  Stop only the server this run started.

## Notes

- **New dependency:** `resend`, added with `yarn add resend`.
- **AGENTS.md versus the issue:** the issue asks for rule edits in `AGENTS.md` (server-only
  variables, route tree, client component list, accent colour, public-endpoint rule). Since the
  docs move (#127), `AGENTS.md` says feature rules live in `app_docs/` and that it never
  describes a feature, and each of those lists now lives in a feature doc (`data-boundary.md`,
  `routing-and-navigation.md`, `screens-and-components.md`, `error-and-loading-boundaries.md`).
  The plan therefore puts every requested rule in those docs and in `app_docs/hire.md`, and
  leaves `AGENTS.md` unchanged.
- **Deviation, `TurnstileScript` client leaf:**
  - The issue asks for a plain `.cf-turnstile` div plus the script with no React wrapper.
  - Turnstile's implicit rendering scans the DOM once, when the script loads. `next/script` loads
    a given `src` only once per session.
  - Two paths reach `/hire` by soft navigation: the header's `next/link`, and the action's
    `redirect` back to `/hire?error=...`, which is a client navigation when JavaScript is on.
    After either, the widget would never render, so no token would be posted and every retry
    would fail verification.
  - The plan keeps the plain div with `data-sitekey` (no wrapper library, no React-owned widget
    state). It moves only the script into a tiny client leaf whose `next/script` `onReady`
    explicitly renders any unrendered `.cf-turnstile` container.
  - If the reviewer prefers the literal spec, the alternative is a plain `<Script>` in the server
    page, with the header link and the error path accepting a hard reload. That is not
    recommended.
- **No-JavaScript behaviour:** the form posts without JavaScript, but Turnstile needs JavaScript
  to produce a token, so a no-JavaScript submission is answered with `?error=verification`. This
  is consistent with "nothing is sent without a passed check".
- **Lost input on error:** after an error redirect the form re-renders empty, because input is
  never carried in the URL. This is acceptable for now. A later change could switch to
  `useActionState` to keep values, at the cost of a larger client surface.
- **Contrast:** `bg-fuchsia-500` (the chart's `/bug` fill) fails AA with a white label. The
  accent uses 700 in light mode and 600 in dark mode, at the same hue. Verify the dark value and
  fall back to 700.
- **Owner steps after merge (not for the run):**
  - Add the four variables in Vercel (Production and Preview).
  - Fill `src/content/hire.ts`.
  - Promote to `master`.
  - Send one real test submission.
- **Possible follow-up:** rate limiting the action (Turnstile is the only abuse control for now).
