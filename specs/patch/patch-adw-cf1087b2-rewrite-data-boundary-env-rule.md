# Patch: Rewrite the data-boundary env rule for the /hire variables

## Metadata

adw_id: `cf1087b2`
review_change_request: `Issue #2: A feature-doc invariant now contradicts the code. app_docs/data-boundary.md line 393 still says "` + "`ADW_REVALIDATE_SECRET` is the one server-only variable" + `". This branch adds three more server-only variables (RESEND_API_KEY, RESEND_FROM_EMAIL, TURNSTILE_SECRET_KEY, read in src/app/actions/send-hire-request.ts) and a public NEXT_PUBLIC_TURNSTILE_SITE_KEY read in src/app/hire/page.tsx. AGENTS.md requires that "A change that breaks one changes the rule in that doc in the same commit", and spec step 15 asks for this exact rewrite. Resolution: Rewrite the env rule in app_docs/data-boundary.md as step 15 specifies. ADW_REVALIDATE_SECRET is read only in the route handler. RESEND_API_KEY, RESEND_FROM_EMAIL and TURNSTILE_SECRET_KEY are server-only, never prefixed NEXT_PUBLIC_, and read only in src/app/actions/send-hire-request.ts. NEXT_PUBLIC_TURNSTILE_SITE_KEY is public and read only in src/app/hire/page.tsx. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-164-adw-cf1087b2-sdlc_planner-hire-me-page-contact-form.md`
**Issue:** The committed `app_docs/data-boundary.md` Rules section still states "`ADW_REVALIDATE_SECRET` is the one server-only variable", which the feature made false. The code reads `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `TURNSTILE_SECRET_KEY` in `src/app/actions/send-hire-request.ts:42-44` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in `src/app/hire/page.tsx:87`; `ADW_REVALIDATE_SECRET` stays in `src/app/api/revalidate/route.ts:78`. The working tree (from the issue #1 docs patch) already carries a draft rewrite of that bullet, but it is uncommitted and does not say explicitly that the three new secrets are never prefixed `NEXT_PUBLIC_`.
**Solution:** Docs-only. Finalise the env bullet in the Rules section of `app_docs/data-boundary.md` so it names every variable, where it is read, and which side it lives on, exactly as the resolution states, then commit it together with the rest of the step 15 docs so the invariant and the code agree in the same commit. No code changes.

## Files to Modify

Use these files to implement the patch:

- `app_docs/data-boundary.md` (the env bullet in `## Rules`, currently lines 392-402 in the working tree)

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Replace the env bullet in `app_docs/data-boundary.md`

- In `## Rules`, replace the whole bullet that starts "`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public by design" (whichever form is present: the old "is the one server-only variable" text or the working-tree draft) with exactly:

  ```md
  - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
    public by design (browser bundle, RLS-limited). The secret / service role
    key must never be added to this repo, to any `.env*` file in it, or to any
    variable with a `NEXT_PUBLIC_` prefix. Server-only variables never carry
    the `NEXT_PUBLIC_` prefix: `ADW_REVALIDATE_SECRET` is read only in the
    route handler (`src/app/api/revalidate/route.ts`); `RESEND_API_KEY`,
    `RESEND_FROM_EMAIL` and `TURNSTILE_SECRET_KEY` are read only in
    `src/app/actions/send-hire-request.ts`. `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
    is public by design (the Turnstile widget needs it in the browser) and is
    read only in `src/app/hire/page.tsx`. `.env.example` is tracked with
    placeholders; `.env.development` (dev) and `.env.local` (all modes,
    including build and start) hold the real values and are gitignored.
  ```

- No em-dashes. Leave every other bullet and section untouched (the `.env.local` paragraph pointing at `app_docs/hire.md` from the issue #1 patch stays).

### Step 2: Confirm the rule matches the code and nothing else contradicts it

- `grep -rn "process.env" src` must show `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TURNSTILE_SECRET_KEY` only in `src/app/actions/send-hire-request.ts`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` only in `src/app/hire/page.tsx`, `ADW_REVALIDATE_SECRET` only in `src/app/api/revalidate/route.ts`. If any read appears elsewhere, the rule is wrong: stop and report it rather than editing code.
- `grep -rn "one server-only" app_docs README.md AGENTS.md .adw/project.md` must return nothing.
- `grep -nP '\x{2014}' app_docs/data-boundary.md` must return nothing.

### Step 3: Commit the docs with the rule change

- Stage `app_docs/data-boundary.md` together with the other step 15 doc changes already in the tree (`app_docs/hire.md`, `app_docs/error-and-loading-boundaries.md`, `app_docs/routing-and-navigation.md`, `app_docs/screens-and-components.md`, `docs/conditional-docs.md`, `README.md`) and the patch plans under `specs/patch/`. Never stage `next-env.d.ts`, `.ports.env`, `.env*`, `agents/` or `trees/`.
- Commit as `docs: write hire feature docs and widen the env rule` with no trailers; let lefthook run (never `--no-verify`).

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn format:check` (Prettier accepts the rewrapped bullet; run `yarn format` on the file if not).
- `yarn lint`
- `yarn typecheck`
- `yarn knip`
- `yarn test`

`yarn build` is not needed: the patch changes one Markdown file and no code.

## Patch Scope

**Lines of code to change:** about 12 lines of Markdown in one file, 0 lines of code
**Risk level:** low
**Testing required:** the profile's Tests checks pass unchanged; the greps in step 2 confirm the rule agrees with every `process.env` read in `src/`.
