# Error and loading boundaries

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md
- specs/issue-164-adw-cf1087b2-sdlc_planner-hire-me-page-contact-form.md

## Overview

The two error boundaries, `QueryBoundary` for React Query sections and `SectionBoundary` for server-rendered islands, and the skeleton loading fallbacks in `src/components/LoadingSkeletons.tsx`.

## How it works

### QueryBoundary

`src/components/QueryBoundary.tsx` is how every suspended query is wrapped: a
`Suspense` boundary for the pending state inside a `react-error-boundary`
`ErrorBoundary` for the failed one. `useSuspenseQuery` throws a failed fetch to
the nearest error boundary, and React Query keeps that error on the query. A
plain error boundary reset would re-mount the child, which reads the same
errored query and throws again, so Retry would loop. `QueryBoundary` takes
`reset` from `useQueryErrorResetBoundary()` and passes it as the boundary's
`onReset`, so Retry resets the query error state and the next render
refetches. It renders a default panel ("Could not load.", an optional `detail`
line, a Retry button) or whatever `errorFallback(retry)` returns. It renders
inside `Providers`, where the query it guards has its client. The layout wraps
`ProjectNav` in it and the project page wraps `ActiveRunsView` in it.

### SectionBoundary

`src/components/SectionBoundary.tsx` is the second boundary, for a
server-rendered section that is not a query: the same shape (a `Suspense` for
the streaming state inside a `react-error-boundary` `ErrorBoundary` for the
failed one, the same default panel from `src/components/ErrorPanel.tsx`), but
a different Retry. The section it wraps is an async server component whose
render already happened on the server, so there is no query error to reset
(`useQueryErrorResetBoundary` is not used) and a local boundary reset alone
would only re-mount the same failed output. Retry calls `router.refresh()`
first, which asks the server to render the route again (the section's cache
scope is read again and, on a miss, the database), and then resets the
boundary, so the re-mounted child is the fresh server result streaming in
behind the fallback. The project page wraps `HistorySearchBox`,
`HistoryPagination` and `CompletedRuns` each in one, and `/hire` wraps
`HireStatus` (the status and the form, fallback "Loading form..."); the hole semantics come from their `searchParams`
read and are unchanged by the boundary, since a server component is a
legitimate child of a client boundary and the Suspense inside is still the
streaming boundary the shell carries the fallback for.

Which one to use: a `useSuspenseQuery` goes in `QueryBoundary`; a
server-rendered section that can fail independently goes in
`SectionBoundary`; neither is ever rendered under a bare `Suspense`.

## Rules

- Two boundaries, never a bare `Suspense`. Any `useSuspenseQuery` is rendered
  inside `QueryBoundary` (`src/components/QueryBoundary.tsx`); any
  server-rendered section that can fail independently of its siblings (the
  page's `HistoryPagination` and `CompletedRuns`, and the three Active
  islands `SidebarActiveRuns`, `AllActiveRuns` and `ProjectActiveRuns`, and
  `HireStatus` on `/hire`, one boundary each) is
  rendered inside `SectionBoundary`
  (`src/components/SectionBoundary.tsx`). Without an error boundary a failed
  read escapes to the segment's `error.tsx` and unmounts the whole pane,
  Active included. The two differ in their Retry and must not be swapped:
  `QueryBoundary` passes `reset` from `useQueryErrorResetBoundary` as
  `onReset`, or Retry re-reads the cached query error; `SectionBoundary` does
  not use `useQueryErrorResetBoundary` (its child is not in the query cache,
  there is nothing to reset) and instead calls `router.refresh()` and then
  `resetErrorBoundary()`, in that order, so the re-mounted server component
  is a fresh server render, not a replay of the failed one. Both share the
  panel in `src/components/ErrorPanel.tsx`. `QueryBoundary` sits inside
  `Providers`, where the query it guards has its client. The one exception
  is `HeaderLink`'s `usePathname` reads in `SectionNav.tsx` (the brand,
  Projects and Hire me links), each in a plain `Suspense`: they read no data
  and cannot fail, they only suspend during prerender on a project page
  outside `generateStaticParams`. Each fallback is the same link inactive
  (for Hire me, the button without `aria-current`), never a spinner or an
  empty node. No other
  `Suspense` may be bare.
- Every loading fallback on the projects side (the sidebar, `/projects`,
  the project page and its `loading.tsx`) is a skeleton from
  `src/components/LoadingSkeletons.tsx`, built on the one `Skeleton`
  primitive in `src/components/Skeleton.tsx` (a neutral surface,
  `motion-safe:animate-pulse` so reduced motion gets static blocks, always
  `aria-hidden`), inside a `role="status"` container with `aria-busy="true"`
  and an `aria-label`; never a "Loading..." line, a spinner or `null`. No
  other element takes the pulse class for a placeholder. A skeleton mirrors
  its component's box classes (border, radius, padding, gaps) and line
  count, with each text line a bar as tall as its line box, and changes in
  the same commit as that component; `src/components/LoadingSkeletons.test.ts`
  pins the row and field counts, the labels and the reduced-motion rule.
  Nested boundaries around the same component (the outer `SectionBoundary`
  and the inner `QueryBoundary`) take the same element, never two stacked.
  The project page's Active fallback carries the real Active and Queue
  headings (the page builds them before the boundary), so they are in the
  static shell. `HistorySearchFallback` stays the real box, disabled, not a
  skeleton, and the error panels are unchanged. The summary page (`/`) and
  `HeaderLink`'s fallback are not part of this rule.
