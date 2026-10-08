# Conditional docs

One line per feature doc in `app_docs/`, saying when to read it; read the lines whose situation matches your task.

- `app_docs/screens-and-components.md`: read when changing a component's props, a row's layout, a run row's phase label, the History card's fields, its branch link or its pull request link, a section heading, a colour, a timestamp's format, the page background, the sticky header, its z-index layer or the sidebar's sticky offset; when adding or removing `"use client"`.
- `app_docs/routing-and-navigation.md`: read when changing the route tree, the header's links or their current-section marking; when touching a project page's not-found decision, `generateStaticParams` or the `/summary` redirect.
- `app_docs/types.md`: read when changing `src/types/adw.ts`; when a database column is added, renamed or removed.
- `app_docs/data-boundary.md`: read when changing `src/data/index.ts`, a query key, the query client or a server prefetch; when adding a database read or an environment variable.
- `app_docs/clock-and-prerender.md`: read when adding a time-dependent label or any `Date.now()`/`new Date()`; when a component ships as its Suspense fallback in the served HTML.
- `app_docs/active-runs.md`: read when changing the Active entry, `getActiveRunsState`, `activeRunsQuery`, the three Active islands or the helpers in `src/lib/active-runs.ts`; when the sidebar's counts disagree with a project's Active section.
- `app_docs/project-page.md`: read when changing the project page's Active, Queue or History sections; when touching History's paging, its bookmark or its `?q` search.
- `app_docs/history-revalidation.md`: read when changing the `revalidateHistory` action, the `/api/revalidate` handler, a cache tag, `cacheLife` or `staleTimes`; when a completed run does not appear in History.
- `app_docs/error-and-loading-boundaries.md`: read when adding a `Suspense`, a `QueryBoundary`, a `SectionBoundary` or a loading fallback; when a failed read takes down more than its own section.
- `app_docs/realtime.md`: read when changing the `adw` channel, a Realtime reducer, the catch-up read or the connection pill; when a live update does not reach the screen.
- `app_docs/summary.md`: read when changing `/`, its charts, its today card or its cache scopes; when a day's totals look wrong.
