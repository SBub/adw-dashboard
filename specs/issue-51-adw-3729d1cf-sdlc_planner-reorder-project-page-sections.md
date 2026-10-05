# Chore: Project page sections in the order Active, Queue, History

## Metadata

issue_number: `51`
adw_id: `3729d1cf`
issue_json: `{"number":51,"title":"Project page sections in the order Active, Queue, History","body":"## Problem\nThe project page (`src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`) renders the sections as Queue, Active, History. The run in progress is what a visitor looks for first; the queue is what comes next; history is the past.\n\n## What to build\n- Reorder the sections to Active, Queue, History. Only the order of the three section elements in the page changes; each section keeps its heading, description (from #45 when merged, or current markup), components, boundaries and data.\n- The Queue section keeps its live listener and the Active section its hydration; no data or key changes.\n- README: update the sentence that lists the sections in order, if any.\n\n## Acceptance\n- On a project page the order top to bottom is Active, Queue, History, in light and dark mode and at 360px.\n- No change to counts, live updates, pagination or search.\n- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass.\n\n## Out of scope\nAny change inside the sections."}`

## Chore Description

The project page currently renders, top to bottom: page header, Queue, Active, History. The issue asks for header, Active, Queue, History.

The order is not decided in the page file alone. The Queue section is built by the page (`queueSection`: its own `HydrationBoundary` around its own `QueryBoundary` around `QueueView`) and passed into `ActiveRunsView` as the `queue` slot prop. `ActiveRunsView` renders, in its found branch:

```tsx
<PageHeader ... />
{queue}
<section className="mb-10">{heading} ...active rows...</section>
```

History is rendered by the page after the `ActiveRunsView` boundary, so it already comes last.

The minimal change that keeps every invariant in `AGENTS.md` (the queue never read inside `ActiveRunsView`, never merged into the runs entry, never sharing a boundary with Active, never rendered in the not-found branch, the heading slots unchanged) is to move `{queue}` in `ActiveRunsView` from between `PageHeader` and the Active `<section>` to directly after the Active `<section>`. The slot mechanism stays: it is still what keeps the queue out of the not-found branch and below the header. Both `QueueView`'s `<section>` and the Active `<section>` carry `mb-10`, so spacing is unchanged after the swap (Active then Queue then History, each separated by the same margin).

No data, key, boundary, hydration, Realtime, copy or styling change. Everything else in this chore is keeping the prose that describes the order (code comments, README, AGENTS.md rule, the ADW profile's Review section) in step with the code, as `AGENTS.md` and the profile require.

## Relevant Files

Use these files to resolve the chore:

- `src/components/ActiveRunsView.tsx`: renders the `queue` slot between `PageHeader` and the Active section. The one code change: move `{queue}` after the Active `<section>`. Its doc comment (lines 11 to 26, "rendered between the header and Active so the queue sits above Active") must be updated to say the slot is rendered after Active, below the header.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: builds `queueSection` and passes it as the slot. No JSX change. Update the comment above `queueSection` (around lines 309 to 311, "slotted into ActiveRunsView between the header and Active") to "after Active". The comment above the History block ("the Active list above") stays true. The JSX order of the `queueHeading` / `activeHeading` constants may optionally be swapped to read in display order, but that is cosmetic and not required.
- `src/components/QueueView.tsx`: doc comment line 15 says "The page slots it into ActiveRunsView, above Active"; change to "below Active". No code change.
- `README.md`: line 15 to 20 lists the sections in order ("a Queue section ... then an Active section ... and a History section"); rewrite to Active, then Queue, then History, keeping each section's description. Lines 331 to 333 ("which renders it between the header and Active: the Queue sits above Active") must say it renders the slot after Active, below the header. Also check item 4 (lines 339 to 345) still reads correctly (it does: header and Active section; mention the queue slot after Active only if it reads naturally).
- `AGENTS.md`: the rule at lines 110 to 117 ("The Queue section sits above Active through `ActiveRunsView`'s `queue` slot prop ... renders it between `PageHeader` and the Active section, never in the not-found branch") must be rewritten to "sits below Active ... renders it after the Active section (below `PageHeader`), never in the not-found branch", keeping every other prohibition in that rule verbatim.
- `.adw/project.md`: the Review section (line 121) lists "(header, Queue section, Active section, History section)"; change to "(header, Active section, Queue section, History section)". Only text under the existing heading changes; the nine `##` headings are untouched.
- `src/components/SectionHeading.tsx`, `src/components/QueryBoundary.tsx`: read only, to confirm nothing there depends on position. No change.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Move the queue slot below Active

- In `src/components/ActiveRunsView.tsx`, in the found branch's returned fragment, move the `{queue}` line from directly after `<PageHeader ... />` to directly after the closing `</section>` of the Active section. Do not touch the not-found branch, the `useSuspenseQuery` options, the props or the `mb-10` classes.
- Update the component's doc comment: the `queue` slot is rendered after the Active section (below the header), so the queue sits below Active while its loading and error states stay independent of this entry's. Keep the rest of the comment as is.

### 2. Bring the other code comments in step

- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: the comment above `const queueSection` becomes "slotted into ActiveRunsView after Active: a failed queue read shows its panel in this slot while the header and Active stay up." No JSX change.
- `src/components/QueueView.tsx`: "above Active" becomes "below Active" in the doc comment. No code change.
- Grep `src/` for any remaining "above Active", "between the header and Active" or "between PageHeader" and fix each.

### 3. Update the documentation and the profile

- `README.md` intro bullet (lines 15 to 20): reorder to "an Active section for live runs ... then a Queue section for the issues waiting in the project's queue ledger, in the order they will run, and a History section ...". Keep the following "Active is a React Query entry patched by Realtime; History ..." sentence.
- `README.md` lines 331 to 333: "passed to `ActiveRunsView` as its `queue` slot, which renders it after the Active section: the Queue sits below Active, and a failed queue read shows its panel in that slot while the header and Active stay up."
- `AGENTS.md` lines 110 to 117: "sits above Active" becomes "sits below Active"; "renders it between `PageHeader` and the Active section" becomes "renders it after the Active section"; all other words of the rule unchanged.
- `.adw/project.md` Review section: "(header, Active section, Queue section, History section)".
- Check no em-dash was introduced in any edited file.

### 4. Validate

- Run every command in `Validation Commands`, in order, and fix any failure without weakening a rule or test.
- Review phase evidence (no E2E suite exists, profile Tests says E2E `none`): screenshot `/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar lists if that slug is 404) full page at desktop 1920x1080 and mobile 375x667 into `agents/3729d1cf/<agent_name>/review_img/`, in light and dark colour scheme, and additionally at 360px wide, confirming header, Active, Queue, History top to bottom. Wait for the connection indicator to show `live` before judging. Confirm the sidebar counts, the History arrows and the search box behave as before.

## Test Coverage

No test needed: the change moves one JSX slot inside a client component, and the profile's only test layer is `src/**/*.test.ts` (pure reducers and `src/lib/` helpers); there is no component test layer and no Playwright suite, and inventing one is not allowed. The ordering is user-visible only, so its evidence is the review phase's screenshots at desktop, mobile and 360px in light and dark mode (step 4). No data, key, reducer or helper changes, so no existing test's behaviour changes either.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the changed component and page; catches JSX or import mistakes.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`; proves the slot props still type-check (do not stage the rewritten `next-env.d.ts`).
- `yarn knip` - dead-code check; proves no export became unused.
- `yarn format:check` - Prettier over all files, including the edited Markdown in `README.md`, `AGENTS.md` and `.adw/project.md`.
- `yarn test` - the vitest suite, including `src/lib/status-colors.test.ts`'s inline-hue scan, to prove zero regressions.
- `yarn build` - full Next build with `.env.local`; proves the prerender of every project page still succeeds with the reordered client view (no clock read, no new Suspense fallback in the shell).
- `grep -rn "above Active\|between the header and Active\|between \`PageHeader\`" src README.md AGENTS.md .adw/project.md` - must print nothing; proves the prose matches the new order.

## Notes

- Do not move the Queue section out of the `queue` slot into the page body after the `ActiveRunsView` boundary: that would render it in the browser-side not-found branch case and break the slot rule in `AGENTS.md`. Moving the slot within `ActiveRunsView` is the minimal, invariant-preserving change.
- The served HTML must still contain the run rows (an `adw_id` in a `<code>`) and the queue rows inline or as a streamed Suspense completion; nothing here adds a hook or a clock read, so the prerender behaviour is unchanged.
- Commit as `chore: ...` with no trailers (profile Documentation section).
