-- Per-activity revisions provide deterministic history ordering even with a fixed
-- injected clock or two confirmations sharing the same timestamp.
ALTER TABLE app.effort_confirmations ADD COLUMN activity_revision integer NOT NULL DEFAULT 1 CHECK(activity_revision>0);
ALTER TABLE app.progress_revisions ADD COLUMN activity_revision integer NOT NULL DEFAULT 1 CHECK(activity_revision>0);
ALTER TABLE app.academic_date_revisions ADD COLUMN activity_revision integer NOT NULL DEFAULT 1 CHECK(activity_revision>0);
CREATE UNIQUE INDEX effort_revision_once ON app.effort_confirmations(owner_id,activity_id,activity_revision);
CREATE UNIQUE INDEX progress_revision_once ON app.progress_revisions(owner_id,activity_id,activity_revision);
CREATE UNIQUE INDEX academic_date_revision_once ON app.academic_date_revisions(owner_id,activity_id,activity_revision);
