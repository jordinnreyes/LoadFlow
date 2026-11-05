import test from "node:test";
import assert from "node:assert/strict";
import {
  academicInstant,
  effortState,
  confirmReopening,
  requireRevision,
} from "../../server/modules/academics/policy.js";
test("unknown dates/times stay partial and DST ambiguity is rejected", () => {
  assert.equal(academicInstant("2026-11-10", null, "America/Lima"), null);
  assert.equal(academicInstant("2026-11-10", "10:00", null), null);
  assert.equal(
    academicInstant("2026-11-10", "10:00", "America/Lima"),
    "2026-11-10T15:00:00Z",
  );
  assert.throws(() => academicInstant("2026-02-30", "10:00", "America/Lima"));
  assert.throws(() =>
    academicInstant("2026-11-01", "01:30", "America/New_York"),
  );
  assert.throws(() =>
    academicInstant("2026-03-08", "02:30", "America/New_York"),
  );
});
test("zero and real time corrections do not imply preparation completed", () => {
  assert.deepEqual(effortState(null, null, null, "new"), {
    pendingMinutes: null,
    needsReview: true,
  });
  assert.deepEqual(effortState(0, null, null, "new"), {
    pendingMinutes: 0,
    needsReview: true,
  });
  assert.equal(effortState(60, 90, null, "progress").needsReview, true);
  assert.equal(effortState(60, 90, 30, "progress").pendingMinutes, 30);
  assert.equal(effortState(60, 20, null, "progress").pendingMinutes, 40);
  assert.equal(effortState(null, null, null, "done").pendingMinutes, 0);
  assert.throws(() => confirmReopening("done", "progress", false, 30));
  assert.throws(() => confirmReopening("done", "progress", true, null));
  assert.doesNotThrow(() => confirmReopening("done", "progress", true, 30));
});
test("version preconditions reject absent and outdated edits", () => {
  assert.throws(() => requireRevision(undefined, "activity", 1), {
    status: 428,
  });
  assert.throws(() => requireRevision('"activity-1"', "activity", 2), {
    status: 412,
  });
  assert.doesNotThrow(() => requireRevision('"activity-2"', "activity", 2));
});
