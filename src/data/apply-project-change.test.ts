import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Project, ProjectSummary } from "@/types/adw";
import { applyProjectChange } from "./apply-project-change";

function row(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    slug: `owner/${id}`,
    display_name: id,
    repo_url: null,
    is_public: true,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function summary(id: string, overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    ...row(id),
    running: 1,
    completed: 2,
    failed: 3,
    last_run_at: "2026-10-02T00:00:00Z",
    ...overrides,
  };
}

const base = {
  schema: "adw",
  table: "projects",
  commit_timestamp: "2026-10-03T00:00:00Z",
  errors: [] as string[],
};

function insert(record: Project): RealtimePostgresChangesPayload<Project> {
  return { ...base, eventType: "INSERT", new: record, old: {} };
}

function update(record: Project): RealtimePostgresChangesPayload<Project> {
  return { ...base, eventType: "UPDATE", new: record, old: { id: record.id } };
}

function remove(id: string): RealtimePostgresChangesPayload<Project> {
  return { ...base, eventType: "DELETE", new: {}, old: { id } };
}

describe("applyProjectChange", () => {
  it("prepends an inserted project with zero counts and no last run", () => {
    const current = [summary("a")];
    const next = applyProjectChange(current, insert(row("b")));

    expect(next.map((project) => project.id)).toEqual(["b", "a"]);
    expect(next[0]).toEqual({
      ...row("b"),
      running: 0,
      completed: 0,
      failed: 0,
      last_run_at: null,
    });
    expect(current).toHaveLength(1);
  });

  it("ignores an insert whose id is already in the list", () => {
    const current = [summary("a")];
    const next = applyProjectChange(current, insert(row("a", { display_name: "again" })));

    expect(next).toBe(current);
  });

  it("merges an update into the matching entry and keeps its counts", () => {
    const current = [summary("a"), summary("b")];
    const next = applyProjectChange(
      current,
      update(row("b", { display_name: "Renamed", updated_at: "2026-10-03T00:00:00Z" })),
    );

    expect(next[1]).toEqual(
      summary("b", { display_name: "Renamed", updated_at: "2026-10-03T00:00:00Z" }),
    );
    expect(next[0]).toBe(current[0]);
  });

  it("leaves the list unchanged for an update to an unknown id", () => {
    const current = [summary("a")];
    const next = applyProjectChange(current, update(row("zzz")));

    expect(next).toEqual(current);
  });

  it("removes the deleted project by the id in old, which may be the only field", () => {
    const current = [summary("a"), summary("b")];
    const next = applyProjectChange(current, remove("a"));

    expect(next.map((project) => project.id)).toEqual(["b"]);
  });

  it("ignores a delete without an id", () => {
    const current = [summary("a")];
    const next = applyProjectChange(current, { ...base, eventType: "DELETE", new: {}, old: {} });

    expect(next).toEqual(current);
  });
});
