// Pins the React Query hydration rule the run move relies on. After a
// completion the browser removes the run from the Active entry with
// setQueryData, asks the server to drop the project's cache tags, and calls
// router.refresh(); the page's HydrationBoundary then hands the client a
// dehydrated Active state a second time. These tests document, against the
// installed @tanstack/query-core, what hydrate() does when the entry already
// exists: it overwrites only when the incoming dataUpdatedAt is newer than the
// entry's, and otherwise leaves the client's value alone. So a refresh can
// never set a live entry back to an older server snapshot, and when the
// server's snapshot is newer (the refill that follows the tag drop) it is also
// read after the completion, so both sides agree on the rows.
import { dehydrate, hydrate } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { makeQueryClient } from "./query-client";
import { queryKeys } from "./query-keys";

const key = queryKeys.runs("owner/repo");

/** A dehydrated state holding `data` under the runs key, stamped `dataUpdatedAt`. */
async function serverState(data: string[], dataUpdatedAt: number) {
  const server = makeQueryClient();
  await server.query({ queryKey: key, queryFn: () => data });
  server.setQueryData(key, data, { updatedAt: dataUpdatedAt });
  return dehydrate(server);
}

describe("hydrate into an existing entry", () => {
  it("leaves the client's value when the incoming dataUpdatedAt is older", async () => {
    const client = makeQueryClient();
    client.setQueryData(key, ["live"], { updatedAt: 2_000 });

    hydrate(client, await serverState(["stale"], 1_000));

    expect(client.getQueryData(key)).toEqual(["live"]);
    expect(client.getQueryState(key)?.dataUpdatedAt).toBe(2_000);
  });

  it("leaves the client's value when the incoming dataUpdatedAt is equal", async () => {
    const client = makeQueryClient();
    client.setQueryData(key, ["live"], { updatedAt: 2_000 });

    hydrate(client, await serverState(["same-instant"], 2_000));

    expect(client.getQueryData(key)).toEqual(["live"]);
  });

  it("overwrites the client's value when the incoming dataUpdatedAt is newer", async () => {
    const client = makeQueryClient();
    client.setQueryData(key, ["live"], { updatedAt: 2_000 });

    hydrate(client, await serverState(["refilled"], 3_000));

    expect(client.getQueryData(key)).toEqual(["refilled"]);
    expect(client.getQueryState(key)?.dataUpdatedAt).toBe(3_000);
  });

  it("fills an absent entry whatever its stamp", async () => {
    const client = makeQueryClient();

    hydrate(client, await serverState(["first"], 1));

    expect(client.getQueryData(key)).toEqual(["first"]);
  });
});
