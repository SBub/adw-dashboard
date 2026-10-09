// The phase of a run row as a user-facing word: the raw step key the toolkit
// writes to runs.phase (ADWState.save(workflow_step)) mapped to Planning,
// Building, ..., Complete. The toolkit writes `:complete` twice over:
// `<step>:complete` after each phase while the run is still running (shown as
// that step's done label, e.g. Build done) and `<composer>:complete` when the
// whole run is done (Complete). Pure: no clock, no cache, no IO; tested in
// src/lib/run-phase.test.ts. The costed step keys are PHASE_ORDER in
// src/lib/phase-usage.ts, so they are spelled once.
import type { PhaseKey } from "@/lib/phase-usage";

type StepLabel = { active: string; done?: string };

const COSTED_STEP_LABELS: Record<PhaseKey, Required<StepLabel>> = {
  adw_plan_iso: { active: "Planning", done: "Plan done" },
  adw_build_iso: { active: "Building", done: "Build done" },
  adw_test_iso: { active: "Testing", done: "Tests done" },
  adw_review_iso: { active: "Reviewing", done: "Review done" },
  adw_document_iso: { active: "Documenting", done: "Docs done" },
};

const STEP_LABELS: ReadonlyMap<string, StepLabel> = new Map<string, StepLabel>(
  Object.entries({
    ensure_adw_id: { active: "Starting" },
    "queue:classification": { active: "Classifying" },
    ...COSTED_STEP_LABELS,
    adw_ci_iso: { active: "Checking CI", done: "CI done" },
    adw_patch_iso: { active: "Patching", done: "Patch done" },
  }),
);

const COMPOSER_SUFFIX = ":composer";
const COMPLETE_SUFFIX = ":complete";
const FAILED_SUFFIX = ":failed";

/**
 * The label of a run's phase, resolved in this order: null stays null; an
 * exact step key returns its label (exact first, because
 * `queue:classification` itself contains a colon); any `<composer>:composer`
 * is Starting; `<step>:complete` on a step with a done label returns it (the
 * run is between phases) and any other `<prefix>:complete` is a composer's,
 * so Complete (`ensure_adw_id` and `queue:classification` have no done label;
 * the toolkit never writes them with `:complete`); `<step>:failed` on a known
 * step returns that step's label (the status pill already says it failed).
 * Anything else is returned raw, so a new toolkit step is never hidden.
 */
export function phaseLabel(phase: string | null): string | null {
  if (phase === null) return null;
  const exact = STEP_LABELS.get(phase);
  if (exact !== undefined) return exact.active;
  if (phase.endsWith(COMPOSER_SUFFIX)) return "Starting";
  if (phase.endsWith(COMPLETE_SUFFIX)) {
    const step = STEP_LABELS.get(phase.slice(0, -COMPLETE_SUFFIX.length));
    return step?.done ?? "Complete";
  }
  if (phase.endsWith(FAILED_SUFFIX)) {
    const step = STEP_LABELS.get(phase.slice(0, -FAILED_SUFFIX.length));
    if (step !== undefined) return step.active;
  }
  return phase;
}
