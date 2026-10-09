# Patch: Write the /hire feature doc and update the docs it touches (spec step 15)

## Metadata

adw_id: `cf1087b2`
review_change_request: `Issue #1: Spec step 15 and the acceptance criterion "app_docs/hire.md exists and is indexed. The routing, screens, data-boundary and boundaries docs, .adw/project.md and the README docs list are updated" are not implemented. git diff origin/develop --stat touches no file under app_docs/, docs/conditional-docs.md or README.md. app_docs/hire.md does not exist, and grepping docs/conditional-docs.md and README.md for "hire" finds nothing. Only the .adw/project.md part of the criterion was done. Resolution: (1) Create app_docs/hire.md (Specifications, Overview, How it works, Rules) covering step 15. (2) Add the index line to docs/conditional-docs.md. (3) routing-and-navigation.md: /hire route, Hire me button with aria-current, headerSection rule "hire". (4) screens-and-components.md: SubmitButton and TurnstileScript in the "use client" list, HIRE_ACCENT colour rule. (5) error-and-loading-boundaries.md: widen the bare-Suspense exception to HeaderLink reads in SectionNav.tsx (brand, Projects, Hire me), name HireStatus among the SectionBoundary islands. (6) README.md: add the Hire me page link. No em-dashes. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-164-adw-cf1087b2-sdlc_planner-hire-me-page-contact-form.md`
**Issue:** Step 15 of the spec was skipped entirely: no `app_docs/hire.md`, no index line, no README link, and none of the routing, screens, data-boundary or boundaries docs mention `/hire`. The acceptance criterion quoted by the review names the data-boundary doc too, so its env rule is still the pre-feature one ("`ADW_REVALIDATE_SECRET` is the one server-only variable"), which the feature has made false.
**Solution:** Docs-only edits. Create one new feature doc that describes what the code already does (`src/app/hire/page.tsx`, `src/app/actions/send-hire-request.ts`, `src/lib/hire-request.ts`, `src/content/hire.ts`, `src/lib/accent.ts`, `src/components/SubmitButton.tsx`, `src/components/TurnstileScript.tsx`, `HireLink` in `src/components/SectionNav.tsx`), index it, link it from the README, and make the targeted edits in four existing docs, each also listing the issue-164 spec under `**Specifications:**`. No code changes; `AGENTS.md` and `.adw/project.md` stay unchanged.

## Files to Modify

Use these files to implement the patch:

- `app_docs/hire.md` (new)
- `docs/conditional-docs.md`
- `README.md`
- `app_docs/routing-and-navigation.md`
- `app_docs/screens-and-components.md`
- `app_docs/error-and-loading-boundaries.md`
- `app_docs/data-boundary.md`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create `app_docs/hire.md`

Follow the shape of `app_docs/summary.md` (`# Hire me page`, `**Specifications:**` list, `## Overview`, `## How it works` with `###` subsections, `## Rules`), prose wrapped near 80 columns. Before writing each fact, confirm it against the source file named. Content:

- **Specifications:** `- specs/issue-164-adw-cf1087b2-sdlc_planner-hire-me-page-contact-form.md`.
- **Overview:** `/hire` (`src/app/hire/page.tsx`) is the contact page reached from the header's Hire me button: heading, intro, LinkedIn link and a form that sends one plain-text email to `hire@issebya.com` through Resend after a Cloudflare Turnstile check. It sits outside `(dashboard)`: no sidebar, no `Providers`, no Realtime, no pill.
- **How it works / The page:** `HirePage` is not async; the heading, the `HIRE_INTRO` paragraphs and the LinkedIn link are the static shell. `HireStatus` is the one request-time island: it awaits `searchParams` and turns them into a status with `hireStatus` (`src/lib/hire-request.ts`), under a `SectionBoundary` whose fallback is the form itself. `?sent=1` replaces the form with a thank-you; `?error=<code>` shows the fixed message from `HIRE_ERROR_MESSAGES` above the form.
- **How it works / The form:** fields `offer` (select over `OFFERS`, required), `email` (required, max `EMAIL_MAX` 254), `name` (optional, max `NAME_MAX` 100), `motivation` (required, `MOTIVATION_MIN` 20 to `MOTIVATION_MAX` 4000), the Turnstile widget (`cf-turnstile` div with `data-sitekey`, loaded by `TurnstileScript`, which posts `cf-turnstile-response`) and the `SubmitButton` (reads the form's pending state, coloured by `HIRE_ACCENT`). `parseHireRequest` rejects control characters in the email (it becomes the reply-to), flattens the name to one line (it goes in the subject) and keeps newlines in the motivation (body only).
- **How it works / The action:** `sendHireRequest` in `src/app/actions/send-hire-request.ts`, in this order: (1) config: read the three server-only variables, any missing answers `send` and logs once per process; (2) token: a missing or empty `cf-turnstile-response` answers `verification`; (3) Siteverify: POST to Cloudflare with the secret, the token and the client IP (first `x-forwarded-for`, else `x-real-ip`), 10 s timeout, anything but `success: true` answers `verification`; (4) parse: `parseHireRequest` returning null answers `invalid`; (5) send: Resend from `RESEND_FROM_EMAIL` to `HIRE_RECIPIENT`, reply-to the visitor, `hireSubject`/`hireBody`; a provider error or throw answers `send`; (6) redirect, outside any try, to `/hire?sent=1` or `/hire?error=<code>`.
- **How it works / Error codes:** `verification`, `invalid`, `send` (`HireErrorCode`), each with its fixed message; the URL carries the code only.
- **How it works / Environment:** a table or list of the four variables: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public, read only in `src/app/hire/page.tsx`, empty string when unset so the page still builds), `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (server-only, read only in `send-hire-request.ts`). Real values in `.env.local` and the host's environment; `.env.example` holds placeholders.
- **How it works / Changing the copy:** the offers, intro paragraphs and LinkedIn URL live only in `src/content/hire.ts`; the error messages are in `HIRE_ERROR_MESSAGES`.
- **How it works / Testing locally:** `.env.example`'s Turnstile values are Cloudflare's always-pass test keys (`1x00000000000000000000AA`, `1x0000000000000000000000000000000AA`); with them the widget passes without a challenge. Never submit a valid form against a server with real Resend and Turnstile keys (it emails `hire@issebya.com`); the `?sent=1` and `?error=<code>` states open directly by URL. The logic is covered by `src/lib/hire-request.test.ts` and `src/app/actions/send-hire-request.test.ts`.
- **Rules** (nine bullets, phrased as invariants):
  - Never send without a passed Turnstile check (Siteverify answering `success: true`).
  - Never take a recipient from input: the only recipient is `HIRE_RECIPIENT`.
  - Never put input or a provider's error text in the URL: the redirect carries `sent=1` or a fixed `HireErrorCode` only.
  - Never read `RESEND_API_KEY`, `RESEND_FROM_EMAIL` or `TURNSTILE_SECRET_KEY` outside `src/app/actions/send-hire-request.ts`, and never prefix them `NEXT_PUBLIC_`.
  - Never mount `Providers` or Realtime on `/hire`.
  - Never render the status part under a bare `Suspense`: `HireStatus` stays under its `SectionBoundary`.
  - No clock reads on the page, in the action or in `src/lib/hire-request.ts`.
  - Copy lives only in `src/content/hire.ts`.
  - Every change to `parseHireRequest` goes with a test case in `src/lib/hire-request.test.ts`.

### Step 2: Index and README

- `docs/conditional-docs.md`: append after the summary line:
  ``- `app_docs/hire.md`: read when changing `/hire`, its form, the `sendHireRequest` action, `src/content/hire.ts`, the Turnstile or Resend configuration or the Hire me button.``
- `README.md`: append `- [Hire me page](app_docs/hire.md)` after `- [Summary page](app_docs/summary.md)` in the Documentation list.

### Step 3: `app_docs/routing-and-navigation.md` and `app_docs/screens-and-components.md`

- Both: append `- specs/issue-164-adw-cf1087b2-sdlc_planner-hire-me-page-contact-form.md` to `**Specifications:**`.
- Routing, Overview (line 9): add `/hire` to the route list.
- Routing, How it works (lines 13 to 20): after the sentence about the "Projects" link, describe the header's Hire me button (`HireLink`), a solid fuchsia button at the header's right on every route linking to `/hire`, carrying `aria-current="page"` only on `/hire`.
- Routing, the paragraph at line 56 ("The summary is the root route `/`..."): add that `/hire` (`src/app/hire/page.tsx`) likewise sits outside `(dashboard)`, with no `Providers`, Realtime or pill (see `app_docs/hire.md`).
- Routing, Rules, the `headerSection` bullet (lines 92 to 98): add "Hire me" is active on exactly `/hire` (never `/hirex` or `/hire-me`), so `headerSection` answers `"summary"`, `"projects"`, `"hire"` or null; the active link carries `aria-current="page"`, the others none (change "the other none" to "the others none").
- Screens, Rules, `"use client"` list (lines 141 to 157): add `SubmitButton`, which reads its form's pending state, and `TurnstileScript`, which renders the Turnstile widget on mount; keep `HeaderLink`'s entry as is (it now also serves `HireLink`).
- Screens, Rules: after the status-colours bullet, add: "The header's Hire me button and the `/hire` Send button take their colour only from `HIRE_ACCENT` in `src/lib/accent.ts` (fuchsia 700, the `/bug` class hue, not a status hue); never write a `fuchsia` class anywhere else."

### Step 4: `app_docs/error-and-loading-boundaries.md` and `app_docs/data-boundary.md`

- Both: append the issue-164 spec line to `**Specifications:**`.
- Boundaries, How it works (around line 42): add `HireStatus` on `/hire` to the islands wrapped in a `SectionBoundary` (its fallback is the form).
- Boundaries, Rules (lines 70 to 75): rewrite the exception as "`HeaderLink`'s `usePathname` reads in `SectionNav.tsx` (the brand, Projects and Hire me links), each in a plain `Suspense`"; the fallback is the same link inactive (for Hire me, the button without `aria-current`). Keep "No other `Suspense` may be bare."
- Data boundary, Environment section (line 258): add one sentence pointing to `app_docs/hire.md` for the four `/hire` variables.
- Data boundary, Rules (lines 393 to 395): replace "`ADW_REVALIDATE_SECRET` is the one server-only variable: it stays without the prefix and is read only in the route handler." with: server-only variables stay without the `NEXT_PUBLIC_` prefix; `ADW_REVALIDATE_SECRET` is read only in the route handler; `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `TURNSTILE_SECRET_KEY` are read only in `src/app/actions/send-hire-request.ts`; `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is public and read only in `src/app/hire/page.tsx`.

### Step 5: Em-dashes and format

- `grep -rn $'\xe2\x80\x94' app_docs/ docs/conditional-docs.md README.md` must print nothing.
- Run `yarn format`, then `yarn format:check`.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `test -f app_docs/hire.md && grep -c "app_docs/hire.md" docs/conditional-docs.md README.md`: each count is 1.
- `grep -c "issue-164-adw-cf1087b2" app_docs/hire.md app_docs/routing-and-navigation.md app_docs/screens-and-components.md app_docs/error-and-loading-boundaries.md app_docs/data-boundary.md`: each count is at least 1; `grep -n "SubmitButton\|TurnstileScript\|HIRE_ACCENT" app_docs/screens-and-components.md`, `grep -n "HireStatus\|Hire me" app_docs/error-and-loading-boundaries.md`, `grep -n '"hire"\|/hire' app_docs/routing-and-navigation.md` and `grep -n "TURNSTILE_SECRET_KEY" app_docs/data-boundary.md` each match.
- `grep -rn $'\xe2\x80\x94' app_docs/ docs/ README.md`: no output.
- `yarn format:check`
- `yarn lint && yarn typecheck && yarn knip && yarn test` (lefthook's commit and push checks; docs-only, expected unchanged).

## Patch Scope

**Lines of code to change:** about 130 lines of Markdown (about 100 in the new doc, about 30 across six existing files), no code.
**Risk level:** low
**Testing required:** grep checks for each required mention, the em-dash check and `yarn format:check`; the hook checks must stay green.
