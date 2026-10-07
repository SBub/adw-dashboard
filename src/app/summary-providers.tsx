"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { makeQueryClient } from "@/data/query-client";

/**
 * The summary page's (`/`) QueryClient, mounted only around the today island
 * (TodaySummary), so its HydrationBoundary and Refresh refetch have a client.
 * Not Providers: that one opens the Realtime channel and belongs to the
 * dashboard layout, and `/` stays off the channel (#70). So nothing else is
 * here: no Realtime, no router, no ConnectionIndicator.
 */
export function SummaryProviders({ children }: { children: ReactNode }) {
  // The lazy initialiser keeps a re-render from building a second client
  const [queryClient] = useState(makeQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
