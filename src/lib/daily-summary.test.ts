import { describe, expect, it } from "vitest";
import type { DailyModelSummary, DailySummary } from "@/types/adw";
import { secondsLabel } from "./run-view";
import {
  classCounts,
  classSegments,
  columnHeights,
  costLabel,
  pastDaysWindow,
  summaryWindowStart,
  tokensLabel,
  toSummaryDay,
  toSummaryReport,
  utcDay,
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
    duration_sum_s: 0,
    tokens_in_sum: 0,
    tokens_cache_read_sum: 0,
    tokens_out_sum: 0,
    cost_usd_sum: 0,
    ...overrides,
  };
}

function modelRow(overrides: Partial<DailyModelSummary>): DailyModelSummary {
  return {
    project_id: "p1",
    day: "2026-10-05",
    model: "claude-opus-4-1",
    runs: 0,
    input: 0,
    cache_read: 0,
    cache_creation: 0,
    output: 0,
    cost_usd: 0,
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

const ALL = { days: 30, from: "2026-09-06", to: "2026-10-05" };

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

describe("utcDay", () => {
  it("is the day of a time one minute before UTC midnight", () => {
    expect(utcDay(Date.parse("2026-10-05T23:59:00Z"))).toBe("2026-10-05");
  });

  it("is the next day one minute after UTC midnight", () => {
    expect(utcDay(Date.parse("2026-10-06T00:01:00Z"))).toBe("2026-10-06");
  });

  it("places UTC midnight itself on the new day", () => {
    expect(utcDay(Date.parse("2026-10-06T00:00:00.000Z"))).toBe("2026-10-06");
  });

  it("keeps the last millisecond of a year in that year", () => {
    expect(utcDay(Date.parse("2025-12-31T23:59:59.999Z"))).toBe("2025-12-31");
  });

  it("places an offset timestamp on its UTC day", () => {
    expect(utcDay(Date.parse("2026-10-06T01:30:00+02:00"))).toBe("2026-10-05");
  });
});

describe("pastDaysWindow", () => {
  it("is the 30 days before today, today excluded", () => {
    expect(pastDaysWindow("2026-10-06", 30)).toEqual({ from: "2026-09-06", to: "2026-10-05" });
  });

  it("is the day before today for a one-day window", () => {
    expect(pastDaysWindow("2026-10-06", 1)).toEqual({ from: "2026-10-05", to: "2026-10-05" });
  });

  it("crosses into February of a common year", () => {
    expect(pastDaysWindow("2026-03-01", 1)).toEqual({ from: "2026-02-28", to: "2026-02-28" });
  });

  it("crosses into February of a leap year", () => {
    expect(pastDaysWindow("2024-03-01", 1)).toEqual({ from: "2024-02-29", to: "2024-02-29" });
  });

  it("crosses a year boundary", () => {
    expect(pastDaysWindow("2026-01-01", 7)).toEqual({ from: "2025-12-25", to: "2025-12-31" });
  });

  it("splits a run at 23:59 yesterday into the past and one at 00:01 into today", () => {
    const today = utcDay(Date.parse("2026-10-06T12:00:00Z"));
    const window = pastDaysWindow(today, 30);
    const before = utcDay(Date.parse("2026-10-05T23:59:00Z"));
    const after = utcDay(Date.parse("2026-10-06T00:01:00Z"));
    expect(before).toBe(window.to);
    expect(before < today).toBe(true);
    expect(after).toBe(today);
    expect(after < today).toBe(false);
  });
});

describe("toSummaryDay", () => {
  it("is null for no rows", () => {
    expect(toSummaryDay([], [], PROJECTS, "2026-10-06")).toBeNull();
  });

  it("is null when the only rows are of another day", () => {
    expect(
      toSummaryDay([row({ day: "2026-10-05", runs: 1 })], [], PROJECTS, "2026-10-06"),
    ).toBeNull();
  });

  it("is null when the only rows are of a hidden project", () => {
    expect(
      toSummaryDay(
        [row({ day: "2026-10-06", project_id: "hidden", runs: 1 })],
        [],
        PROJECTS,
        "2026-10-06",
      ),
    ).toBeNull();
  });

  it("equals the report's day for that day's rows", () => {
    const rows = [
      row({ day: "2026-10-06", project_id: "p1", runs: 1, completed: 1 }),
      row({ day: "2026-10-06", project_id: "p2", runs: 3, failed: 1 }),
    ];
    const expected = at(toSummaryReport(rows, [], PROJECTS, ALL).rows, 0);
    expect(toSummaryDay(rows, [], PROJECTS, "2026-10-06")).toEqual(expected);
  });

  it("ignores rows of other days", () => {
    const day = toSummaryDay(
      [row({ day: "2026-10-06", runs: 2 }), row({ day: "2026-10-05", runs: 9 })],
      [],
      PROJECTS,
      "2026-10-06",
    );
    expect(day?.day).toBe("2026-10-06");
    expect(day?.totals.runs).toBe(2);
  });

  it("ignores model rows of other days", () => {
    const day = toSummaryDay(
      [row({ day: "2026-10-06", runs: 1 })],
      [modelRow({ day: "2026-10-06", output: 2 }), modelRow({ day: "2026-10-05", output: 9 })],
      PROJECTS,
      "2026-10-06",
    );
    expect(day?.models.map((m) => m.total)).toEqual([2]);
  });

  it("does not mutate its inputs", () => {
    const rows = Object.freeze([
      Object.freeze(row({ day: "2026-10-06", project_id: "p2", runs: 1 })),
      Object.freeze(row({ day: "2026-10-06", project_id: "p1", runs: 2 })),
    ]);
    const projects = Object.freeze(PROJECTS.map((p) => Object.freeze({ ...p })));
    expect(() => toSummaryDay(rows, [], projects, "2026-10-06")).not.toThrow();
    expect(rows.map((r) => r.project_id)).toEqual(["p2", "p1"]);
  });
});

describe("toSummaryReport", () => {
  it("the day's totals are the sum of its project rows", () => {
    const report = toSummaryReport(
      [
        row({
          project_id: "p1",
          runs: 3,
          completed: 2,
          failed: 1,
          features: 3,
          duration_sum_s: 600,
          tokens_in_sum: 100,
          tokens_cache_read_sum: 1_200_000,
          tokens_out_sum: 40,
          cost_usd_sum: 1.5,
        }),
        row({
          project_id: "p2",
          runs: 2,
          completed: 1,
          halted: 1,
          bugs: 1,
          chores: 1,
          duration_sum_s: 4200,
          tokens_in_sum: 50,
          tokens_cache_read_sum: 3_400_000,
          tokens_out_sum: 60,
          cost_usd_sum: 0.25,
        }),
      ],
      [],
      PROJECTS,
      ALL,
    );
    expect(report.rows).toHaveLength(1);
    const { totals, projects } = at(report.rows, 0);
    expect(totals).toEqual({
      day: "2026-10-05",
      runs: 5,
      completed: 3,
      failed: 1,
      halted: 1,
      features: 3,
      bugs: 1,
      chores: 1,
      patches: 0,
      duration_sum_s: 4800,
      tokens_in_sum: 150,
      tokens_cache_read_sum: 4_600_000,
      tokens_out_sum: 100,
      cost_usd_sum: 1.75,
    });
    for (const [key, value] of Object.entries(totals)) {
      if (key === "day") continue;
      const field = key as Exclude<keyof typeof totals, "day">;
      expect(value).toBe(projects.reduce((total, p) => total + p[field], 0));
    }
    expect(projects.map((p) => p.slug)).toEqual(["SBub/alpha", "SBub/beta"]);
  });

  it("the Total row equals the column sums of a day with three projects", () => {
    const three = [...PROJECTS, { id: "p3", slug: "SBub/gamma", display_name: "Gamma" }];
    const report = toSummaryReport(
      [
        row({
          project_id: "p1",
          runs: 5,
          completed: 3,
          failed: 2,
          features: 2,
          bugs: 1,
          chores: 1,
          patches: 1,
          duration_sum_s: 610,
          tokens_in_sum: 1200,
          tokens_cache_read_sum: 1_500_000,
          tokens_out_sum: 3400,
          cost_usd_sum: 0.1,
        }),
        row({
          project_id: "p2",
          runs: 4,
          completed: 3,
          failed: 1,
          features: 1,
          bugs: 1,
          chores: 1,
          patches: 1,
          duration_sum_s: 1250,
          tokens_in_sum: 800,
          tokens_cache_read_sum: 2_250_000,
          tokens_out_sum: 2100,
          cost_usd_sum: 0.2,
        }),
        row({
          project_id: "p3",
          runs: 6,
          completed: 4,
          failed: 2,
          features: 2,
          bugs: 2,
          chores: 1,
          patches: 1,
          duration_sum_s: 2000,
          tokens_in_sum: 500,
          tokens_cache_read_sum: 950_000,
          tokens_out_sum: 1500,
          cost_usd_sum: 0.35,
        }),
      ],
      [],
      three,
      ALL,
    );
    const { totals, projects } = at(report.rows, 0);
    expect(projects).toHaveLength(3);
    for (const [key, value] of Object.entries(totals)) {
      if (key === "day" || key === "cost_usd_sum") continue;
      const field = key as Exclude<keyof typeof totals, "day">;
      expect(value).toBe(projects.reduce((total, p) => total + p[field], 0));
    }
    expect(totals.cost_usd_sum).toBeCloseTo(
      projects.reduce((total, p) => total + p.cost_usd_sum, 0),
      4,
    );
    expect(totals.cost_usd_sum).toBe(0.65);
    expect(secondsLabel(totals.duration_sum_s)).toBe("1h 04m");
    expect(tokensLabel(totals.tokens_in_sum)).toBe("2.5k");
    expect(tokensLabel(totals.tokens_cache_read_sum)).toBe("4.7M");
    expect(tokensLabel(totals.tokens_out_sum)).toBe("7.0k");
    expect(costLabel(totals.cost_usd_sum)).toBe("$0.65");
  });

  it("a single project's totals equal its row", () => {
    const only = row({
      runs: 2,
      completed: 1,
      failed: 1,
      features: 2,
      duration_sum_s: 970,
      tokens_in_sum: 12,
      tokens_cache_read_sum: 345_678,
      tokens_out_sum: 9,
      cost_usd_sum: 0.42,
    });
    const report = toSummaryReport([only], [], PROJECTS, ALL);
    const { project_id: _, ...expected } = only;
    expect(at(report.rows, 0).totals).toEqual(expected);
  });

  it("carries only the day, counts and sums", () => {
    const report = toSummaryReport([row({ runs: 1 })], [], PROJECTS, ALL);
    expect(Object.keys(at(report.rows, 0).totals).sort()).toEqual(
      [
        "day",
        "runs",
        "completed",
        "failed",
        "halted",
        "features",
        "bugs",
        "chores",
        "patches",
        "duration_sum_s",
        "tokens_in_sum",
        "tokens_cache_read_sum",
        "tokens_out_sum",
        "cost_usd_sum",
      ].sort(),
    );
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
      [],
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
      [],
      PROJECTS,
      ALL,
    );
    expect(at(report.rows, 0).totals.runs).toBe(1);
    expect(at(report.rows, 0).projects).toHaveLength(1);
  });

  it("rounds the added cost to four decimals", () => {
    const report = toSummaryReport(
      [row({ project_id: "p1", cost_usd_sum: 0.1 }), row({ project_id: "p2", cost_usd_sum: 0.2 })],
      [],
      PROJECTS,
      ALL,
    );
    expect(at(report.rows, 0).totals.cost_usd_sum).toBe(0.3);
  });

  it("passes the window through", () => {
    const report = toSummaryReport([], [], PROJECTS, { days: 7, from: null, to: null });
    expect(report).toEqual({ from: null, to: null, days: 7, rows: [] });
  });

  it("does not mutate its inputs", () => {
    const rows = Object.freeze([
      Object.freeze(row({ day: "2026-10-04", project_id: "p2", runs: 1 })),
      Object.freeze(row({ day: "2026-10-05", project_id: "p1", runs: 2 })),
      Object.freeze(row({ day: "2026-10-05", project_id: "p2", runs: 3 })),
    ]);
    const projects = Object.freeze(PROJECTS.map((p) => Object.freeze({ ...p })));
    expect(() => toSummaryReport(rows, [], projects, ALL)).not.toThrow();
    expect(rows.map((r) => r.day)).toEqual(["2026-10-04", "2026-10-05", "2026-10-05"]);
  });
});

describe("toSummaryReport models", () => {
  it("are empty when no model rows exist", () => {
    const report = toSummaryReport([row({ runs: 1 })], [], PROJECTS, ALL);
    expect(at(report.rows, 0).models).toEqual([]);
  });

  it("sum a model over two projects and attach it to its day only", () => {
    const report = toSummaryReport(
      [row({ day: "2026-10-05", runs: 2 }), row({ day: "2026-10-04", runs: 1 })],
      [
        modelRow({ day: "2026-10-05", project_id: "p1", input: 1, cache_read: 100 }),
        modelRow({ day: "2026-10-05", project_id: "p2", cache_creation: 10, output: 5 }),
      ],
      PROJECTS,
      ALL,
    );
    expect(at(report.rows, 0).models).toEqual([
      {
        model: "claude-opus-4-1",
        runs: 0,
        input: 1,
        cache_read: 100,
        cache_creation: 10,
        output: 5,
        total: 116,
        cost_usd: 0,
      },
    ]);
    expect(at(report.rows, 1).models).toEqual([]);
  });

  it("drop a hidden project's model rows", () => {
    const report = toSummaryReport(
      [row({ runs: 1 })],
      [modelRow({ project_id: "p1", output: 3 }), modelRow({ project_id: "hidden", output: 900 })],
      PROJECTS,
      ALL,
    );
    expect(at(report.rows, 0).models.map((m) => m.total)).toEqual([3]);
  });

  it("do not create a day of their own", () => {
    const report = toSummaryReport(
      [row({ day: "2026-10-05", runs: 1 })],
      [modelRow({ day: "2026-10-04", output: 3 })],
      PROJECTS,
      ALL,
    );
    expect(report.rows.map((d) => d.day)).toEqual(["2026-10-05"]);
  });
});

describe("classCounts", () => {
  it("lists the classes in a fixed order, zeros omitted, other the unclassed runs", () => {
    expect(classCounts({ runs: 7, features: 0, bugs: 2, chores: 0, patches: 3 })).toEqual([
      { key: "/bug", count: 2 },
      { key: "/patch", count: 3 },
      { key: "other", count: 2 },
    ]);
    expect(classCounts({ runs: 4, features: 1, bugs: 1, chores: 1, patches: 1 })).toEqual([
      { key: "/feature", count: 1 },
      { key: "/bug", count: 1 },
      { key: "/chore", count: 1 },
      { key: "/patch", count: 1 },
    ]);
  });

  it("floors other at zero when runs are below the known sum", () => {
    expect(classCounts({ runs: 1, features: 2, bugs: 0, chores: 0, patches: 0 })).toEqual([
      { key: "/feature", count: 2 },
    ]);
  });

  it("is empty for no runs", () => {
    expect(classCounts({ runs: 0, features: 0, bugs: 0, chores: 0, patches: 0 })).toEqual([]);
  });
});

describe("columnHeights", () => {
  it("scales each value to the maximum", () => {
    expect(columnHeights([5, 10])).toEqual([50, 100]);
  });

  it("is 100 for a single value", () => {
    expect(columnHeights([7])).toEqual([100]);
  });

  it("is all zeros when every value is zero", () => {
    expect(columnHeights([0, 0])).toEqual([0, 0]);
  });

  it("is empty for no values", () => {
    expect(columnHeights([])).toEqual([]);
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
