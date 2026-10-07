import { describe, expect, it } from "vitest";
import type { ProjectSummary, Run } from "@/types/adw";
import {
  applyRunChange,
  applyRunChangeToSummaries,
  isHistoryChange,
  type RunChange,
  runStatusIn,
} from "./apply-run-change";
import type { ActiveRuns } from "./index";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const OTHER_PROJECT = "22222222-2222-2222-2222-222222222222";

function run(adwId: string, overrides: Partial<Run> = {}): Run {
  return {
    project_id: PROJECT,
    adw_id: adwId,
    issue_number: 1,
    issue_title: null,
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
    queued: 0,
    running: 1,
    completed: 2,
    failed: 3,
    last_run_at: "2026-10-02T10:30:00Z",
    ...overrides,
  };
}

function active(runs: Run[]): ActiveRuns {
  return { active: runs, fetched_at: "2026-10-02T11:00:00Z" };
}

/** A run of the other project, for the cases where the entry holds two. */
function other(adwId: string, overrides: Partial<Run> = {}): Run {
  return run(adwId, { project_id: OTHER_PROJECT, ...overrides });
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
const keys = (list: Run[]) =>
  list.map((r) => `${r.project_id === PROJECT ? "p" : "o"}:${r.adw_id}`);

describe("runStatusIn", () => {
  const current = active([
    run("aaaa"),
    finished("bbbb", "failed", "2026-10-02T09:00:00Z"),
    other("cccc", { status: "failed" }),
  ]);

  it("finds a running and a failed run in the active list", () => {
    expect(runStatusIn(current, PROJECT, "aaaa")).toBe("running");
    expect(runStatusIn(current, PROJECT, "bbbb")).toBe("failed");
    expect(runStatusIn(current, OTHER_PROJECT, "cccc")).toBe("failed");
  });

  it("matches on project and adw_id together", () => {
    expect(runStatusIn(current, OTHER_PROJECT, "aaaa")).toBeUndefined();
    expect(runStatusIn(current, PROJECT, "cccc")).toBeUndefined();
  });

  it("is undefined for an unknown run, a null entry and an absent entry", () => {
    expect(runStatusIn(current, PROJECT, "zzzz")).toBeUndefined();
    expect(runStatusIn(null, PROJECT, "aaaa")).toBeUndefined();
    expect(runStatusIn(undefined, PROJECT, "aaaa")).toBeUndefined();
  });
});

describe("applyRunChange", () => {
  describe("INSERT", () => {
    it("prepends a running run", () => {
      const current = active([run("aaaa")]);
      const next = applyRunChange(current, insert(run("cccc")));

      expect(ids(next.active)).toEqual(["cccc", "aaaa"]);
      expect(ids(current.active)).toEqual(["aaaa"]);
    });

    it("prepends a failed run, which is still live", () => {
      const current = active([run("aaaa")]);
      const next = applyRunChange(
        current,
        insert(finished("cccc", "failed", "2026-10-02T12:00:00Z")),
      );

      expect(ids(next.active)).toEqual(["cccc", "aaaa"]);
    });

    it("ignores a completed run: that is history, not in this entry", () => {
      const current = active([run("aaaa")]);
      const next = applyRunChange(
        current,
        insert(finished("cccc", "completed", "2026-10-02T12:00:00Z")),
      );

      expect(next).toBe(current);
    });

    it("ignores an insert whose adw_id is already in the list", () => {
      const current = active([run("aaaa")]);

      expect(applyRunChange(current, insert(run("aaaa")))).toBe(current);
    });

    it("keeps fetched_at untouched", () => {
      const current = active([]);
      const next = applyRunChange(current, insert(run("aaaa")));

      expect(next.fetched_at).toBe("2026-10-02T11:00:00Z");
    });

    it("adds a running run of another project to the one entry", () => {
      const current = active([run("aaaa")]);
      const next = applyRunChange(current, insert(other("bbbb")));

      expect(keys(next.active)).toEqual(["o:bbbb", "p:aaaa"]);
    });

    it("treats the same adw_id under another project as a distinct run", () => {
      const current = active([run("aaaa")]);
      const next = applyRunChange(current, insert(other("aaaa")));

      expect(keys(next.active)).toEqual(["o:aaaa", "p:aaaa"]);
    });

    it("ignores a duplicate insert of the same project and adw_id", () => {
      const current = active([run("aaaa"), other("aaaa")]);

      expect(applyRunChange(current, insert(other("aaaa")))).toBe(current);
    });
  });

  describe("UPDATE", () => {
    it("replaces a running run in place when its status did not change", () => {
      const current = active([run("aaaa"), run("bbbb"), run("cccc")]);
      const next = applyRunChange(
        current,
        update(run("bbbb", { phase: "adw_test_iso", updated_at: "2026-10-02T10:45:00Z" })),
      );

      expect(ids(next.active)).toEqual(["aaaa", "bbbb", "cccc"]);
      expect(next.active[1]).toMatchObject({
        phase: "adw_test_iso",
        updated_at: "2026-10-02T10:45:00Z",
      });
    });

    it("keeps the issue title of an updated run", () => {
      const title = "Show the issue title on run rows";
      const current = active([run("aaaa", { issue_title: title }), run("bbbb")]);
      const next = applyRunChange(
        current,
        update(
          run("aaaa", {
            issue_title: title,
            phase: "adw_test_iso",
            updated_at: "2026-10-02T10:45:00Z",
          }),
        ),
      );

      expect(next.active[0]).toMatchObject({ issue_title: title, phase: "adw_test_iso" });
      expect(next.active[1]?.issue_title).toBeNull();
    });

    it("removes a run that completes", () => {
      const current = active([run("aaaa"), run("bbbb")]);
      const next = applyRunChange(
        current,
        update(finished("aaaa", "completed", "2026-10-02T10:50:00Z")),
      );

      expect(ids(next.active)).toEqual(["bbbb"]);
    });

    it("keeps a run that fails in place, now marked failed", () => {
      const current = active([run("aaaa"), run("bbbb")]);
      const next = applyRunChange(
        current,
        update(finished("aaaa", "failed", "2026-10-02T10:50:00Z")),
      );

      expect(ids(next.active)).toEqual(["aaaa", "bbbb"]);
      expect(next.active[0]?.status).toBe("failed");
    });

    it("keeps a failed run in place when it is set back to running (resumed)", () => {
      const current = active([
        run("bbbb"),
        finished("aaaa", "failed", "2026-10-02T09:00:00Z"),
        run("cccc"),
      ]);
      const next = applyRunChange(
        current,
        update(run("aaaa", { updated_at: "2026-10-02T11:00:00Z" })),
      );

      expect(ids(next.active)).toEqual(["bbbb", "aaaa", "cccc"]);
      expect(next.active[1]?.status).toBe("running");
    });

    it("adds a live run that is not in the list, as an insert would", () => {
      const current = active([run("aaaa")]);
      const next = applyRunChange(current, update(run("zzzz")));

      expect(ids(next.active)).toEqual(["zzzz", "aaaa"]);
    });

    it("returns the input for a completed run that was not in the list", () => {
      const current = active([run("aaaa")]);
      const next = applyRunChange(
        current,
        update(finished("zzzz", "completed", "2026-10-02T10:50:00Z")),
      );

      expect(next).toBe(current);
    });

    it("does not mutate the input", () => {
      const current = active([run("aaaa")]);
      applyRunChange(current, update(finished("aaaa", "completed", "2026-10-02T10:50:00Z")));

      expect(ids(current.active)).toEqual(["aaaa"]);
    });

    it("removes only the completing run of its own project", () => {
      const current = active([run("aaaa"), other("aaaa"), other("bbbb")]);
      const next = applyRunChange(
        current,
        update({
          ...finished("aaaa", "completed", "2026-10-02T10:50:00Z"),
          project_id: OTHER_PROJECT,
        }),
      );

      expect(keys(next.active)).toEqual(["p:aaaa", "o:bbbb"]);
    });

    it("keeps a failing run of another project in place, the rest untouched", () => {
      const current = active([run("aaaa"), other("aaaa"), other("bbbb")]);
      const next = applyRunChange(current, update(other("aaaa", { status: "failed" })));

      expect(keys(next.active)).toEqual(["p:aaaa", "o:aaaa", "o:bbbb"]);
      expect(next.active[0]?.status).toBe("running");
      expect(next.active[1]?.status).toBe("failed");
    });
  });

  describe("DELETE", () => {
    it("removes the run by the adw_id in old", () => {
      const current = active([run("aaaa"), run("bbbb")]);
      const next = applyRunChange(current, remove("aaaa"));

      expect(ids(next.active)).toEqual(["bbbb"]);
      expect(next.fetched_at).toBe(current.fetched_at);
    });

    it("removes only the run matching both project_id and adw_id", () => {
      const current = active([run("aaaa"), other("aaaa")]);
      const next = applyRunChange(current, remove("aaaa", OTHER_PROJECT));

      expect(keys(next.active)).toEqual(["p:aaaa"]);
    });

    it("returns the input for an unknown adw_id or a delete without one", () => {
      const current = active([run("aaaa")]);

      expect(applyRunChange(current, remove("zzzz"))).toBe(current);
      expect(applyRunChange(current, { ...base, eventType: "DELETE", new: {}, old: {} })).toBe(
        current,
      );
    });
  });
});

describe("isHistoryChange", () => {
  it("is true for an update that completes a run, whatever it was before", () => {
    const done = finished("aaaa", "completed", "2026-10-02T10:50:00Z");
    expect(isHistoryChange(update(done), "running")).toBe(true);
    expect(isHistoryChange(update(done), "failed")).toBe(true);
    expect(isHistoryChange(update(done), undefined)).toBe(true);
  });

  it("is true for an inserted completed run", () => {
    expect(
      isHistoryChange(insert(finished("aaaa", "completed", "2026-10-02T10:50:00Z")), undefined),
    ).toBe(true);
  });

  it("is false for an insert or update that leaves the run live", () => {
    expect(isHistoryChange(insert(run("aaaa")), undefined)).toBe(false);
    expect(isHistoryChange(update(run("aaaa", { phase: "adw_test_iso" })), "running")).toBe(false);
    expect(
      isHistoryChange(update(finished("aaaa", "failed", "2026-10-02T10:50:00Z")), "running"),
    ).toBe(false);
    expect(isHistoryChange(update(run("aaaa")), "failed")).toBe(false);
  });

  it("is true for a delete of a run the active list did not hold, false for a live one", () => {
    expect(isHistoryChange(remove("aaaa"), undefined)).toBe(true);
    expect(isHistoryChange(remove("aaaa"), "running")).toBe(false);
    expect(isHistoryChange(remove("aaaa"), "failed")).toBe(false);
  });
});

// The function reference, not its name as a string: the lint no-secrets rule
// flags the bare name as a high-entropy literal.
describe(applyRunChangeToSummaries, () => {
  const list = () => [summary(PROJECT), summary(OTHER_PROJECT, { last_run_at: null })];

  it("leaves running and failed alone on an insert and moves last_run_at forward", () => {
    const next = applyRunChangeToSummaries(
      list(),
      insert(run("aaaa", { updated_at: "2026-10-02T12:00:00Z" })),
      undefined,
    );

    expect(next[0]).toMatchObject({
      running: 1,
      completed: 2,
      failed: 3,
      last_run_at: "2026-10-02T12:00:00Z",
    });
  });

  it("leaves the counts alone on an inserted failed run", () => {
    const next = applyRunChangeToSummaries(
      list(),
      insert(finished("aaaa", "failed", "2026-10-02T12:00:00Z")),
      undefined,
    );

    expect(next[0]).toMatchObject({ running: 1, completed: 2, failed: 3 });
  });

  it("counts an inserted completed run", () => {
    const next = applyRunChangeToSummaries(
      list(),
      insert(finished("aaaa", "completed", "2026-10-02T12:00:00Z")),
      undefined,
    );

    expect(next[0]).toMatchObject({ running: 1, completed: 3, failed: 3 });
  });

  it("counts a completion from running or failed, without touching running or failed", () => {
    const done = update(finished("aaaa", "completed", "2026-10-02T12:00:00Z"));

    expect(applyRunChangeToSummaries(list(), done, "running")[0]).toMatchObject({
      running: 1,
      completed: 3,
      failed: 3,
      last_run_at: "2026-10-02T12:00:00Z",
    });
    expect(applyRunChangeToSummaries(list(), done, "failed")[0]).toMatchObject({
      running: 1,
      completed: 3,
      failed: 3,
    });
  });

  it("leaves the counts alone on an update to running or failed", () => {
    const failing = applyRunChangeToSummaries(
      list(),
      update(finished("aaaa", "failed", "2026-10-02T12:00:00Z")),
      "running",
    );
    expect(failing[0]).toMatchObject({ running: 1, completed: 2, failed: 3 });

    const heartbeat = applyRunChangeToSummaries(
      list(),
      update(run("aaaa", { updated_at: "2026-10-02T12:00:00Z" })),
      "running",
    );
    expect(heartbeat[0]).toMatchObject({
      running: 1,
      completed: 2,
      failed: 3,
      last_run_at: "2026-10-02T12:00:00Z",
    });
  });

  it("leaves the counts alone on a completed update whose old status is unknown, but still moves last_run_at", () => {
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

    const fromNull = applyRunChangeToSummaries(
      current,
      insert(other("aaaa", { updated_at: "2026-10-02T09:00:00Z" })),
      undefined,
    );
    expect(fromNull[1]?.last_run_at).toBe("2026-10-02T09:00:00Z");
    expect(fromNull[0]).toBe(current[0]);
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

  it("returns the input on a delete, whatever the old status", () => {
    const current = list();

    expect(applyRunChangeToSummaries(current, remove("aaaa"), "failed")).toBe(current);
    expect(applyRunChangeToSummaries(current, remove("aaaa"), undefined)).toBe(current);
  });

  it("returns the input for a project that is not in the list", () => {
    const current = list();
    const unknown = "33333333-3333-3333-3333-333333333333";

    expect(
      applyRunChangeToSummaries(current, insert(run("aaaa", { project_id: unknown })), undefined),
    ).toBe(current);
  });

  it("does not mutate the input and keeps the other project's object identity", () => {
    const current = list();
    const next = applyRunChangeToSummaries(
      current,
      insert(finished("aaaa", "completed", "2026-10-02T12:00:00Z")),
      undefined,
    );

    expect(current[0]?.completed).toBe(2);
    expect(next[0]?.completed).toBe(3);
    expect(next[1]).toBe(current[1]);
  });
});
