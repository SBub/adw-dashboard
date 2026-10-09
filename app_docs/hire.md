# Hire me page

**Specifications:**

- specs/issue-164-adw-cf1087b2-sdlc_planner-hire-me-page-contact-form.md

## Overview

`/hire` (`src/app/hire/page.tsx`) is the contact page reached from the header's Hire me button: a heading, an intro, a LinkedIn link and a form that sends one plain-text email to `hire@issebya.com` through Resend after a Cloudflare Turnstile check. It sits outside `(dashboard)`: no sidebar, no `Providers`, no Realtime, no connection pill.

## How it works

### The page

`HirePage` is not async: the heading, the `HIRE_INTRO` paragraphs and the
LinkedIn link are the static shell. `HireStatus` is the one request-time
island: it awaits `searchParams` and turns them into a status with
`hireStatus` (`src/lib/hire-request.ts`), under a `SectionBoundary` whose
fallback reads "Loading form...". `?sent=1` replaces the form with a
thank-you; `?error=<code>` shows the fixed message from
`HIRE_ERROR_MESSAGES` above the form. Anything else (an unknown code, a
repeated parameter) shows the plain form.

### The form

The form posts to the `sendHireRequest` server action. Its fields:

- `offer`: a select over `OFFERS`, required.
- `email`: required, at most `EMAIL_MAX` (254) characters.
- `name`: optional, at most `NAME_MAX` (100) characters.
- `motivation`: required, `MOTIVATION_MIN` (20) to `MOTIVATION_MAX` (4000)
  characters.
- The Turnstile widget: a `cf-turnstile` div carrying `data-sitekey`,
  rendered by `TurnstileScript` (`src/components/TurnstileScript.tsx`) on
  every mount, soft navigations included; it posts `cf-turnstile-response`.
- `SubmitButton` (`src/components/SubmitButton.tsx`): reads the form's
  pending state (disabled, "Sending..."), coloured by `HIRE_ACCENT`.

The browser's validation mirrors the server's bounds; the server's are the
ones that count. `parseHireRequest` rejects any control character in the
email (it becomes the reply-to), flattens the name to one line (it goes in
the subject) and keeps newlines in the motivation (body only).

### The action

`sendHireRequest` in `src/app/actions/send-hire-request.ts`, in this order:

1. Config: read the three server-only variables; any one missing answers
   `send` and logs once per server process.
2. Token: a missing or empty `cf-turnstile-response` answers
   `verification`.
3. Siteverify: POST to Cloudflare with the secret, the token and the client
   IP (the first `x-forwarded-for` entry, else `x-real-ip`), with a 10 s
   timeout; anything but `success: true` answers `verification`.
4. Parse: `parseHireRequest` returning null answers `invalid`.
5. Send: Resend from `RESEND_FROM_EMAIL` to `HIRE_RECIPIENT`, reply-to the
   visitor, subject `hireSubject` and body `hireBody`; a provider error or a
   throw answers `send`.
6. Redirect, outside any try, to `/hire?sent=1` or `/hire?error=<code>`.

### Error codes

`verification`, `invalid` and `send` (`HireErrorCode`), each with its fixed
message in `HIRE_ERROR_MESSAGES`. The URL carries the code only.

### Environment

| variable                         | kind        | read only in                           |
| -------------------------------- | ----------- | -------------------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public      | `src/app/hire/page.tsx`                |
| `TURNSTILE_SECRET_KEY`           | server-only | `src/app/actions/send-hire-request.ts` |
| `RESEND_API_KEY`                 | server-only | `src/app/actions/send-hire-request.ts` |
| `RESEND_FROM_EMAIL`              | server-only | `src/app/actions/send-hire-request.ts` |

An unset site key renders as an empty string, so the page still builds; an
unset server-only variable makes every post answer `?error=send`. The real
values live in `.env.local` and in the host's environment; `.env.example`
holds placeholders.

### Changing the copy

The offers, the intro paragraphs and the LinkedIn URL live only in
`src/content/hire.ts`; the error messages are `HIRE_ERROR_MESSAGES` in
`src/lib/hire-request.ts`.

### Testing locally

`.env.example`'s Turnstile values are Cloudflare's always-pass test keys
(`1x00000000000000000000AA` for the site key,
`1x0000000000000000000000000000000AA` for the secret); with them the widget
passes without a challenge. Never submit a valid form against a server with
real Resend and Turnstile keys: it emails `hire@issebya.com`. The
`?sent=1` and `?error=<code>` states open directly by URL. The logic is
covered by `src/lib/hire-request.test.ts` and
`src/app/actions/send-hire-request.test.ts`.

## Rules

- Never send without a passed Turnstile check (Siteverify answering
  `success: true`).
- Never take a recipient from input: the only recipient is `HIRE_RECIPIENT`.
- Never put input or a provider's error text in the URL: the redirect carries
  `sent=1` or a fixed `HireErrorCode` only.
- Never read `RESEND_API_KEY`, `RESEND_FROM_EMAIL` or `TURNSTILE_SECRET_KEY`
  outside `src/app/actions/send-hire-request.ts`, and never prefix them
  `NEXT_PUBLIC_`.
- Never mount `Providers` or Realtime on `/hire`.
- Never render the status part under a bare `Suspense`: `HireStatus` stays
  under its `SectionBoundary`.
- No clock reads on the page, in the action or in `src/lib/hire-request.ts`.
- The page's copy lives only in `src/content/hire.ts`.
- Every change to `parseHireRequest` goes with a test case in
  `src/lib/hire-request.test.ts`.
