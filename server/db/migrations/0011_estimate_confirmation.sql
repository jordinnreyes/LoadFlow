ALTER TABLE app.estimate_consents
  ADD COLUMN purpose text NOT NULL DEFAULT 'analysis' CHECK(purpose IN ('analysis','personalization')),
  DROP CONSTRAINT estimate_consents_pkey,
  ADD PRIMARY KEY(owner_id,purpose);

ALTER TABLE app.estimate_usage
  ADD COLUMN course_id uuid REFERENCES app.courses(id),
  ADD COLUMN activity_type text,
  ADD COLUMN workload_size text CHECK(workload_size IN ('small','medium','large')),
  ADD COLUMN calibration jsonb,
  ADD UNIQUE(owner_id,activity_id,id);
GRANT UPDATE(course_id,activity_type,workload_size,calibration) ON app.estimate_usage TO cw_runtime;

ALTER TABLE app.effort_confirmations
  DROP CONSTRAINT effort_confirmations_origin_check,
  ADD CHECK(origin IN ('manual','corrected','suggested','personalized')),
  ADD COLUMN estimate_id uuid,
  ADD FOREIGN KEY(owner_id,activity_id,estimate_id) REFERENCES app.estimate_usage(owner_id,activity_id,id),
  ADD CHECK(origin NOT IN ('suggested','personalized') OR estimate_id IS NOT NULL);
CREATE UNIQUE INDEX estimate_applied_once ON app.effort_confirmations(estimate_id) WHERE estimate_id IS NOT NULL;

ALTER TABLE app.planning_jobs ADD COLUMN review_required boolean NOT NULL DEFAULT false;
