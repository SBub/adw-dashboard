import { describe, expect, it } from "vitest";
import type { DailyModelSummary } from "@/types/adw";
import { modelFamily, modelShortName, sumModelUsage } from "./model-usage";

function row(overrides: Partial<DailyModelSummary>): DailyModelSummary {
  return {
    project_id: "p1",
    day: "2026-10-05",
    model: "claude-opus-4-1-20250805",
    runs: 0,
    input: 0,
    cache_read: 0,
    cache_creation: 0,
    output: 0,
    cost_usd: 0,
    ...overrides,
  };
}

describe("modelFamily", () => {
  it.each([
    ["claude-opus-4-1-20250805", "opus"],
    ["claude-sonnet-4-5", "sonnet"],
    ["claude-haiku-4-5-20251001", "haiku"],
    ["opus", "opus"],
    ["claude-opus-4-6[1m]", "opus"],
    ["Claude-Sonnet-4", "sonnet"],
    ["gpt-x", "other"],
    ["", "other"],
  ])("%s is %s", (model, family) => {
    expect(modelFamily(model)).toBe(family);
  });
});

describe("modelShortName", () => {
  it.each([
    ["claude-opus-4-1-20250805", "Opus"],
    ["claude-sonnet-4-5", "Sonnet"],
    ["claude-haiku-4-5-20251001", "Haiku"],
    ["opus", "Opus"],
    ["claude-opus-4-6[1m]", "Opus"],
    ["gpt-x", "gpt-x"],
    ["claude-foo", "foo"],
    ["", "unknown"],
  ])("%s is %s", (model, name) => {
    expect(modelShortName(model)).toBe(name);
  });
});

describe("sumModelUsage", () => {
  it("is empty for no rows", () => {
    expect(sumModelUsage([])).toEqual([]);
  });

  it("sums one model's rows across projects, the total adding all four token columns", () => {
    expect(
      sumModelUsage([
        row({
          project_id: "p1",
          runs: 1,
          input: 10,
          cache_read: 1000,
          cache_creation: 100,
          output: 5,
          cost_usd: 1.5,
        }),
        row({
          project_id: "p2",
          runs: 2,
          input: 20,
          cache_read: 2000,
          cache_creation: 200,
          output: 7,
          cost_usd: 0.25,
        }),
      ]),
    ).toEqual([
      {
        model: "claude-opus-4-1-20250805",
        runs: 3,
        input: 30,
        cache_read: 3000,
        cache_creation: 300,
        output: 12,
        total: 3342,
        cost_usd: 1.75,
      },
    ]);
  });

  it("keeps two models, and two versions of one family, apart", () => {
    const models = sumModelUsage([
      row({ model: "claude-opus-4-1", input: 1 }),
      row({ model: "claude-opus-4-6", input: 2 }),
      row({ model: "claude-sonnet-4-5", input: 3 }),
    ]);
    expect(models.map((m) => m.model)).toEqual([
      "claude-sonnet-4-5",
      "claude-opus-4-6",
      "claude-opus-4-1",
    ]);
  });

  it("orders by total, largest first, then by model id", () => {
    const models = sumModelUsage([
      row({ model: "b", output: 5 }),
      row({ model: "a", output: 5 }),
      row({ model: "c", output: 9 }),
    ]);
    expect(models.map((m) => m.model)).toEqual(["c", "a", "b"]);
  });

  it("rounds the summed cost to four decimals", () => {
    const [model] = sumModelUsage([
      row({ project_id: "p1", cost_usd: 0.1 }),
      row({ project_id: "p2", cost_usd: 0.2 }),
    ]);
    expect(model?.cost_usd).toBe(0.3);
  });

  it("does not mutate its input", () => {
    const rows = Object.freeze([
      Object.freeze(row({ project_id: "p1", input: 1 })),
      Object.freeze(row({ project_id: "p2", input: 2 })),
    ]);
    expect(() => sumModelUsage(rows)).not.toThrow();
    expect(rows.map((r) => r.input)).toEqual([1, 2]);
  });
});
