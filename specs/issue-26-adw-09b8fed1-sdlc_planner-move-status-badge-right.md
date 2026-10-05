# Chore: Move the run status badge to the right edge of the row

## Metadata

issue_number: `26`
adw_id: `09b8fed1`
issue_json: `{"number":26,"title":"Move the run status badge to the right edge of the row","body":"## Context\n\nEach run row (`src/components/RunRow.tsx`, used for Active and History) starts its header line with the status badge (`StatusBadge`: running, failed, completed), followed by the issue number link, the issue class badge and the run id. The status reads better as a trailing marker aligned to the row's right edge.\n\n## What to build\n\n- In both the active and the history variant of `RunRow`, move the `StatusBadge`to the far right of the header line. The left group keeps its order: issue number link, issue class badge, run id, and the issue title once it exists (#25).\n- Implementation: the header line becomes a flex row with`justify-between`(or the left group with`flex-1 min-w-0`and the badge as the last child with`shrink-0 ml-auto`), so the badge stays right-aligned when the left group wraps on narrow screens rather than dropping below it.\n- No change to badge colours, labels, or to the detail grid below the header. No new components.\n\n## Acceptance\n\n- Active and History rows show the status badge at the right edge of the header line, vertically centred with the issue number.\n- On a 360px viewport the left group wraps while the badge remains right-aligned on the first line.\n- Light and dark mode unchanged otherwise.\n- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass.\n\n## Out of scope\n\nAny change to what the badge says or when it appears."}`

## Chore Description

`RunRow` (`src/components/RunRow.tsx`) renders one run for both the Active list (`variant="active"`,
via `ActiveRunsView`) and the History list (`variant="history"`, via `RunHistoryList`). Its header
line today is a single wrapping flex row:

```
<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
  <StatusBadge />  #issue-link | "no issue"  <IssueClassBadge />  <code>adw_id</code>
  {active only: <span className="ml-auto ...">Updated <Timestamp /></span>}
</div>
```

The status badge leads the line. The chore moves it to the trailing edge, in both variants, and makes
it stay on the first line at the right edge when the rest of the line wraps on a narrow viewport.

Target structure (one markup change in one file, no new component):

```
<div className="flex items-start justify-between gap-3">          // header line, does not wrap
  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">   // left group, wraps
    #issue-link | "no issue"  <IssueClassBadge />  <code>adw_id</code>
    {active only: <span className="ml-auto ...">Updated <Timestamp /></span>}
  </div>
  <div className="flex h-6 shrink-0 items-center">                  // badge slot, first line only
    <StatusBadge status={run.status} />
  </div>
</div>
```

Why this shape:

- The outer row does not wrap (`flex-wrap` moves to the left group), so the badge can never drop
  below; `shrink-0` keeps it from being squeezed, `min-w-0 flex-1` lets the left group take the
  remaining width and wrap inside it.
- `items-start` on the outer row pins the badge to the top (first line) of the left group instead of
  centring it on a multi-line group. The badge slot is `h-6` (24px), the line box of the issue link
  (inherited `text-base`, Tailwind v4 line height 1.5rem), and centres the badge inside it, so the
  badge is vertically centred with the issue number on the first line whether or not the group wraps.
- The active variant's `Updated <Timestamp>` stays where it is, as the last child of the left group
  with `ml-auto`: on a wide row it sits right-aligned just before the badge; when the group wraps it
  goes to its own line, right-aligned within the group. Its text, `Timestamp` usage and the "no clock
  read" rule are unchanged. The issue title from #25 (still open) will slot into the left group after
  the run id; nothing to do for it here.

Out of scope and unchanged: `StatusBadge` itself (colours, labels, the running pulse),
`IssueClassBadge`, the `<dl>` detail grid, `RunHistoryList`, `ActiveRunsView`, any data or query code.

## Relevant Files

Use these files to resolve the chore:

- `src/components/RunRow.tsx` - The only file that changes. Holds the header line whose children are
  reordered and regrouped as above; the doc comment above `RunRow` does not mention the badge position
  and needs no edit.
- `src/components/StatusBadge.tsx` - Read only. `inline-flex ... px-2 py-0.5 text-xs` pill (about 20px
  tall); confirms it fits the `h-6` slot and that nothing in it changes.
- `src/components/IssueClassBadge.tsx` - Read only. Returns `null` without an issue class; the left
  group must still render correctly when it is absent.
- `src/components/RunHistoryList.tsx`, `src/components/ActiveRunsView.tsx` - Read only. The two callers
  (`variant="history"` and `variant="active"`); props unchanged, so neither needs an edit.
- `AGENTS.md` - Components take typed props only and render what they are given; server components by
  default (`RunRow` has no `"use client"` and must not get one); no clock read in render; no em-dashes.
- `README.md` - Section "Prefetch and hydration of a project's runs" mentions `RunRow` variants but not
  the badge position; checked, no edit needed.
- `.adw/project.md` - Tests (one test layer, `src/**/*.test.ts`, no component tests, E2E `none`),
  Review (paths and viewports to screenshot), Protected.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Restructure the header line in `src/components/RunRow.tsx`

- Change the existing header `<div className="flex flex-wrap items-center gap-x-3 gap-y-2">` to
  `<div className="flex items-start justify-between gap-3">`.
- Inside it, add the left group `<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">`
  and move into it, in this order and with their current markup and classes untouched: the issue link /
  `no issue` span, `<IssueClassBadge issueClass={run.issue_class} />`, the `adw_id` `<code>`, and the
  active-only `Updated <Timestamp value={run.updated_at} />` span (keep its `ml-auto`).
- Remove `<StatusBadge status={run.status} />` from the front and render it as the last child of the
  header row, wrapped in `<div className="flex h-6 shrink-0 items-center">`.
- Do not touch the `<dl>` grid, `Field`, `Mono`, the props, imports (all still used) or the doc comment.

### 2. Format and static checks

- Run `yarn format` so Prettier settles the JSX, then `yarn lint` and `yarn typecheck`.

### 3. Visual check (review phase evidence)

- No dev server is started by this plan for its own sake; the review phase captures per the profile's
  Review section: `/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar lists if
  that slug is 404) at desktop 1920x1080 and mobile 375x667, full page, light mode, plus one dark-mode
  capture of the same page. In addition, resize to 360px wide and confirm in a Active row and a History
  row that the left group wraps while the status badge stays on the first line at the right edge,
  vertically centred with the issue number. Wait for the connection indicator to read `live` first.

### 4. Run the Validation Commands

- Run every command below from the worktree root and confirm each passes.

## Test Coverage

No test needed: the change is a pure layout move inside one presentational component (markup order and
Tailwind classes), with no logic, data or helper touched. The profile's only test layer is
`src/**/*.test.ts` for pure reducers and `src/lib/` helpers; there is no component test layer and E2E
is `none`, so the evidence is the review phase's screenshots at desktop, mobile and 360px width.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the edited component; the commit hook runs it too.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`; confirms the JSX still type-checks (do not stage the rewritten `next-env.d.ts`).
- `yarn knip` - no unused export or import left behind (all of `RunRow`'s imports stay in use).
- `yarn format:check` - Prettier agrees with the reflowed JSX.
- `yarn test` - the existing unit suite stays green (no test touches this component, this is a regression guard).
- `yarn build` - the prerender still produces the project pages with run rows in the HTML (needs `.env.local`).

## Notes

- Issue #25 (show the issue title on run rows) is open; when it lands, the title goes into the left
  group after the `adw_id` `<code>`, which this structure already accommodates (`min-w-0` lets a
  `truncate` title shrink).
- Keep `RunRow` a server component; no `"use client"`, no hook, no clock read.
- Commit as `chore: move run status badge to the right edge of the row`, no trailers.
