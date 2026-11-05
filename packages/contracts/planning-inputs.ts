// Approved development policy. This classifies authorizations for F4; it does
// not generate or apply a plan in F2.
export const INPUT_POLICY_VERSION = "development-2026-11-04";
export type RecalculationInput = {
  source: "student" | "external";
  dataConfirmed: boolean;
  inputsCompleteAndFresh: boolean;
  expandsStudyLimits: boolean;
  releasesFixedSessions: boolean;
  changesOfficialDate: boolean;
  partialPlan: boolean;
  fixedConflict: boolean;
};
export type RecalculationConfirmation =
  | "confirm_edited_data"
  | "expand_study_limits"
  | "release_fixed_sessions"
  | "academic_date_change"
  | "accept_partial_plan"
  | "resolve_fixed_conflict";
