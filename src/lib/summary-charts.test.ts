import { describe, expect, it } from "vitest";
import type { DailySummary, RunMetrics, RunPhase, SummaryRunPoint } from "@/types/adw";
import { MODEL_COLORS, UNATTRIBUTED_COLOR } from "./class-colors";
import { toSummaryReport } from "./daily-summary";
import {
  dailyModelSplit,
  dayTicks,
  pointsByClass,
  readSummaryAggregate,
  readSummaryMetric,
  runDay,
  runDurationSeconds,
  runModels,
  SUMMARY_AGGREGATES,
  SUMMARY_METRIC_FIELD,
  SUMMARY_METRICS,
  type SummaryRun,
  summaryDayAxis,
  toAggregates,
  toRunPoints,
  toSummaryCharts,
} from "./summary-charts";

// The module under test reads no clock; every case is a fixed input.

function run(overrides: Partial<SummaryRun>): SummaryRun {
  return {
    project_id: "p1",
    adw_id: "a1",
    issue_number: 7,
    issue_title: "Seven",
    issue_class: "/feature",
    branch_name: null,
    phase: null,
    status: "completed",
    state: {},
    toolkit_version: null,
    started_at: "2026-10-05T10:00:00+00:00",
    updated_at: "2026-10-05T11:00:00+00:00",
    finished_at: "2026-10-05T11:00:00+00:00",
    run_metrics: null,
    ...overrides,
  };
}

function phase(overrides: Partial<RunPhase>): RunPhase {
  return {
    phase: "build",
    started_at: "2026-10-05T10:00:00+00:00",
    finished_at: "2026-10-05T10:30:00+00:00",
    duration_s: 1800,
    tokens_in: 0,
    tokens_cache_read: 0,
    tokens_cache_creation: 0,
    tokens_out: 0,
    cost_usd: 0,
    calls: 1,
    ...overrides,
  };
}

function usage(input: number, output: number, cost: number) {
  return { input, cache_read: 0, cache_creation: 0, output, cost_usd: cost };
}

function metrics(overrides: Partial<RunMetrics>): RunMetrics {
  return {
    project_id: "p1",
    adw_id: "a1",
    tokens_in: 0,
    tokens_out: 0,
    tokens_cache_read: 0,
    tokens_cache_creation: 0,
    cost_usd: 0,
    attempts: 1,
    gate_outcome: "merged",
    phases: [],
    plan_lines: null,
    diff_added: null,
    diff_removed: null,
    diff_files: null,
    computed_at: "2026-10-05T11:00:00+00:00",
    updated_at: "2026-10-05T11:00:00+00:00",
    ...overrides,
  };
}

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
const BETA = { id: "p2", slug: "SBub/beta", display_name: "Beta" };
const PROJECTS = [ALPHA, BETA];
const AXIS = ["2026-10-04", "2026-10-05"];

/** The item at `index`, failing the test when it is missing. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

describe("readSummaryMetric and readSummaryAggregate", () => {
  it("keep every valid key", () => {
    for (const { key } of SUMMARY_METRICS) expect(readSummaryMetric(key)).toBe(key);
    for (const { key } of SUMMARY_AGGREGATES) expect(readSummaryAggregate(key)).toBe(key);
  });

  it("are the defaults for absent, repeated, empty, other case and unknown", () => {
    for (const raw of [undefined, ["cost", "tokens_in"], "", "Cost", "bogus"]) {
      expect(readSummaryMetric(raw)).toBe("duration");
      expect(readSummaryAggregate(raw)).toBe("runs");
    }
  });
});

describe("SUMMARY_METRIC_FIELD", () => {
  it("picks the point field of every metric", () => {
    const point = {
      duration_s: 60,
      tokens_in: 1000,
      tokens_out: 200,
      cost_usd: 1.25,
    } as SummaryRunPoint;
    expect(SUMMARY_METRICS.map(({ key }) => point[SUMMARY_METRIC_FIELD[key]])).toEqual([
      60, 1000, 200, 1.25,
    ]);
  });
});

describe("summaryDayAxis", () => {
  it("is the one day when from and to agree", () => {
    expect(summaryDayAxis("2026-10-05", "2026-10-05")).toEqual(["2026-10-05"]);
  });

  it("crosses a month end", () => {
    expect(summaryDayAxis("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("includes a leap day", () => {
    expect(summaryDayAxis("2028-02-28", "2028-03-01")).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("is empty when either end is null", () => {
    expect(summaryDayAxis(null, "2026-10-05")).toEqual([]);
    expect(summaryDayAxis("2026-10-05", null)).toEqual([]);
  });
});

describe("dayTicks", () => {
  it("labels every day up to two weeks", () => {
    expect(dayTicks(Array.from({ length: 14 }, (_, i) => String(i)))).toHaveLength(14);
  });

  it("labels every seventh day beyond", () => {
    expect(dayTicks(Array.from({ length: 30 }, (_, i) => String(i)))).toEqual([0, 7, 14, 21, 28]);
  });
});

describe("runDay", () => {
  it("is the UTC day", () => {
    expect(runDay("2026-10-05T23:59:59+00:00")).toBe("2026-10-05");
  });

  it("converts an offset to UTC", () => {
    expect(runDay("2026-10-06T00:30:00+01:00")).toBe("2026-10-05");
  });
});

describe("runDurationSeconds", () => {
  it("is whole seconds", () => {
    expect(runDurationSeconds("2026-10-05T10:00:00Z", "2026-10-05T10:01:30.900Z")).toBe(90);
  });

  it("clamps a negative span to zero", () => {
    expect(runDurationSeconds("2026-10-05T10:00:00Z", "2026-10-05T09:00:00Z")).toBe(0);
  });
});

describe("runModels", () => {
  it("is distinct and sorted across phases", () => {
    expect(
      runModels([
        phase({ models: { "model-b": usage(1, 1, 0), "model-a": usage(1, 1, 0) } }),
        phase({ models: { "model-a": usage(1, 1, 0) } }),
        phase({}),
      ]),
    ).toEqual(["model-a", "model-b"]);
  });
});

describe("toRunPoints", () => {
  const runs = [
    run({ adw_id: "b", finished_at: "2026-10-05T12:00:00+00:00" }),
    run({ adw_id: "c", finished_at: "2026-10-05T09:00:00+00:00" }),
    run({ adw_id: "a", finished_at: "2026-10-04T12:00:00+00:00" }),
  ];

  it("groups by day, oldest first, ordered by finish time inside a day", () => {
    const points = toRunPoints(runs, PROJECTS, AXIS);
    expect(points.map((p) => [p.day, p.adw_id])).toEqual([
      ["2026-10-04", "a"],
      ["2026-10-05", "c"],
      ["2026-10-05", "b"],
    ]);
  });

  it("spreads a day's runs deterministically inside the day band", () => {
    const points = toRunPoints(runs, PROJECTS, AXIS);
    expect(at(points, 0).x).toBe(0);
    expect(at(points, 1).x).toBeCloseTo(1 - 0.8 / 6, 10);
    expect(at(points, 2).x).toBeCloseTo(1 + 0.8 / 6, 10);
  });

  it("keeps many runs of one day inside the band", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      run({ adw_id: `r${String(i).padStart(2, "0")}` }),
    );
    for (const point of toRunPoints(many, PROJECTS, AXIS)) {
      expect(point.x).toBeGreaterThan(0.6);
      expect(point.x).toBeLessThan(1.4);
    }
  });

  it("breaks a finish time tie by adw_id", () => {
    const tied = [run({ adw_id: "z" }), run({ adw_id: "m" })];
    expect(toRunPoints(tied, PROJECTS, AXIS).map((p) => p.adw_id)).toEqual(["m", "z"]);
  });

  it("drops a run of an unknown project and a run off the axis", () => {
    const points = toRunPoints(
      [
        run({ project_id: "hidden" }),
        run({ adw_id: "old", finished_at: "2026-10-01T10:00:00+00:00" }),
        run({ adw_id: "kept" }),
      ],
      PROJECTS,
      AXIS,
    );
    expect(points.map((p) => p.adw_id)).toEqual(["kept"]);
  });

  it("gives a run without metrics a duration but no tokens, cost or attempts", () => {
    const point = at(toRunPoints([run({})], PROJECTS, AXIS), 0);
    expect(point).toMatchObject({
      slug: "SBub/alpha",
      display_name: "Alpha",
      duration_s: 3600,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      attempts: null,
      models: [],
      phases: [],
    });
  });

  it("maps the metrics, the phases and an unknown class", () => {
    const point = at(
      toRunPoints(
        [
          run({
            issue_class: "/spike",
            status: "failed",
            run_metrics: metrics({
              tokens_in: 100,
              tokens_out: 20,
              cost_usd: 1.5,
              attempts: 2,
              phases: [
                phase({
                  phase: "plan",
                  tokens_in: 100,
                  tokens_out: 20,
                  cost_usd: 1.5,
                  models: { "model-b": usage(60, 10, 1), "model-a": usage(40, 10, 0.5) },
                }),
              ],
            }),
          }),
        ],
        PROJECTS,
        AXIS,
      ),
      0,
    );
    expect(point).toMatchObject({
      issue_class: "other",
      status: "failed",
      tokens_in: 100,
      tokens_out: 20,
      cost_usd: 1.5,
      attempts: 2,
      models: ["model-a", "model-b"],
      phases: [
        {
          phase: "plan",
          duration_s: 1800,
          tokens_in: 100,
          tokens_out: 20,
          cost_usd: 1.5,
          models: ["model-a", "model-b"],
        },
      ],
    });
  });
});

describe("pointsByClass", () => {
  const points = toRunPoints(
    [
      run({ adw_id: "f", run_metrics: metrics({ cost_usd: 1 }) }),
      run({ adw_id: "b", issue_class: "/bug" }),
    ],
    PROJECTS,
    AXIS,
  );

  it("splits by class in chart order for a metric every point has", () => {
    const { classes, missing } = pointsByClass(points, "duration");
    expect(classes.map((c) => [c.key, c.points.map((p) => p.adw_id)])).toEqual([
      ["/feature", ["f"]],
      ["/bug", ["b"]],
    ]);
    expect(missing).toBe(0);
  });

  it("leaves out and counts the points without a value", () => {
    const { classes, missing } = pointsByClass(points, "cost");
    expect(classes.map((c) => c.key)).toEqual(["/feature"]);
    expect(missing).toBe(1);
  });
});

describe("dailyModelSplit", () => {
  it("sums two models across phases and leaves no remainder when all is attributed", () => {
    const split = dailyModelSplit([
      run({
        run_metrics: metrics({
          tokens_in: 100,
          tokens_out: 30,
          cost_usd: 3,
          phases: [
            phase({ models: { "model-a": usage(50, 10, 1) } }),
            phase({ models: { "model-a": usage(20, 10, 1), "model-b": usage(30, 10, 1) } }),
          ],
        }),
      }),
    ]);
    expect(split.get("2026-10-05")).toEqual({
      models: {
        "model-a": { input: 70, output: 20, cost_usd: 2 },
        "model-b": { input: 30, output: 10, cost_usd: 1 },
      },
      unattributed: { input: 0, output: 0, cost_usd: 0 },
    });
  });

  it("puts a run whose phases have no models entirely in unattributed", () => {
    const split = dailyModelSplit([
      run({
        run_metrics: metrics({
          tokens_in: 100,
          tokens_out: 30,
          cost_usd: 2.5,
          phases: [phase({})],
        }),
      }),
    ]);
    expect(split.get("2026-10-05")).toEqual({
      models: {},
      unattributed: { input: 100, output: 30, cost_usd: 2.5 },
    });
  });

  it("keeps the remainder of a partial attribution and never goes negative", () => {
    const split = dailyModelSplit([
      run({
        adw_id: "partial",
        run_metrics: metrics({
          tokens_in: 100,
          tokens_out: 30,
          cost_usd: 2,
          phases: [phase({ models: { "model-a": usage(60, 40, 0.5) } })],
        }),
      }),
      run({
        adw_id: "over",
        run_metrics: metrics({
          tokens_in: 10,
          tokens_out: 10,
          cost_usd: 0.1,
          phases: [phase({ models: { "model-a": usage(11, 10, 0.1001) } })],
        }),
      }),
    ]);
    expect(split.get("2026-10-05")?.unattributed).toEqual({ input: 40, output: 0, cost_usd: 1.5 });
  });

  it("ignores a run without metrics", () => {
    expect(dailyModelSplit([run({})]).size).toBe(0);
  });
});

describe("toAggregates", () => {
  const report = toSummaryReport(
    [
      row({
        day: "2026-10-05",
        project_id: "p1",
        runs: 3,
        features: 2,
        bugs: 0,
        median_duration_s: 600,
      }),
      row({ day: "2026-10-05", project_id: "p2", runs: 1, bugs: 1, median_duration_s: 900 }),
    ],
    PROJECTS,
    { days: 2, project: null, from: "2026-10-04", to: "2026-10-05" },
  );
  const split = dailyModelSplit([
    run({
      run_metrics: metrics({
        tokens_in: 100,
        tokens_out: 30,
        cost_usd: 3,
        phases: [phase({ models: { "model-b": usage(50, 10, 1), "model-a": usage(50, 20, 2) } })],
      }),
    }),
  ]);
  const charts = toAggregates(report.rows, AXIS, split);

  it("stacks the runs per class with zeros on an empty day", () => {
    expect(charts.runs.unit).toBe("count");
    expect(charts.runs.series.map((s) => [s.key, s.stack])).toEqual([
      ["feature", "runs"],
      ["bug", "runs"],
      ["chore", "runs"],
      ["patch", "runs"],
      ["other", "runs"],
    ]);
    expect(charts.runs.rows).toEqual([
      { x: 0, day: "2026-10-04", feature: 0, bug: 0, chore: 0, patch: 0, other: 0 },
      { x: 1, day: "2026-10-05", feature: 2, bug: 1, chore: 0, patch: 0, other: 1 },
    ]);
  });

  it("gives the class distribution in percent summing to 100, null on an empty day", () => {
    const [empty, full] = charts.classes.rows;
    expect(empty).toMatchObject({ feature: null, bug: null, other: null });
    expect(full).toMatchObject({ feature: 50, bug: 25, chore: 0, patch: 0, other: 25 });
    const sum = ["feature", "bug", "chore", "patch", "other"].reduce(
      (total, key) => total + Number(full?.[key] ?? 0),
      0,
    );
    expect(sum).toBe(100);
  });

  it("keeps each project's median as its own series, never a combined median", () => {
    expect(charts.duration.series.map((s) => [s.key, s.label, s.stack])).toEqual([
      ["project_0", "Alpha", null],
      ["project_1", "Beta", null],
    ]);
    expect(charts.duration.rows).toEqual([
      { x: 0, day: "2026-10-04", project_0: null, project_1: null },
      { x: 1, day: "2026-10-05", project_0: 600, project_1: 900 },
    ]);
  });

  it("is one duration series with a project selected", () => {
    const one = toSummaryReport(
      [row({ project_id: "p2", runs: 1, median_duration_s: 900 })],
      PROJECTS,
      { days: 2, project: BETA, from: "2026-10-04", to: "2026-10-05" },
    );
    expect(toAggregates(one.rows, AXIS, new Map()).duration.series.map((s) => s.label)).toEqual([
      "Beta",
    ]);
  });

  it("stacks tokens in and out per model, sorted, without an all-zero unattributed series", () => {
    expect(charts.tokens.series.map((s) => [s.key, s.label, s.stack])).toEqual([
      ["in_0", "in: model-a", "in"],
      ["in_1", "in: model-b", "in"],
      ["out_0", "out: model-a", "out"],
      ["out_1", "out: model-b", "out"],
    ]);
    expect(at(charts.tokens.rows, 1)).toMatchObject({ in_0: 50, in_1: 50, out_0: 20, out_1: 10 });
    expect(at(charts.tokens.rows, 0)).toMatchObject({ in_0: 0, out_1: 0 });
  });

  it("gives a model the same colour in tokens and cost", () => {
    expect(charts.cost.series.map((s) => [s.label, s.color])).toEqual([
      ["model-a", MODEL_COLORS[0]],
      ["model-b", MODEL_COLORS[1]],
    ]);
    expect(at(charts.tokens.series, 0).color).toBe(MODEL_COLORS[0]);
    expect(at(charts.tokens.series, 3).color).toBe(MODEL_COLORS[1]);
    expect(at(charts.cost.rows, 1)).toMatchObject({ cost_0: 2, cost_1: 1 });
  });

  it("adds the unattributed series only when it is non-zero somewhere", () => {
    const rest = dailyModelSplit([
      run({ run_metrics: metrics({ tokens_in: 10, tokens_out: 0, cost_usd: 0.5 }) }),
    ]);
    const withRest = toAggregates(report.rows, AXIS, rest);
    expect(withRest.tokens.series.map((s) => s.key)).toEqual(["in_unattributed"]);
    expect(withRest.cost.series).toEqual([
      { key: "cost_unattributed", label: "unattributed", stack: "cost", color: UNATTRIBUTED_COLOR },
    ]);
    expect(at(withRest.cost.rows, 1)).toMatchObject({ cost_unattributed: 0.5 });
  });
});

describe("toSummaryCharts", () => {
  it("has no day, point or row for an empty window", () => {
    const charts = toSummaryCharts([run({})], { from: null, to: null, rows: [] }, PROJECTS);
    expect(charts.days).toEqual([]);
    expect(charts.points).toEqual([]);
    for (const chart of Object.values(charts.aggregates)) expect(chart.rows).toEqual([]);
  });

  it("carries the runs of visible projects as points and ignores hidden ones in the split", () => {
    const charts = toSummaryCharts(
      [
        run({ adw_id: "seen" }),
        run({
          adw_id: "hidden",
          project_id: "hidden",
          run_metrics: metrics({ tokens_in: 5, cost_usd: 1 }),
        }),
      ],
      { from: "2026-10-04", to: "2026-10-05", rows: [] },
      PROJECTS,
    );
    expect(charts.days).toEqual(AXIS);
    expect(charts.points.map((p) => p.adw_id)).toEqual(["seen"]);
    expect(charts.aggregates.cost.series).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const runs = Object.freeze([
      Object.freeze(run({ adw_id: "b", finished_at: "2026-10-05T12:00:00+00:00" })),
      Object.freeze(run({ adw_id: "a", finished_at: "2026-10-05T09:00:00+00:00" })),
    ]);
    expect(() =>
      toSummaryCharts(runs, { from: "2026-10-04", to: "2026-10-05", rows: [] }, PROJECTS),
    ).not.toThrow();
    expect(runs.map((r) => r.adw_id)).toEqual(["b", "a"]);
  });
});
