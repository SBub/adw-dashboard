"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { makeQueryClient } from "@/data/projects-query";
import { startRealtime } from "@/data/realtime";

/**
 * Holds the browser's one QueryClient for the whole session. It comes from the
 * same factory as the server's prefetch client, so both agree on the dehydrate
 * rule. HydrationBoundary writes into this client, so Providers must sit above
 * it in the tree.
 */
export function Providers({ children }: { children: ReactNode }) {
  // The lazy initialiser keeps a re-render from building a second client
  const [queryClient] = useState(makeQueryClient);

  // Start the Realtime channel once the provider is mounted in the browser.
  // startRealtime returns its closer, which is this effect's cleanup, so the
  // channel is removed when the provider unmounts. In development, React's
  // strict mode runs mount, cleanup, mount, so the indicator shows one
  // connect, close and reconnect; production connects once.
  useEffect(() => startRealtime(queryClient), [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
