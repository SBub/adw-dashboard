// The one Supabase browser client. Every module that talks to Supabase gets it
// from getSupabase(); nothing else calls createClient.
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
  client ??= createClient(url, key, { db: { schema: "adw" } });
  return client;
}
