import {
  INPUT_POLICY_VERSION,
  type RecalculationInput,
  type RecalculationConfirmation,
} from "../../../packages/contracts/planning-inputs.js";
export function recalculationPolicy(input: RecalculationInput) {
  const required: RecalculationConfirmation[] = [];
  if (input.source === "student" && !input.dataConfirmed)
    required.push("confirm_edited_data");
  if (input.expandsStudyLimits) required.push("expand_study_limits");
  if (input.releasesFixedSessions) required.push("release_fixed_sessions");
  if (input.changesOfficialDate) required.push("academic_date_change");
  if (input.partialPlan) required.push("accept_partial_plan");
  if (input.fixedConflict) required.push("resolve_fixed_conflict");
  return {
    policyVersion: INPUT_POLICY_VERSION,
    allowAutomaticFlexible:
      input.inputsCompleteAndFresh && required.length === 0,
    requiredConfirmations: required,
    requiresDifferenceSummary: true,
    requiresRevalidatedUndo: true,
    blockedByUnknownInputs: !input.inputsCompleteAndFresh,
    scope: "authorized_flexible_only" as const,
  };
}
