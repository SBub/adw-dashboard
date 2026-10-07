import { describe, expect, it } from "vitest";
import type { DailyPhaseSummary } from "@/types/adw";
import { PHASE_ORDER, phaseName, sumPhaseUsage } from "./phase-usage";

function row(overrides: Partial<DailyPhaseSummary>): DailyPhaseSummary {
  return {
    project_id: "p1",
    day: "2026-10-05",
    phase: "adw_build_iso",
    runs: 0,
    input: 0,
    cache_read: 0,
    cache_creation: 0,
    output: 0,
    cost_usd: 0,
    duration_s: 0,
    ...overrides,
  };
}

describe("PHASE_ORDER", () => {
  it("is the five costed phases in pipeline order, without CI", () => {
    expect(PHASE_ORDER).toEqual([
      "adw_plan_iso",
      "adw_build_iso",
      "adw_test_iso",
      "adw_review_iso",
      "adw_document_iso",
    ]);
    expect(PHASE_ORDER).not.toContain("adw_ci_iso");
  });
});

describe("phaseName", () => {
  it.each([
    ["adw_plan_iso", "Plan"],
    ["adw_build_iso", "Build"],
    ["adw_test_iso", "Test"],
    ["adw_review_iso", "Review"],
    ["adw_document_iso", "Document"],
  ] as const)("%s is %s", (phase, name) => {
    expect(phaseName(phase)).toBe(name);
  });
});

describe("sumPhaseUsage", () => {
  it("is empty for no rows", () => {
    expect(sumPhaseUsage([])).toEqual([]);
  });

  it("returns the phases in pipeline order whatever the input order", () => {
    const phases = sumPhaseUsage([
      row({ phase: "adw_document_iso" }),
      row({ phase: "adw_review_iso" }),
      row({ phase: "adw_test_iso" }),
      row({ phase: "adw_build_iso" }),
      row({ phase: "adw_plan_iso" }),
    ]);
    expect(phases.map((p) => p.phase)).toEqual([...PHASE_ORDER]);
  });

  it("sums one phase's rows across projects, column for column", () => {
    expect(
      sumPhaseUsage([
        row({
          project_id: "p1",
          runs: 1,
          input: 10,
          cache_read: 1000,
          cache_creation: 100,
          output: 5,
          cost_usd: 1.5,
          duration_s: 60,
        }),
        row({
          project_id: "p2",
          runs: 2,
          input: 20,
          cache_read: 2000,
          cache_creation: 200,
          output: 7,
          cost_usd: 0.25,
          duration_s: 90,
        }),
      ]),
    ).toEqual([
      {
        phase: "adw_build_iso",
        runs: 3,
        input: 30,
        cache_read: 3000,
        cache_creation: 300,
        output: 12,
        cost_usd: 1.75,
        duration_s: 150,
      },
    ]);
  });

  it("rounds the summed cost to four decimals", () => {
    expect(
      sumPhaseUsage([
        row({ project_id: "p1", cost_usd: 0.1 }),
        row({ project_id: "p2", cost_usd: 0.2 }),
      ])[0]?.cost_usd,
    ).toBe(0.3);
    expect(
      sumPhaseUsage([
        row({ project_id: "p1", cost_usd: 1.23456 }),
        row({ project_id: "p2", cost_usd: 1 }),
      ])[0]?.cost_usd,
    ).toBe(2.2346);
  });

  it("drops CI and unknown phase keys", () => {
    const phases = sumPhaseUsage([
      row({ phase: "adw_ci_iso", cost_usd: 5 }),
      row({ phase: "adw_foo_iso", cost_usd: 5 }),
      row({ phase: "", cost_usd: 5 }),
      row({ phase: "adw_test_iso", cost_usd: 1 }),
    ]);
    expect(phases.map((p) => p.phase)).toEqual(["adw_test_iso"]);
  });

  it("is empty when only CI rows are given", () => {
    expect(sumPhaseUsage([row({ phase: "adw_ci_iso", runs: 3 })])).toEqual([]);
  });

  it("omits a phase with no rows", () => {
    const phases = sumPhaseUsage([row({ phase: "adw_test_iso" }), row({ phase: "adw_build_iso" })]);
    expect(phases.map((p) => p.phase)).toEqual(["adw_build_iso", "adw_test_iso"]);
  });

  it("keeps a phase with rows at zero cost", () => {
    const phases = sumPhaseUsage([row({ phase: "adw_review_iso", runs: 1, cost_usd: 0 })]);
    expect(phases).toHaveLength(1);
    expect(phases[0]?.cost_usd).toBe(0);
  });

  it("does not mutate its input", () => {
    const rows = [
      row({ project_id: "p1", input: 1, cost_usd: 0.1 }),
      row({ project_id: "p2", input: 2, cost_usd: 0.2 }),
    ];
    const before = structuredClone(rows);
    sumPhaseUsage(rows);
    expect(rows).toEqual(before);
    const frozen = Object.freeze(rows.map((r) => Object.freeze({ ...r })));
    expect(() => sumPhaseUsage(frozen)).not.toThrow();
  });
});
