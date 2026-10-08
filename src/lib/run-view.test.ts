import { describe, expect, it } from "vitest";
import {
  branchTreeHref,
  costLabel,
  durationLabel,
  pullRequestHref,
  runCosts,
  secondsLabel,
} from "./run-view";

// The module under test never reads the clock, so nothing here depends on
// when the suite runs; every case is two fixed timestamps.
describe("durationLabel", () => {
  it("is null while finished_at is null", () => {
    expect(durationLabel("2026-10-02T11:31:04Z", null)).toBeNull();
  });

  it("measures started_at to finished_at in minutes and seconds under an hour", () => {
    expect(durationLabel("2026-10-01T14:02:11Z", "2026-10-01T14:49:37Z")).toBe("47m 26s");
  });

  it("switches to hours and zero-padded minutes from one hour up", () => {
    expect(durationLabel("2026-10-01T14:00:00Z", "2026-10-01T15:03:59Z")).toBe("1h 03m");
  });

  it("does not cap hours at a day", () => {
    expect(durationLabel("2026-09-30T10:00:00Z", "2026-10-02T11:12:00Z")).toBe("49h 12m");
  });

  it("zero-pads seconds under a minute boundary", () => {
    expect(durationLabel("2026-10-02T11:00:00Z", "2026-10-02T11:08:05Z")).toBe("8m 05s");
  });

  it("clamps a negative span to zero", () => {
    expect(durationLabel("2026-10-02T12:30:00Z", "2026-10-02T12:00:00Z")).toBe("0m 00s");
  });
});

describe("secondsLabel", () => {
  it("formats the summary's summed seconds like durationLabel", () => {
    expect(secondsLabel(4800)).toBe("1h 20m");
    expect(secondsLabel(970)).toBe("16m 10s");
  });

  it("drops the fraction of a second under an hour", () => {
    expect(secondsLabel(780.158333)).toBe("13m 00s");
  });

  it("switches to hours from one hour up", () => {
    expect(secondsLabel(3725)).toBe("1h 02m");
  });
});

describe("branchTreeHref", () => {
  it("links a plain branch to its tree", () => {
    expect(branchTreeHref("SBub/adw-dashboard", "develop")).toBe(
      "https://github.com/SBub/adw-dashboard/tree/develop",
    );
  });

  it("keeps the branch's slashes as path separators", () => {
    expect(branchTreeHref("SBub/adw-dashboard", "chore/issue-141-adw-ab53aaef-x")).toBe(
      "https://github.com/SBub/adw-dashboard/tree/chore/issue-141-adw-ab53aaef-x",
    );
  });

  it("escapes a # in a segment", () => {
    expect(branchTreeHref("SBub/adw-dashboard", "fix/issue#12")).toBe(
      "https://github.com/SBub/adw-dashboard/tree/fix/issue%2312",
    );
  });
});

describe("costLabel", () => {
  it("is $0.00 for zero", () => {
    expect(costLabel(0)).toBe("$0.00");
  });

  it("marks a cost under one cent, and shows exactly one cent", () => {
    expect(costLabel(0.0042)).toBe("<$0.01");
    expect(costLabel(0.01)).toBe("$0.01");
  });

  it("rounds to cents", () => {
    expect(costLabel(4.2935)).toBe("$4.29");
    expect(costLabel(12.345)).toBe("$12.35");
    expect(costLabel(0.999)).toBe("$1.00");
  });

  it("prints thousands with no separator", () => {
    expect(costLabel(1234.5)).toBe("$1234.50");
  });
});

describe("runCosts", () => {
  it("is empty for no rows", () => {
    expect(runCosts([])).toEqual({});
  });

  it("keys each run's exact cost by adw_id", () => {
    expect(
      runCosts([
        { adw_id: "a6d2347d", cost_usd: 4.2935 },
        { adw_id: "7a7f315b", cost_usd: 0.0042 },
      ]),
    ).toEqual({ a6d2347d: 4.2935, "7a7f315b": 0.0042 });
  });

  it("has no key for a run without a metrics row", () => {
    expect(runCosts([{ adw_id: "a6d2347d", cost_usd: 4.2935 }])["deadbeef"]).toBeUndefined();
  });
});

describe("pullRequestHref", () => {
  it("links the pull request on GitHub", () => {
    expect(pullRequestHref("SBub/adw-dashboard", 143)).toBe(
      "https://github.com/SBub/adw-dashboard/pull/143",
    );
  });
});
