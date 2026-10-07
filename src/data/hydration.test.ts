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
//
// The Active entry is read per request on the server and hydrated by every
// island that reads it, so the same applies to an event the browser applied
// before a later hydration (issue #69): a run the listener inserted survives
// an older server snapshot.
import { dehydrate, hydrate } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Run } from "@/types/adw";
import { applyRunChange, type RunChange } from "./apply-run-change";
import type { ActiveRuns } from "./index";
import { makeQueryClient } from "./query-client";
import { queryKeys } from "./query-keys";

const key = queryKeys.activeRuns;

/** A dehydrated state holding `data` under the Active key, stamped `dataUpdatedAt`. */
async function serverState<T>(data: T, dataUpdatedAt: number) {
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

  it("keeps a run the listener inserted when an older server snapshot arrives (#69)", async () => {
    const client = makeQueryClient();
    const empty: ActiveRuns = { active: [], fetched_at: "2026-10-02T11:00:00Z" };
    client.setQueryData(key, empty, { updatedAt: 2_000 });

    const started: Run = {
      project_id: "11111111-1111-1111-1111-111111111111",
      adw_id: "aaaa",
      issue_number: 1,
      issue_title: null,
      issue_class: "/feature",
      branch_name: "feat/aaaa",
      phase: "adw_plan_iso",
      status: "running",
      state: {},
      toolkit_version: "0.9.3",
      started_at: "2026-10-02T11:05:00Z",
      updated_at: "2026-10-02T11:05:00Z",
      finished_at: null,
    };
    const insert: RunChange = {
      schema: "adw",
      table: "runs",
      commit_timestamp: "2026-10-02T11:05:00Z",
      errors: [],
      eventType: "INSERT",
      new: started,
      old: {},
    };
    client.setQueryData<ActiveRuns>(key, (current) => current && applyRunChange(current, insert));
    expect(client.getQueryState(key)?.dataUpdatedAt).toBeGreaterThan(2_000);

    hydrate(client, await serverState(empty, 1_500));

    expect(client.getQueryData<ActiveRuns>(key)?.active.map((run) => run.adw_id)).toEqual(["aaaa"]);
  });
});
