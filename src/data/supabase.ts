// The one Supabase client (browser and server). Every module that talks to
// Supabase gets it from getSupabase(); nothing else calls createClient.
//
// Both values are public by design. The publishable key is the browser-safe
// key: it carries no privileges of its own and Row Level Security limits what
// it can read to the public projects and their runs. It ships in the client
// bundle (the NEXT_PUBLIC_ prefix is what lets Next inline it there), so it is
// fine in .env.example and in the repository. The secret (service role) key is
// a different key, has no place in this dashboard and never enters this repo.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * The client type with the schema pinned to "adw". SupabaseClient's schema
 * generic defaults to "public", so the bare type would not accept the client
 * createClient returns for the adw schema.
 */
type AdwClient = SupabaseClient<any, "adw", "adw">;

let client: AdwClient | null = null;

/**
 * The fetch the server-side client uses for its REST calls: the global fetch
 * with `cache: "no-store"` forced on every request.
 *
 * On the server, `fetch` is Next's patched fetch. Every read in src/data runs
 * inside a "use cache" scope (getProjectsState, getRunsState, getHistory), and
 * per node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md
 * ("`fetch` cache options") fetches inside such a scope are cached
 * automatically: Next stores the response in its own data cache
 * (.next/cache/fetch-cache, kind "FETCH") with the scope's lifetime and NO
 * tags. That second cache is the defect this prevents: when revalidateHistory
 * calls updateTag("history:<slug>"), the "use cache" entry is expired and
 * getHistory re-executes, but the Supabase request inside it is answered from
 * the untagged FETCH entry, so the regenerated History is built from the stale
 * body (an empty list, if that is what the build saw) and the new row never
 * appears until the data cache's own 15 minutes elapse.
 *
 * `cache: "no-store"` is the documented opt-out (fetch.md, `options.cache`:
 * "Next.js fetches the resource from the remote server on every request"). It
 * is permitted inside a "use cache" scope: Next's patch-fetch treats a
 * revalidate-0 fetch there as markCurrentScopeAsDynamic, which is a no-op
 * inside a cache scope ("the outer cache scope creates a cache boundary",
 * dist/server/app-render/dynamic-rendering.js), so the scope's own output is
 * still cached and still tagged; only the inner request is no longer stored
 * separately. The "use cache" scope is therefore the one server cache, and
 * dropping its tag reaches the database.
 *
 * Browser fetch is not patched by Next and has no data cache, so the browser
 * client (Realtime, catch-up reads, queryFn misses) keeps the default fetch.
 */
const serverFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/**
 * Lazily builds the client on first use and returns the same instance after
 * that, so the page holds one websocket however many callers there are. Throws
 * when either variable is missing rather than connecting to nowhere silently.
 */
export function getSupabase(): AdwClient {
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required",
    );
  }
  client ??= createClient(url, key, {
    db: { schema: "adw" },
    ...(typeof window === "undefined" ? { global: { fetch: serverFetch } } : {}),
  });
  return client;
}
