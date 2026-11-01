import { describe, expect, it } from "vitest";
import type { QueueItem } from "@/types/adw";
import {
  dependencyHoldReason,
  inQueueSection,
  isDependencyHeld,
  QUEUE_SECTION_FILTER,
} from "./queue-hold";

const REASON = "blocked by #30 (queued); starts on its own once #30 merges";

function item(
  state: QueueItem["state"],
  reason: string | null = null,
): Pick<QueueItem, "state" | "reason"> {
  return { state, reason };
}

describe("inQueueSection", () => {
  it("holds a queued item", () => {
    expect(inQueueSection(item("queued"))).toBe(true);
    expect(isDependencyHeld(item("queued"))).toBe(false);
  });

  it("holds an item held on a dependency", () => {
    const held = item("held", `waiting on a dependency: ${REASON}`);
    expect(inQueueSection(held)).toBe(true);
    expect(isDependencyHeld(held)).toBe(true);
  });

  it("leaves out an item the merge gate held", () => {
    expect(inQueueSection(item("held", "hold label adw:hold"))).toBe(false);
  });

  it("leaves out a held item with no reason", () => {
    expect(inQueueSection(item("held"))).toBe(false);
  });

  it("leaves out a held item whose reason holds the prefix later in the text", () => {
    expect(inQueueSection(item("held", `note: waiting on a dependency: ${REASON}`))).toBe(false);
  });

  it.each(["running", "merged", "failed", "gated"] as const)("leaves out %s", (state) => {
    expect(inQueueSection(item(state, `waiting on a dependency: ${REASON}`))).toBe(false);
  });
});

describe("dependencyHoldReason", () => {
  it("strips the prefix", () => {
    expect(dependencyHoldReason(item("held", `waiting on a dependency: ${REASON}`))).toBe(REASON);
  });

  it("is null for a queued item and for a gate-held item", () => {
    expect(dependencyHoldReason(item("queued"))).toBeNull();
    expect(dependencyHoldReason(item("held", "hold label adw:hold"))).toBeNull();
  });

  it("is null when nothing follows the prefix", () => {
    expect(dependencyHoldReason(item("held", "waiting on a dependency: "))).toBeNull();
  });
});

describe("QUEUE_SECTION_FILTER", () => {
  it("is the predicate as a PostgREST or filter", () => {
    expect(QUEUE_SECTION_FILTER).toBe(
      'state.eq.queued,and(state.eq.held,reason.like."waiting on a dependency: *")',
    );
  });
});
