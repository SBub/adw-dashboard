// The phase of a run row as a user-facing word: the raw step key the toolkit
// writes to runs.phase (ADWState.save(workflow_step)) mapped to Planning,
// Building, ..., Complete. Pure: no clock, no cache, no IO; tested in
// src/lib/run-phase.test.ts. The costed step keys are PHASE_ORDER in
// src/lib/phase-usage.ts, so they are spelled once.
import type { PhaseKey } from "@/lib/phase-usage";

const COSTED_STEP_LABELS: Record<PhaseKey, string> = {
  adw_plan_iso: "Planning",
  adw_build_iso: "Building",
  adw_test_iso: "Testing",
  adw_review_iso: "Reviewing",
  adw_document_iso: "Documenting",
};

const STEP_LABELS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    ensure_adw_id: "Starting",
    "queue:classification": "Classifying",
    ...COSTED_STEP_LABELS,
    adw_ci_iso: "Checking CI",
    adw_patch_iso: "Patching",
  }),
);

const COMPOSER_SUFFIX = ":composer";
const COMPLETE_SUFFIX = ":complete";
const FAILED_SUFFIX = ":failed";

/**
 * The label of a run's phase, resolved in this order: null stays null; an
 * exact step key returns its label (exact first, because
 * `queue:classification` itself contains a colon); any `<composer>:composer`
 * is Starting and any `<composer>:complete` is Complete; `<step>:failed` on a
 * known step returns that step's label (the status pill already says it
 * failed). Anything else is returned raw, so a new toolkit step is never
 * hidden.
 */
export function phaseLabel(phase: string | null): string | null {
  if (phase === null) return null;
  const exact = STEP_LABELS.get(phase);
  if (exact !== undefined) return exact;
  if (phase.endsWith(COMPOSER_SUFFIX)) return "Starting";
  if (phase.endsWith(COMPLETE_SUFFIX)) return "Complete";
  if (phase.endsWith(FAILED_SUFFIX)) {
    const step = STEP_LABELS.get(phase.slice(0, -FAILED_SUFFIX.length));
    if (step !== undefined) return step;
  }
  return phase;
}
