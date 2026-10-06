import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Partial prerendering: every route ships a static shell and anything that
  // reads request-time data (params for a slug not in generateStaticParams)
  // streams in behind a Suspense boundary.
  cacheComponents: true,
  // Pin the Turbopack root to this directory so a stray lockfile higher up
  // the filesystem is never mistaken for the project root.
  turbopack: {
    root: import.meta.dirname,
  },
  // Next 16 otherwise writes its own AGENTS.md and CLAUDE.md on every `next
  // dev`. This repo keeps those files by hand; see AGENTS.md.
  agentRules: false,
  // The summary moved from /summary to / (issue #83). Old links and bookmarks
  // keep working: Next passes the query string (`?days`, `?project`) through
  // to the destination, and `permanent` answers 308. No page under
  // src/app/summary/; see AGENTS.md.
  async redirects() {
    return [{ source: "/summary", destination: "/", permanent: true }];
  },
  // Keep a visited project page's dynamic part in the client router cache
  // for five minutes. The History islands are request-time holes (they await
  // searchParams), holes are not prefetched, and the router cache keeps
  // dynamic content for 0 seconds by default, so without this every sidebar
  // navigation, even back to a project seen seconds ago, is a server round
  // trip and a "Loading history..." flash. `static` stays at its default (it
  // also sets the `default` cacheLife profile's stale).
  //
  // Correctness within the window: when a run completes on the project on
  // screen, Providers calls revalidateHistory and then router.refresh(), which
  // re-renders that route from the server; the action's updateTag also clears
  // the whole client cache. A project not on screen is refetched on its next
  // visit once the window has passed, and its history tag has been dropped on
  // the server (action or webhook), so that refetch sees fresh rows. Keep this
  // at or under getHistory's cacheLife stale (300 s); see AGENTS.md.
  experimental: {
    staleTimes: {
      dynamic: 300,
    },
  },
};

export default nextConfig;
