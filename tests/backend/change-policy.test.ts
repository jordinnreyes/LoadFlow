import test from "node:test";
import assert from "node:assert/strict";
import { recalculationPolicy } from "../../server/modules/availability/change-policy.js";
const safe = {
  source: "external" as const,
  dataConfirmed: false,
  inputsCompleteAndFresh: true,
  expandsStudyLimits: false,
  releasesFixedSessions: false,
  changesOfficialDate: false,
  partialPlan: false,
  fixedConflict: false,
};
test("approved development policy permits only safe flexible recalculation and requires notice/undo", () => {
  const automatic = recalculationPolicy(safe);
  assert.equal(automatic.allowAutomaticFlexible, true);
  assert.equal(automatic.requiresDifferenceSummary, true);
  assert.equal(automatic.requiresRevalidatedUndo, true);
  assert.equal(automatic.scope, "authorized_flexible_only");
  assert.equal(
    recalculationPolicy({ ...safe, source: "student", dataConfirmed: true })
      .allowAutomaticFlexible,
    true,
  );
  assert.deepEqual(
    recalculationPolicy({ ...safe, source: "student" }).requiredConfirmations,
    ["confirm_edited_data"],
  );
});
test("unknown inputs, expanded limits, fixed conflicts, official dates and partial plans cannot autoapply", () => {
  assert.equal(
    recalculationPolicy({ ...safe, inputsCompleteAndFresh: false })
      .allowAutomaticFlexible,
    false,
  );
  const guarded = recalculationPolicy({
    ...safe,
    expandsStudyLimits: true,
    releasesFixedSessions: true,
    changesOfficialDate: true,
    partialPlan: true,
    fixedConflict: true,
  });
  assert.equal(guarded.allowAutomaticFlexible, false);
  assert.deepEqual(guarded.requiredConfirmations, [
    "expand_study_limits",
    "release_fixed_sessions",
    "academic_date_change",
    "accept_partial_plan",
    "resolve_fixed_conflict",
  ]);
});
