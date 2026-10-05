import { describe, expect, it } from "vitest";
import { historyTag, historyTags, runsTag, summaryTag } from "./history-tags";

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

  it("spells the summary scope tag as summary", () => {
    expect(summaryTag()).toBe("summary");
  });

  it("returns all three tags for a completion, history first", () => {
    expect(historyTags("SBub/adw-toolkit")).toEqual([
      "history:SBub/adw-toolkit",
      "runs:SBub/adw-toolkit",
      "summary",
    ]);
  });
});
