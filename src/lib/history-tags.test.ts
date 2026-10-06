import { describe, expect, it } from "vitest";
import { historyTag, historyTags, runsTag, summaryPastTag, summaryTodayTag } from "./history-tags";

// The spellings are a contract between the page's cacheTag calls and the two
// places that expire them (the server action and the route handler). Pinning
// them here means a change to either prefix is a deliberate, visible edit.
describe("history tags", () => {
  it("spells the history scope tag as history:<slug>", () => {
    expect(historyTag("SBub/adw-toolkit")).toBe("history:SBub/adw-toolkit");
  });

  it("spells the Active prefetch tag as runs:<slug>", () => {
    expect(runsTag("SBub/adw-toolkit")).toBe("runs:SBub/adw-toolkit");
  });

  it("spells the summary past days tag as summary:past", () => {
    expect(summaryPastTag()).toBe("summary:past");
  });

  it("spells the summary today tag as summary:today", () => {
    expect(summaryTodayTag()).toBe("summary:today");
  });

  it("returns all three tags for a completion, history first", () => {
    expect(historyTags("SBub/adw-toolkit")).toEqual([
      "history:SBub/adw-toolkit",
      "runs:SBub/adw-toolkit",
      "summary:today",
    ]);
  });

  it("never drops the summary past days tag on a completion", () => {
    expect(historyTags("SBub/adw-toolkit")).not.toContain(summaryPastTag());
  });
});
