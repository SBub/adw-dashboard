import { describe, expect, it } from "vitest";
import type { Run } from "@/types/adw";
import { STALE_AFTER_MS, toRunView } from "./run-view";

// Every test pins "now" to a fixed instant; the module under test never reads
// the clock, so nothing here depends on when the suite runs.
const NOW = Date.parse("2026-10-02T12:00:00Z");

function run(overrides: Partial<Run> = {}): Run {
  return {
    project_id: "p1",
    adw_id: "423b11e9",
    issue_number: 212,
    issue_class: "/feature",
    branch_name: "feat/issue-212",
    phase: "adw_build_iso",
    status: "running",
    state: {},
    toolkit_version: "0.9.3",
    started_at: "2026-10-02T11:31:04Z",
    updated_at: "2026-10-02T11:58:21Z",
    finished_at: null,
    ...overrides,
  };
}

describe("toRunView", () => {
  it("keeps every row field and adds the three labels", () => {
    const row = run();
    const view = toRunView(row, NOW);

    expect(view).toMatchObject(row);
    expect(view).toEqual({
      ...row,
      is_stale: false,
      duration_label: "28m 56s",
      since_update_label: "1m ago",
    });
  });

  describe("is_stale", () => {
    it("is false for a running run updated within the threshold", () => {
      expect(toRunView(run({ updated_at: "2026-10-02T11:58:21Z" }), NOW).is_stale).toBe(false);
    });

    it("is false exactly at the threshold and true one millisecond past it", () => {
      const atThreshold = new Date(NOW - STALE_AFTER_MS).toISOString();
      const pastThreshold = new Date(NOW - STALE_AFTER_MS - 1).toISOString();

      expect(toRunView(run({ updated_at: atThreshold }), NOW).is_stale).toBe(false);
      expect(toRunView(run({ updated_at: pastThreshold }), NOW).is_stale).toBe(true);
    });

    it("is true for a running run last updated the day before", () => {
      expect(toRunView(run({ updated_at: "2026-10-01T10:13:36Z" }), NOW).is_stale).toBe(true);
    });

    it("is never true for a finished run, however old", () => {
      const old = {
        updated_at: "2026-09-01T10:00:00Z",
        finished_at: "2026-09-01T10:00:00Z",
      };
      expect(toRunView(run({ ...old, status: "completed" }), NOW).is_stale).toBe(false);
      expect(toRunView(run({ ...old, status: "failed" }), NOW).is_stale).toBe(false);
    });

    it("exports the threshold as thirty minutes", () => {
      expect(STALE_AFTER_MS).toBe(30 * 60 * 1000);
    });
  });

  describe("duration_label", () => {
    it("measures a finished run from started_at to finished_at", () => {
      const view = toRunView(
        run({
          status: "completed",
          started_at: "2026-10-01T14:02:11Z",
          updated_at: "2026-10-01T14:49:37Z",
          finished_at: "2026-10-01T14:49:37Z",
        }),
        NOW,
      );
      expect(view.duration_label).toBe("47m 26s");
    });

    it("switches to hours and zero-padded minutes from one hour up", () => {
      const view = toRunView(
        run({
          status: "completed",
          started_at: "2026-10-01T14:00:00Z",
          updated_at: "2026-10-01T15:03:59Z",
          finished_at: "2026-10-01T15:03:59Z",
        }),
        NOW,
      );
      expect(view.duration_label).toBe("1h 03m");
    });

    it("does not cap hours at a day", () => {
      const view = toRunView(
        run({
          status: "failed",
          started_at: "2026-09-30T10:00:00Z",
          updated_at: "2026-10-02T11:12:00Z",
          finished_at: "2026-10-02T11:12:00Z",
        }),
        NOW,
      );
      expect(view.duration_label).toBe("49h 12m");
    });

    it("zero-pads seconds under a minute boundary", () => {
      const view = toRunView(
        run({
          status: "completed",
          started_at: "2026-10-02T11:00:00Z",
          updated_at: "2026-10-02T11:08:05Z",
          finished_at: "2026-10-02T11:08:05Z",
        }),
        NOW,
      );
      expect(view.duration_label).toBe("8m 05s");
    });

    it("measures a running run from started_at to now", () => {
      const view = toRunView(run({ started_at: "2026-10-02T11:31:04Z" }), NOW);
      expect(view.duration_label).toBe("28m 56s");
    });

    it("clamps a negative span to zero", () => {
      const view = toRunView(run({ started_at: "2026-10-02T12:30:00Z" }), NOW);
      expect(view.duration_label).toBe("0m 00s");
    });
  });

  describe("since_update_label", () => {
    const cases: [string, string][] = [
      ["2026-10-02T12:00:00Z", "just now"],
      ["2026-10-02T11:59:31Z", "just now"],
      ["2026-10-02T11:59:30Z", "1m ago"],
      ["2026-10-02T11:58:00Z", "2m ago"],
      ["2026-10-02T11:00:01Z", "59m ago"],
      ["2026-10-02T11:00:00Z", "1h ago"],
      ["2026-10-02T09:00:00Z", "3h ago"],
      ["2026-10-01T12:00:01Z", "23h ago"],
      ["2026-10-01T12:00:00Z", "1d ago"],
      ["2026-09-30T08:00:00Z", "2d ago"],
    ];

    it.each(cases)("reads %s as %s", (updatedAt, label) => {
      expect(toRunView(run({ updated_at: updatedAt }), NOW).since_update_label).toBe(label);
    });

    it("treats a future updated_at as just now", () => {
      expect(toRunView(run({ updated_at: "2026-10-02T12:05:00Z" }), NOW).since_update_label).toBe(
        "just now",
      );
    });
  });
});
