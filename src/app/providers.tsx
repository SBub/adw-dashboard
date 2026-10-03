"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { makeQueryClient } from "@/data/query-client";
import { startRealtime } from "@/data/realtime";
import { revalidateHistory } from "./actions/revalidate-history";

/**
 * Holds the browser's one QueryClient for the whole session. It comes from the
 * same factory as the server's prefetch client, so both agree on the dehydrate
 * rule. HydrationBoundary writes into this client, so Providers must sit above
 * it in the tree.
 */
export function Providers({ children }: { children: ReactNode }) {
  // The lazy initialiser keeps a re-render from building a second client
  const [queryClient] = useState(makeQueryClient);
  const router = useRouter();

  // Start the Realtime channel once the provider is mounted in the browser.
  // startRealtime returns its closer, which is this effect's cleanup, so the
  // channel is removed when the provider unmounts. In development, React's
  // strict mode runs mount, cleanup, mount, so the indicator shows one
  // connect, close and reconnect; production connects once. The app router
  // instance is stable for the session, so listing it does not restart the
  // channel in practice.
  useEffect(
    () =>
      startRealtime(queryClient, {
        // A run completed (or a completed run was deleted). The listener has
        // already taken it out of the Active entry (step one of the move);
        // History is server-rendered and not in the cache, so: ask the server
        // to drop that project's history and active-prefetch tags (step two),
        // and only once that has resolved re-render the route (step three),
        // so the refreshed History is read from the database and holds the
        // new row. The order is what makes the refresh useful; the action
        // itself also ships a re-render in its response, the refresh is the
        // guarantee. On that refresh the Active HydrationBoundary receives a
        // dehydrated state again; React Query only overwrites an existing
        // entry when the incoming dataUpdatedAt is newer, see
        // src/data/hydration.test.ts, so the live entry is never set back.
        // A failed action (offline, a deploy in flight) is swallowed: History
        // is stale until the cache lifetime, and nothing else is affected.
        onHistoryChange: (slug) => {
          void revalidateHistory(slug)
            .then(() => router.refresh())
            .catch(() => {});
        },
      }),
    [queryClient, router],
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
