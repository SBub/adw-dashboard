import { describe, expect, it } from "vitest";
import type { ProjectSummary, Run } from "@/types/adw";
import {
  applyRunChange,
  applyRunChangeToSummaries,
  type RunChange,
  runStatusIn,
} from "./apply-run-change";
import type { ProjectRuns } from "./index";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const OTHER_PROJECT = "22222222-2222-2222-2222-222222222222";

function run(adwId: string, overrides: Partial<Run> = {}): Run {
  return {
    project_id: PROJECT,
    adw_id: adwId,
    issue_number: 1,
    issue_class: "/feature",
    branch_name: `feat/${adwId}`,
    phase: "adw_build_iso",
    status: "running",
    state: {},
    toolkit_version: "0.9.3",
    started_at: "2026-10-02T10:00:00Z",
    updated_at: "2026-10-02T10:30:00Z",
    finished_at: null,
    ...overrides,
  };
}

function finished(adwId: string, status: "completed" | "failed", updatedAt: string): Run {
  return run(adwId, {
    status,
    phase: "adw_document_iso",
    updated_at: updatedAt,
    finished_at: updatedAt,
  });
}

function summary(id: string, overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id,
    slug: `owner/${id.slice(0, 4)}`,
    display_name: id.slice(0, 4),
    repo_url: null,
    is_public: true,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    running: 1,
    completed: 2,
    failed: 3,
    last_run_at: "2026-10-02T10:30:00Z",
    ...overrides,
  };
}

function runs(active: Run[], history: Run[]): ProjectRuns {
  return { project: summary(PROJECT), active, history, fetched_at: "2026-10-02T11:00:00Z" };
}

const base = {
  schema: "adw",
  table: "runs",
  commit_timestamp: "2026-10-03T00:00:00Z",
  errors: [] as string[],
};

function insert(record: Run): RunChange {
  return { ...base, eventType: "INSERT", new: record, old: {} };
}

// Default replica identity: `old` carries the primary key columns only
function update(record: Run): RunChange {
  return {
    ...base,
    eventType: "UPDATE",
    new: record,
    old: { project_id: record.project_id, adw_id: record.adw_id },
  };
}

function remove(adwId: string, projectId = PROJECT): RunChange {
  return { ...base, eventType: "DELETE", new: {}, old: { project_id: projectId, adw_id: adwId } };
}

const ids = (list: Run[]) => list.map((r) => r.adw_id);

describe("runStatusIn", () => {
  const current = runs([run("aaaa")], [finished("bbbb", "failed", "2026-10-02T09:00:00Z")]);

  it("finds a run in either list", () => {
    expect(runStatusIn(current, "aaaa")).toBe("running");
    expect(runStatusIn(current, "bbbb")).toBe("failed");
  });

  it("is undefined for an unknown run, a null entry and an absent entry", () => {
    expect(runStatusIn(current, "zzzz")).toBeUndefined();
    expect(runStatusIn(null, "aaaa")).toBeUndefined();
    expect(runStatusIn(undefined, "aaaa")).toBeUndefined();
  });
});

describe("applyRunChange", () => {
  describe("INSERT", () => {
    it("prepends a running run to active and leaves history alone", () => {
      const current = runs([run("aaaa")], [finished("bbbb", "completed", "2026-10-02T09:00:00Z")]);
      const next = applyRunChange(current, insert(run("cccc")));

      expect(ids(next.active)).toEqual(["cccc", "aaaa"]);
      expect(next.history).toBe(current.history);
      expect(ids(current.active)).toEqual(["aaaa"]);
    });

    it("prepends a finished run to history", () => {
      const current = runs([run("aaaa")], [finished("bbbb", "completed", "2026-10-02T09:00:00Z")]);
      const next = applyRunChange(
        current,
        insert(finished("cccc", "failed", "2026-10-02T12:00:00Z")),
      );

      expect(ids(next.history)).toEqual(["cccc", "bbbb"]);
      expect(next.active).toBe(current.active);
    });

    it("ignores an insert whose adw_id is already in active or history", () => {
      const current = runs([run("aaaa")], [finished("bbbb", "completed", "2026-10-02T09:00:00Z")]);

      expect(applyRunChange(current, insert(run("aaaa")))).toBe(current);
      expect(applyRunChange(current, insert(run("bbbb")))).toBe(current);
    });

    it("keeps project and fetched_at untouched", () => {
      const current = runs([], []);
      const next = applyRunChange(current, insert(run("aaaa")));

      expect(next.project).toBe(current.project);
      expect(next.fetched_at).toBe("2026-10-02T11:00:00Z");
    });
  });

  describe("UPDATE", () => {
    it("replaces a running run in place when its status did not change", () => {
      const current = runs([run("aaaa"), run("bbbb"), run("cccc")], []);
      const next = applyRunChange(
        current,
        update(run("bbbb", { phase: "adw_test_iso", updated_at: "2026-10-02T10:45:00Z" })),
      );

      expect(ids(next.active)).toEqual(["aaaa", "bbbb", "cccc"]);
      expect(next.active[1]).toMatchObject({
        phase: "adw_test_iso",
        updated_at: "2026-10-02T10:45:00Z",
      });
      expect(next.history).toBe(current.history);
    });

    it("moves a run from active to the top of history when it finishes", () => {
      const current = runs(
        [run("aaaa"), run("bbbb")],
        [finished("cccc", "completed", "2026-10-02T09:00:00Z")],
      );
      const done = finished("aaaa", "completed", "2026-10-02T10:50:00Z");
      const next = applyRunChange(current, update(done));

      expect(ids(next.active)).toEqual(["bbbb"]);
      expect(ids(next.history)).toEqual(["aaaa", "cccc"]);
      expect(next.history[0]).toEqual(done);
    });

    it("moves a run from active to history when it fails", () => {
      const current = runs([run("aaaa")], []);
      const next = applyRunChange(
        current,
        update(finished("aaaa", "failed", "2026-10-02T10:50:00Z")),
      );

      expect(next.active).toEqual([]);
      expect(ids(next.history)).toEqual(["aaaa"]);
    });

    it("moves a run back to active when it is set to running again", () => {
      const current = runs(
        [run("bbbb")],
        [
          finished("aaaa", "failed", "2026-10-02T09:00:00Z"),
          finished("cccc", "completed", "2026-10-02T08:00:00Z"),
        ],
      );
      const next = applyRunChange(
        current,
        update(run("aaaa", { updated_at: "2026-10-02T11:00:00Z" })),
      );

      expect(ids(next.active)).toEqual(["aaaa", "bbbb"]);
      expect(ids(next.history)).toEqual(["cccc"]);
    });

    it("replaces a finished run in place when it changes within history", () => {
      const current = runs(
        [],
        [
          finished("aaaa", "failed", "2026-10-02T09:00:00Z"),
          finished("bbbb", "completed", "2026-10-02T08:00:00Z"),
        ],
      );
      const next = applyRunChange(
        current,
        update(finished("bbbb", "failed", "2026-10-02T08:05:00Z")),
      );

      expect(ids(next.history)).toEqual(["aaaa", "bbbb"]);
      expect(next.history[1]?.status).toBe("failed");
    });

    it("adds a run that is in neither list, as an insert would", () => {
      const current = runs([run("aaaa")], []);
      const next = applyRunChange(current, update(run("zzzz")));

      expect(ids(next.active)).toEqual(["zzzz", "aaaa"]);
    });

    it("does not mutate the input", () => {
      const current = runs([run("aaaa")], []);
      applyRunChange(current, update(finished("aaaa", "completed", "2026-10-02T10:50:00Z")));

      expect(ids(current.active)).toEqual(["aaaa"]);
      expect(current.history).toEqual([]);
    });
  });

  describe("DELETE", () => {
    it("removes the run from active by the adw_id in old", () => {
      const current = runs([run("aaaa"), run("bbbb")], []);
      const next = applyRunChange(current, remove("aaaa"));

      expect(ids(next.active)).toEqual(["bbbb"]);
    });

    it("removes the run from history by the adw_id in old", () => {
      const current = runs([], [finished("aaaa", "completed", "2026-10-02T09:00:00Z")]);
      const next = applyRunChange(current, remove("aaaa"));

      expect(next.history).toEqual([]);
      expect(next.fetched_at).toBe(current.fetched_at);
    });

    it("returns the input for an unknown adw_id or a delete without one", () => {
      const current = runs([run("aaaa")], []);

      expect(applyRunChange(current, remove("zzzz"))).toBe(current);
      expect(applyRunChange(current, { ...base, eventType: "DELETE", new: {}, old: {} })).toBe(
        current,
      );
    });
  });
});

// The function reference, not its name as a string: the lint no-secrets rule
// flags the bare name as a high-entropy literal.
describe(applyRunChangeToSummaries, () => {
  const list = () => [summary(PROJECT), summary(OTHER_PROJECT, { last_run_at: null })];

  it("counts an inserted running run and moves last_run_at forward", () => {
    const next = applyRunChangeToSummaries(
      list(),
      insert(run("aaaa", { updated_at: "2026-10-02T12:00:00Z" })),
      undefined,
    );

    expect(next[0]).toMatchObject({
      running: 2,
      completed: 2,
      failed: 3,
      last_run_at: "2026-10-02T12:00:00Z",
    });
  });

  it("counts an inserted finished run under its status", () => {
    const next = applyRunChangeToSummaries(
      list(),
      insert(finished("aaaa", "failed", "2026-10-02T12:00:00Z")),
      undefined,
    );

    expect(next[0]).toMatchObject({ running: 1, completed: 2, failed: 4 });
  });

  it("moves one from the old status to the new one on an update", () => {
    const next = applyRunChangeToSummaries(
      list(),
      update(finished("aaaa", "completed", "2026-10-02T12:00:00Z")),
      "running",
    );

    expect(next[0]).toMatchObject({
      running: 0,
      completed: 3,
      failed: 3,
      last_run_at: "2026-10-02T12:00:00Z",
    });
  });

  it("leaves the counts alone on an update whose status did not change", () => {
    const next = applyRunChangeToSummaries(
      list(),
      update(run("aaaa", { updated_at: "2026-10-02T12:00:00Z" })),
      "running",
    );

    expect(next[0]).toMatchObject({
      running: 1,
      completed: 2,
      failed: 3,
      last_run_at: "2026-10-02T12:00:00Z",
    });
  });

  it("leaves the counts alone on an update whose old status is unknown, but still moves last_run_at", () => {
    const next = applyRunChangeToSummaries(
      list(),
      update(finished("aaaa", "completed", "2026-10-02T12:00:00Z")),
      undefined,
    );

    expect(next[0]).toMatchObject({
      running: 1,
      completed: 2,
      failed: 3,
      last_run_at: "2026-10-02T12:00:00Z",
    });
  });

  it("does not move last_run_at backwards and sets it from null", () => {
    const current = list();
    const older = applyRunChangeToSummaries(
      current,
      update(run("aaaa", { updated_at: "2026-10-02T09:00:00Z" })),
      "running",
    );
    expect(older[0]?.last_run_at).toBe("2026-10-02T10:30:00Z");

    const other = applyRunChangeToSummaries(
      current,
      insert(run("aaaa", { project_id: OTHER_PROJECT, updated_at: "2026-10-02T09:00:00Z" })),
      undefined,
    );
    expect(other[1]?.last_run_at).toBe("2026-10-02T09:00:00Z");
    expect(other[0]).toBe(current[0]);
  });

  it("compares last_run_at as instants, not strings", () => {
    const current = [summary(PROJECT, { last_run_at: "2026-10-02T10:30:00+00:00" })];
    const next = applyRunChangeToSummaries(
      current,
      update(run("aaaa", { updated_at: "2026-10-02T10:30:00.000Z" })),
      "running",
    );

    expect(next[0]?.last_run_at).toBe("2026-10-02T10:30:00+00:00");
  });

  it("decrements the old status on a delete and never goes below zero", () => {
    const next = applyRunChangeToSummaries(list(), remove("aaaa"), "failed");
    expect(next[0]).toMatchObject({
      running: 1,
      completed: 2,
      failed: 2,
      last_run_at: "2026-10-02T10:30:00Z",
    });

    const floor = applyRunChangeToSummaries(
      [summary(PROJECT, { running: 0 })],
      remove("aaaa"),
      "running",
    );
    expect(floor[0]?.running).toBe(0);
  });

  it("is a no-op for a delete whose old status is unknown", () => {
    const current = list();
    expect(applyRunChangeToSummaries(current, remove("aaaa"), undefined)).toEqual(current);
  });

  it("returns the input for a project that is not in the list, or an event without a project id", () => {
    const current = list();
    const unknown = "33333333-3333-3333-3333-333333333333";

    expect(
      applyRunChangeToSummaries(current, insert(run("aaaa", { project_id: unknown })), undefined),
    ).toBe(current);
    expect(applyRunChangeToSummaries(current, remove("aaaa", unknown), "running")).toBe(current);
    expect(
      applyRunChangeToSummaries(
        current,
        { ...base, eventType: "DELETE", new: {}, old: {} },
        "running",
      ),
    ).toBe(current);
  });

  it("does not mutate the input and keeps the other project's object identity", () => {
    const current = list();
    const next = applyRunChangeToSummaries(current, insert(run("aaaa")), undefined);

    expect(current[0]?.running).toBe(1);
    expect(next[1]).toBe(current[1]);
  });
});
