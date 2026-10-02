"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { makeQueryClient } from "@/data/projects-query";

/**
 * Holds the browser's one QueryClient for the whole session. It comes from the
 * same factory as the server's prefetch client, so both agree on the dehydrate
 * rule. HydrationBoundary writes into this client, so Providers must sit above
 * it in the tree.
 */
export function Providers({ children }: { children: ReactNode }) {
  // The lazy initialiser keeps a re-render from building a second client
  const [queryClient] = useState(makeQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
