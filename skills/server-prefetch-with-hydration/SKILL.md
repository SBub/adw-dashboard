---
name: server-prefetch-with-hydration
description: Render a React Query client component with its data already in the server HTML by prefetching on the server, dehydrating the cache and hydrating it under the same query key, so there is no loading state and no duplicate browser fetch.
when_to_use: When a Next.js App Router page (Server Components) shows data through a React Query client component that must be on screen at first paint, or when the page shows a spinner and then data, or the browser refetches what the server already rendered. Not for data the client never refetches, pages or mutates (render it in a Server Component instead), and not for per-user data inside a shared cache scope.
---

# Server prefetch with hydration

Fetch the data once, on the server, while the page renders. Hand the filled cache to the browser so the client component renders the data on its first render and never fetches it again on mount.

## Steps

1. Create one shared module that exports the query key, the fetcher and the `QueryClient` factory. Give the factory a dehydrate rule that also hands over pending queries. Import all three from this module everywhere; never build a key or a client by hand.
2. On the server, build a client from the factory, prefetch with `await queryClient.query({ queryKey, queryFn })` and call `dehydrate(queryClient)`. Do not use `prefetchQuery`: it is deprecated in current React Query v5. Under Cache Components, run this inside a `"use cache"` function, because `dehydrate` reads `Date.now()`.
3. Render `HydrationBoundary state={...}` below the client `QueryClientProvider`. The provider builds its one client from the same factory, with a lazy `useState` initialiser.
4. In the client component, call `useSuspenseQuery` with the same imported key and fetcher and `refetchOnMount: false`.
5. Verify: view the page source and find the data in the HTML, then reload with the network tab open and confirm there is no fetch for the key on load.

## Files

The four files below are a working app. Paste them into a Next.js project with `@tanstack/react-query` installed and open `/items`.

```ts title="app/items/query.ts"
import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";

export type Item = { id: number; name: string };

export const itemsKey = ["items"];

export async function fetchItems(): Promise<Item[]> {
  // Stands in for a database call on the server or an API call in the browser
  return [
    { id: 1, name: "Alpha" },
    { id: 2, name: "Bravo" },
  ];
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      dehydrate: {
        // Hand over a prefetch that is still pending, not only settled ones
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  });
}
```

```tsx title="app/items/page.tsx"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { Providers } from "../providers";
import { ItemList } from "./ItemList";
import { fetchItems, itemsKey, makeQueryClient } from "./query";

// dehydrate stamps the state with Date.now(); under Cache Components that
// read is only allowed inside a cache scope. The result is plain JSON.
async function getItemsState() {
  "use cache";
  const queryClient = makeQueryClient();
  await queryClient.query({ queryKey: itemsKey, queryFn: fetchItems });
  return dehydrate(queryClient);
}

export default async function Page() {
  const state = await getItemsState();

  return (
    <Providers>
      <HydrationBoundary state={state}>
        <Suspense fallback={<p>Loading</p>}>
          <ItemList />
        </Suspense>
      </HydrationBoundary>
    </Providers>
  );
}
```

```tsx title="app/providers.tsx"
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { makeQueryClient } from "./items/query";

export function Providers({ children }: { children: ReactNode }) {
  // The lazy initialiser keeps a re-render from building a second client
  const [queryClient] = useState(makeQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

```tsx title="app/items/ItemList.tsx"
"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { fetchItems, itemsKey } from "./query";

export function ItemList() {
  const { data } = useSuspenseQuery({
    queryKey: itemsKey,
    queryFn: fetchItems,
    // The hydrated data is stale on arrival; refetching it is the fetch we avoided
    refetchOnMount: false,
  });

  return (
    <ul>
      {data.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

The `await` settles the query before `dehydrate` runs, so the HTML holds the items. The Suspense fallback shows only when the server hands over a query that is still pending; the browser then picks up that promise instead of starting a second fetch.

## Mistakes

- **Inline or hand-built key.** Symptom: the list suspends and fetches in the browser on mount although the server prefetched; a key that differs by one element is a cache miss. Fix: import the one key from the shared module on both sides.
- **Mount refetch left on.** Symptom: the HTML holds the data and the browser fetches it again right after hydration, because the hydrated entry is older than `staleTime`. Fix: `refetchOnMount: false`.
- **Prefetch outside a cache scope under Cache Components.** Symptom: the prerender fails with `next-prerender-current-time`. Fix: move the prefetch and `dehydrate` into a `"use cache"` function.
- **Plain `useQuery` instead of the suspense variant.** Symptom: the list renders an empty pending state instead of waiting for a pending handover. Fix: `useSuspenseQuery` (or `useSuspenseInfiniteQuery`).
- **A second hand-built `QueryClient`.** Symptom: pending queries reach the browser from one page and not another, because the dehydrate rules drift. Fix: build every client from the one factory.
