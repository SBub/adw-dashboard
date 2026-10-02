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
};

export default nextConfig;
