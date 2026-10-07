import { describe, expect, it } from "vitest";
import type { ProjectSummary, Run } from "@/types/adw";
import { activeRunCounts, activeRunsOf, groupActiveRuns } from "./active-runs";

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
    phase: "adw_build_iso",
    status,
    state: {},
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
