import { describe, expect, it } from "vitest";
import type { DailySummary } from "@/types/adw";
import {
  classSegments,
  costLabel,
  readSummaryDays,
  readSummaryProject,
  SUMMARY_DEFAULT_DAYS,
  SUMMARY_MAX_DAYS,
  summaryHref,
  summaryWindowStart,
  tokensLabel,
  toSummaryReport,
} from "./daily-summary";

// The module under test reads no clock; every case is a fixed input.

function row(overrides: Partial<DailySummary>): DailySummary {
  return {
    project_id: "p1",
    day: "2026-10-05",
    runs: 0,
    completed: 0,
    failed: 0,
    halted: 0,
    features: 0,
    bugs: 0,
    chores: 0,
    patches: 0,
    median_duration_s: null,
    tokens_in_sum: 0,
    tokens_in_median: null,
    tokens_out_sum: 0,
    tokens_out_median: null,
    cost_usd_sum: 0,
    cost_usd_median: null,
    ...overrides,
  };
}

const ALPHA = { id: "p1", slug: "SBub/alpha", display_name: "Alpha" };
const PROJECTS = [ALPHA, { id: "p2", slug: "SBub/beta", display_name: "Beta" }];

/** The item at `index`, failing the test when it is missing. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

const ALL = { days: 30, project: null, from: "2026-09-06", to: "2026-10-05" };

describe("readSummaryDays", () => {
  it("is the default when absent", () => {
    expect(readSummaryDays(undefined)).toBe(SUMMARY_DEFAULT_DAYS);
  });

  it("reads a value inside the bounds", () => {
    expect(readSummaryDays("7")).toBe(7);
  });

  it("clamps to the maximum", () => {
    expect(readSummaryDays("999")).toBe(SUMMARY_MAX_DAYS);
  });

  it("clamps zero to one", () => {
    expect(readSummaryDays("0")).toBe(1);
  });

  it("is the default for junk, signs, fractions, empty and too many digits", () => {
    for (const raw of ["abc", "-5", "1.5", "", "1000", " 7"]) {
      expect(readSummaryDays(raw)).toBe(SUMMARY_DEFAULT_DAYS);
    }
  });

  it("is the default for a repeated parameter", () => {
    expect(readSummaryDays(["7", "30"])).toBe(SUMMARY_DEFAULT_DAYS);
  });
});

describe("readSummaryProject", () => {
  it("keeps a valid slug", () => {
    expect(readSummaryProject("SBub/adw-toolkit")).toBe("SBub/adw-toolkit");
  });

  it("is null for absent and the form's empty value", () => {
    expect(readSummaryProject(undefined)).toBeNull();
    expect(readSummaryProject("")).toBeNull();
  });

  it("is null for a malformed slug", () => {
    expect(readSummaryProject("a/b/c")).toBeNull();
    expect(readSummaryProject("a%2Fb")).toBeNull();
  });

  it("is null for a repeated parameter", () => {
    expect(readSummaryProject(["SBub/a", "SBub/b"])).toBeNull();
  });
});

describe("summaryWindowStart", () => {
  it("counts the anchor as the last day of the window", () => {
    expect(summaryWindowStart("2026-10-05", 30)).toBe("2026-09-06");
  });

  it("is the anchor itself for a one-day window", () => {
    expect(summaryWindowStart("2026-01-01", 1)).toBe("2026-01-01");
  });

  it("crosses into February of a common year", () => {
    expect(summaryWindowStart("2026-03-01", 2)).toBe("2026-02-28");
  });

  it("crosses into February of a leap year", () => {
    expect(summaryWindowStart("2024-03-01", 2)).toBe("2024-02-29");
  });

  it("crosses a year boundary", () => {
    expect(summaryWindowStart("2026-01-05", 7)).toBe("2025-12-30");
  });
});

describe("toSummaryReport", () => {
  it("adds counts and sums across projects and shows no median of medians", () => {
    const report = toSummaryReport(
      [
        row({
          project_id: "p1",
          runs: 3,
          completed: 2,
          failed: 1,
          features: 3,
          median_duration_s: 600,
          tokens_in_sum: 100,
          tokens_in_median: 30,
          cost_usd_sum: 1.5,
          cost_usd_median: 0.5,
        }),
        row({
          project_id: "p2",
          runs: 2,
          completed: 2,
          bugs: 2,
          median_duration_s: 900,
          tokens_in_sum: 50,
          tokens_in_median: 25,
          cost_usd_sum: 0.25,
          cost_usd_median: 0.1,
        }),
      ],
      PROJECTS,
      ALL,
    );
    expect(report.rows).toHaveLength(1);
    const { totals, projects } = at(report.rows, 0);
    expect(totals).toMatchObject({
      runs: 5,
      completed: 4,
      failed: 1,
      features: 3,
      bugs: 2,
      tokens_in_sum: 150,
      cost_usd_sum: 1.75,
    });
    expect(totals.median_duration_s).toBeNull();
    expect(totals.tokens_in_median).toBeNull();
    expect(totals.tokens_out_median).toBeNull();
    expect(totals.cost_usd_median).toBeNull();
    expect(projects.map((p) => p.slug)).toEqual(["SBub/alpha", "SBub/beta"]);
    expect(at(projects, 0).median_duration_s).toBe(600);
  });

  it("keeps the exact medians when one project contributed", () => {
    const report = toSummaryReport(
      [
        row({
          runs: 1,
          median_duration_s: 780,
          tokens_in_median: 10,
          tokens_out_median: 5,
          cost_usd_median: 0.2,
        }),
      ],
      PROJECTS,
      ALL,
    );
    expect(at(report.rows, 0).totals).toMatchObject({
      median_duration_s: 780,
      tokens_in_median: 10,
      tokens_out_median: 5,
      cost_usd_median: 0.2,
    });
  });

  it("orders days newest first and a day's projects by runs, then slug", () => {
    const report = toSummaryReport(
      [
        row({ day: "2026-10-03", project_id: "p1", runs: 1 }),
        row({ day: "2026-10-05", project_id: "p2", runs: 1 }),
        row({ day: "2026-10-05", project_id: "p1", runs: 1 }),
        row({ day: "2026-10-04", project_id: "p2", runs: 1 }),
        row({ day: "2026-10-04", project_id: "p1", runs: 4 }),
      ],
      PROJECTS,
      ALL,
    );
    expect(report.rows.map((d) => d.day)).toEqual(["2026-10-05", "2026-10-04", "2026-10-03"]);
    expect(at(report.rows, 0).projects.map((p) => p.slug)).toEqual(["SBub/alpha", "SBub/beta"]);
    expect(at(report.rows, 1).projects.map((p) => p.slug)).toEqual(["SBub/alpha", "SBub/beta"]);
    expect(at(at(report.rows, 1).projects, 0).runs).toBe(4);
  });

  it("drops a row whose project is not in the visible list", () => {
    const report = toSummaryReport(
      [row({ project_id: "p1", runs: 1 }), row({ project_id: "hidden", runs: 9 })],
      PROJECTS,
      ALL,
    );
    expect(at(report.rows, 0).totals.runs).toBe(1);
    expect(at(report.rows, 0).projects).toHaveLength(1);
  });

  it("rounds the added cost to four decimals", () => {
    const report = toSummaryReport(
      [row({ project_id: "p1", cost_usd_sum: 0.1 }), row({ project_id: "p2", cost_usd_sum: 0.2 })],
      PROJECTS,
      ALL,
    );
    expect(at(report.rows, 0).totals.cost_usd_sum).toBe(0.3);
  });

  it("passes the window through and lists the projects without ids", () => {
    const report = toSummaryReport([], PROJECTS, {
      days: 7,
      project: ALPHA,
      from: null,
      to: null,
    });
    expect(report).toEqual({
      from: null,
      to: null,
      days: 7,
      project: ALPHA,
      projects: [
        { slug: "SBub/alpha", display_name: "Alpha" },
        { slug: "SBub/beta", display_name: "Beta" },
      ],
      rows: [],
    });
  });

  it("does not mutate its inputs", () => {
    const rows = Object.freeze([
      Object.freeze(row({ day: "2026-10-04", project_id: "p2", runs: 1 })),
      Object.freeze(row({ day: "2026-10-05", project_id: "p1", runs: 2 })),
      Object.freeze(row({ day: "2026-10-05", project_id: "p2", runs: 3 })),
    ]);
    const projects = Object.freeze(PROJECTS.map((p) => Object.freeze({ ...p })));
    expect(() => toSummaryReport(rows, projects, ALL)).not.toThrow();
    expect(rows.map((r) => r.day)).toEqual(["2026-10-04", "2026-10-05", "2026-10-05"]);
  });
});

describe("classSegments", () => {
  it("is empty for no runs", () => {
    expect(classSegments({ runs: 0, features: 0, bugs: 0, chores: 0, patches: 0 })).toEqual([]);
  });

  it("orders the known classes, omits zeros and adds the unknown remainder as other", () => {
    const segments = classSegments({ runs: 10, features: 4, bugs: 0, chores: 3, patches: 1 });
    expect(segments.map((s) => [s.key, s.count])).toEqual([
      ["/feature", 4],
      ["/chore", 3],
      ["/patch", 1],
      ["other", 2],
    ]);
    expect(at(segments, 0)).toMatchObject({ offset: 0, width: 40 });
    expect(at(segments, 1)).toMatchObject({ offset: 40, width: 30 });
  });

  it("ends the last segment at exactly 100", () => {
    const segments = classSegments({ runs: 3, features: 1, bugs: 1, chores: 1, patches: 0 });
    const last = at(segments, segments.length - 1);
    expect(last.offset + last.width).toBe(100);
  });
});

describe("tokensLabel", () => {
  it("is n/a for null", () => {
    expect(tokensLabel(null)).toBe("n/a");
  });

  it("is the integer under a thousand", () => {
    expect(tokensLabel(0)).toBe("0");
    expect(tokensLabel(950)).toBe("950");
  });

  it("uses k, M and B with one decimal", () => {
    expect(tokensLabel(1000)).toBe("1.0k");
    expect(tokensLabel(12_345)).toBe("12.3k");
    expect(tokensLabel(4_560_000)).toBe("4.6M");
    expect(tokensLabel(7_250_000_000)).toBe("7.3B");
  });

  it("moves to the next unit when rounding reaches a thousand", () => {
    expect(tokensLabel(999_960)).toBe("1.0M");
  });
});

describe("costLabel", () => {
  it("is n/a for null", () => {
    expect(costLabel(null)).toBe("n/a");
  });

  it("is $0.00 for zero", () => {
    expect(costLabel(0)).toBe("$0.00");
  });

  it("shows two decimals", () => {
    expect(costLabel(12.345)).toBe("$12.35");
    expect(costLabel(0.01)).toBe("$0.01");
  });

  it("marks a cost under one cent", () => {
    expect(costLabel(0.0042)).toBe("<$0.01");
  });
});

describe("summaryHref", () => {
  it("is the bare path for the defaults", () => {
    expect(summaryHref(SUMMARY_DEFAULT_DAYS, null)).toBe("/summary");
  });

  it("carries a non-default window", () => {
    expect(summaryHref(7, null)).toBe("/summary?days=7");
  });

  it("encodes the project slug", () => {
    const encoded = "SBub%2Fadw-toolkit";
    expect(summaryHref(SUMMARY_DEFAULT_DAYS, "SBub/adw-toolkit")).toBe(
      `/summary?project=${encoded}`,
    );
    expect(summaryHref(90, "SBub/adw-toolkit")).toBe(`/summary?days=90&project=${encoded}`);
  });
});
