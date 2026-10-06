import { describe, expect, it } from "vitest";
import type { QueueItem, Run } from "@/types/adw";
import {
  byQueuePosition,
  hasRunningRun,
  queuePositions,
  queueStartHint,
  waitLabel,
} from "./queue-order";

function item(issue: number, position: number, overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    project_id: "11111111-1111-1111-1111-111111111111",
    issue_number: issue,
    state: "queued",
    source: "label:adw:queued",
    position,
    issue_title: `Issue ${issue}`,
    queued_at: "2026-10-05T09:00:00Z",
    adw_id: null,
    note: null,
    updated_at: "2026-10-05T09:00:00Z",
    ...overrides,
  };
}

function run(adwId: string, status: Run["status"]): Run {
  return {
    project_id: "11111111-1111-1111-1111-111111111111",
    adw_id: adwId,
    issue_number: 1,
    issue_title: "Issue 1",
    issue_class: null,
    branch_name: null,
    phase: null,
    status,
    state: {},
    toolkit_version: null,
    started_at: "2026-10-05T09:00:00Z",
    updated_at: "2026-10-05T09:00:00Z",
    finished_at: null,
  };
}

describe("byQueuePosition", () => {
  it("sorts by position, then issue_number", () => {
    const sorted = [item(9, 2), item(7, 1), item(3, 2)].sort(byQueuePosition);
    expect(sorted.map((i) => i.issue_number)).toEqual([7, 3, 9]);
  });
});

describe("queuePositions", () => {
  it("ranks by ledger position, not by array index", () => {
    const positions = queuePositions([item(40, 5), item(41, 0), item(36, 2)]);
    expect(positions.get(40)).toBe(3);
    expect(positions.get(41)).toBe(1);
    expect(positions.get(36)).toBe(2);
  });

  it("gives 1..n for non-contiguous positions", () => {
    const positions = queuePositions([item(1, 0), item(2, 3), item(3, 7)]);
    expect([...positions.entries()]).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it("breaks a position tie by issue_number", () => {
    const positions = queuePositions([item(12, 4), item(5, 4)]);
    expect(positions.get(5)).toBe(1);
    expect(positions.get(12)).toBe(2);
  });

  it("swaps the ordinals of two moved items and leaves the third alone", () => {
    const before = queuePositions([item(1, 0), item(2, 1), item(3, 2)]);
    const after = queuePositions([item(1, 1), item(2, 0), item(3, 2)]);
    expect([before.get(1), before.get(2), before.get(3)]).toEqual([1, 2, 3]);
    expect([after.get(1), after.get(2), after.get(3)]).toEqual([2, 1, 3]);
  });

  it("ignores queued_at", () => {
    const positions = queuePositions([
      item(1, 1, { queued_at: "2026-10-01T00:00:00Z" }),
      item(2, 0, { queued_at: "2026-10-06T00:00:00Z" }),
    ]);
    expect(positions.get(2)).toBe(1);
    expect(positions.get(1)).toBe(2);
  });

  it("gives an empty map for an empty list and never mutates the input", () => {
    expect(queuePositions([]).size).toBe(0);
    const items = Object.freeze([item(3, 2), item(1, 0)]);
    queuePositions(items);
    expect(items.map((i) => i.issue_number)).toEqual([3, 1]);
  });
});

describe("waitLabel", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");

  it("is null without a parseable queued_at", () => {
    expect(waitLabel(null, now)).toBeNull();
    expect(waitLabel("not a date", now)).toBeNull();
  });

  it.each([
    ["2026-10-06T12:00:00Z", "waiting under 1 min"],
    ["2026-10-06T11:59:01Z", "waiting under 1 min"],
    ["2026-10-06T11:59:00Z", "waiting 1 min"],
    ["2026-10-06T11:48:00Z", "waiting 12 min"],
    ["2026-10-06T11:00:01Z", "waiting 59 min"],
    ["2026-10-06T11:00:00Z", "waiting 1 h 00 min"],
    ["2026-10-06T09:55:00Z", "waiting 2 h 05 min"],
    ["2026-10-05T12:01:00Z", "waiting 23 h 59 min"],
    ["2026-10-05T12:00:00Z", "waiting 1 d 00 h"],
    ["2026-10-03T08:00:00Z", "waiting 3 d 04 h"],
    ["2026-10-06T12:05:00Z", "waiting under 1 min"],
  ])("formats queued_at %s as %s", (queuedAt, label) => {
    expect(waitLabel(queuedAt, now)).toBe(label);
  });

  it("reads an offset the same as its UTC equal", () => {
    expect(waitLabel("2026-10-06T13:48:00+02:00", now)).toBe(
      waitLabel("2026-10-06T11:48:00Z", now),
    );
  });
});

describe("hasRunningRun", () => {
  it("is false for no entry, no runs or failed runs only", () => {
    expect(hasRunningRun(null)).toBe(false);
    expect(hasRunningRun({ active: [] })).toBe(false);
    expect(hasRunningRun({ active: [run("a", "failed")] })).toBe(false);
  });

  it("is true for a running run among failed ones", () => {
    expect(hasRunningRun({ active: [run("a", "failed"), run("b", "running")] })).toBe(true);
  });
});

describe("queueStartHint", () => {
  it("pins both hints", () => {
    expect(queueStartHint(true)).toBe("starts when the running run finishes");
    expect(queueStartHint(false)).toBe("starts with the next runner");
  });
});
