import { describe, expect, it } from "vitest";
import { PHASE_ORDER } from "./phase-usage";
import { phaseLabel } from "./run-phase";

describe("phaseLabel", () => {
  it.each([
    ["ensure_adw_id", "Starting"],
    ["adw_sdlc_iso:composer", "Starting"],
    ["adw_plan_build_iso:composer", "Starting"],
    ["queue:classification", "Classifying"],
    ["adw_plan_iso", "Planning"],
    ["adw_build_iso", "Building"],
    ["adw_test_iso", "Testing"],
    ["adw_review_iso", "Reviewing"],
    ["adw_document_iso", "Documenting"],
    ["adw_ci_iso", "Checking CI"],
    ["adw_patch_iso", "Patching"],
    ["adw_plan_iso:failed", "Planning"],
    ["adw_build_iso:failed", "Building"],
    ["adw_test_iso:failed", "Testing"],
    ["adw_review_iso:failed", "Reviewing"],
    ["adw_document_iso:failed", "Documenting"],
    ["adw_ci_iso:failed", "Checking CI"],
    ["adw_patch_iso:failed", "Patching"],
    ["ensure_adw_id:failed", "Starting"],
    ["queue:classification:failed", "Classifying"],
    ["adw_plan_iso:complete", "Plan done"],
    ["adw_build_iso:complete", "Build done"],
    ["adw_test_iso:complete", "Tests done"],
    ["adw_review_iso:complete", "Review done"],
    ["adw_document_iso:complete", "Docs done"],
    ["adw_ci_iso:complete", "CI done"],
    ["adw_patch_iso:complete", "Patch done"],
    ["adw_sdlc_iso:complete", "Complete"],
    ["adw_plan_build_iso:complete", "Complete"],
    ["foo:complete", "Complete"],
  ])("labels %s as %s", (raw, label) => {
    expect(phaseLabel(raw)).toBe(label);
  });

  it("keeps null as null", () => {
    expect(phaseLabel(null)).toBeNull();
  });

  it.each(["adw_new_iso", "adw_new_iso:failed", "adw_sdlc_iso:failed", "toString", "__proto__"])(
    "returns the unknown value %s raw",
    (raw) => {
      expect(phaseLabel(raw)).toBe(raw);
    },
  );

  it.each(PHASE_ORDER)("labels the costed key %s with a word, not the key", (key) => {
    const label = phaseLabel(key);
    expect(label).not.toBe(key);
    expect(label?.startsWith("adw_")).toBe(false);
  });

  it.each(PHASE_ORDER)("labels %s:complete with a done label, not Complete", (key) => {
    const label = phaseLabel(`${key}:complete`);
    expect(label).not.toBe("Complete");
    expect(label?.startsWith("adw_")).toBe(false);
  });
});
