import { describe, expect, it } from "vitest";
import type { ProjectSummary, Run } from "@/types/adw";
import {
  activeRunCounts,
  activeRunsOf,
  CATCH_UP_OVERLAP_MS,
  changedRunsSince,
  FAILED_RUN_WINDOW_DAYS,
  failedRunCutoff,
  groupActiveRuns,
  isInActiveWindow,
  latestUpdatedAt,
} from "./active-runs";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";

function run(projectId: string, adwId: string, status: Run["status"] = "running"): Run {
  return {
    project_id: projectId,
    adw_id: adwId,
    issue_number: 1,
    issue_title: null,
    issue_class: "/feature",
    branch_name: `feat/${adwId}`,
    pr_number: null,
    phase: "adw_build_iso",
    status,
    toolkit_version: "0.9.3",
    started_at: "2026-10-02T10:00:00Z",
    updated_at: "2026-10-02T10:30:00Z",
    finished_at: null,
  };
}

function project(id: string): ProjectSummary {
  return {
    id,
    slug: `owner/${id.slice(0, 4)}`,
    display_name: id.slice(0, 4),
    repo_url: null,
    is_public: true,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    last_run_at: null,
  };
}

const ids = (list: Run[]) => list.map((r) => `${r.project_id.slice(0, 1)}:${r.adw_id}`);

const runs = [
  run(A, "aaaa"),
  run(B, "bbbb", "failed"),
  run(A, "cccc", "failed"),
  run(B, "aaaa"),
  run(A, "dddd"),
];

describe("activeRunsOf", () => {
  it("keeps only the project's rows, in the entry's order", () => {
    expect(ids(activeRunsOf(runs, A))).toEqual(["1:aaaa", "1:cccc", "1:dddd"]);
    expect(ids(activeRunsOf(runs, B))).toEqual(["2:bbbb", "2:aaaa"]);
  });

  it("is empty for a project with no active run", () => {
    expect(activeRunsOf(runs, C)).toEqual([]);
  });
});

describe("activeRunCounts", () => {
  it("counts running and failed per project", () => {
    const counts = activeRunCounts(runs);

    expect(counts.get(A)).toEqual({ running: 2, failed: 1 });
    expect(counts.get(B)).toEqual({ running: 1, failed: 1 });
  });

  it("has no entry for a project without active runs", () => {
    expect(activeRunCounts(runs).has(C)).toBe(false);
    expect(activeRunCounts([]).size).toBe(0);
  });
});

describe("groupActiveRuns", () => {
  it("orders the groups by the project list and omits projects without runs", () => {
    const groups = groupActiveRuns(runs, [project(C), project(B), project(A)]);

    expect(groups.map((g) => g.project.id)).toEqual([B, A]);
    expect(ids(groups[0]?.runs ?? [])).toEqual(["2:bbbb", "2:aaaa"]);
    expect(ids(groups[1]?.runs ?? [])).toEqual(["1:aaaa", "1:cccc", "1:dddd"]);
  });

  it("drops the runs of a project that is not in the list", () => {
    const groups = groupActiveRuns(runs, [project(A)]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.project.id).toBe(A);
  });

  it("is empty when there are no active runs", () => {
    expect(groupActiveRuns([], [project(A), project(B)])).toEqual([]);
  });
});

describe("failedRunCutoff", () => {
  it("is exactly 7 days before the given time, as ISO", () => {
    expect(FAILED_RUN_WINDOW_DAYS).toBe(7);
    expect(failedRunCutoff(Date.parse("2026-10-27T12:00:00.000Z"))).toBe(
      "2026-10-20T12:00:00.000Z",
    );
  });
});

describe("isInActiveWindow", () => {
  const cutoff = "2026-10-20T12:00:00.000Z";

  it("keeps a running run however old", () => {
    expect(
      isInActiveWindow({ status: "running", updated_at: "2020-01-01T00:00:00Z" }, cutoff),
    ).toBe(true);
  });

  it("keeps a failed run at the cutoff and drops one a millisecond before", () => {
    expect(isInActiveWindow({ status: "failed", updated_at: cutoff }, cutoff)).toBe(true);
    expect(
      isInActiveWindow({ status: "failed", updated_at: "2026-10-20T11:59:59.999Z" }, cutoff),
    ).toBe(false);
  });

  it("compares by instant, not by string", () => {
    // The same instant as the cutoff plus a microsecond, in Postgres's format.
    expect(
      isInActiveWindow(
        { status: "failed", updated_at: "2026-10-20 12:00:00.000001+00:00" },
        cutoff,
      ),
    ).toBe(true);
    expect(
      isInActiveWindow({ status: "failed", updated_at: "2026-10-20T13:00:00+01:00" }, cutoff),
    ).toBe(true);
    expect(
      isInActiveWindow({ status: "failed", updated_at: "2026-10-20T12:59:59+01:00" }, cutoff),
    ).toBe(false);
  });

  it("drops a completed run", () => {
    expect(
      isInActiveWindow({ status: "completed", updated_at: "2026-10-27T00:00:00Z" }, cutoff),
    ).toBe(false);
  });
});

describe("changedRunsSince", () => {
  it("subtracts the 60 s overlap", () => {
    expect(CATCH_UP_OVERLAP_MS).toBe(60_000);
    expect(changedRunsSince("2026-10-27T12:00:30.500+00:00")).toBe("2026-10-27T11:59:30.500Z");
  });
});

describe("latestUpdatedAt", () => {
  it("picks the latest by instant and returns the original string", () => {
    const rows = [
      { updated_at: "2026-10-27T12:00:00Z" },
      { updated_at: "2026-10-27T13:10:00+01:00" },
      { updated_at: "2026-10-27 12:15:00.123456+00:00" },
    ];
    expect(latestUpdatedAt(rows, null)).toBe("2026-10-27 12:15:00.123456+00:00");
  });

  it("keeps seen when no row is later", () => {
    const seen = "2026-10-27T13:00:00Z";
    expect(latestUpdatedAt([{ updated_at: "2026-10-27T12:00:00Z" }], seen)).toBe(seen);
    expect(latestUpdatedAt([], seen)).toBe(seen);
  });

  it("moves forward to a later row", () => {
    expect(latestUpdatedAt([{ updated_at: "2026-10-27T14:00:00Z" }], "2026-10-27T13:00:00Z")).toBe(
      "2026-10-27T14:00:00Z",
    );
  });

  it("is null for no rows and no seen", () => {
    expect(latestUpdatedAt([], null)).toBeNull();
  });
});
