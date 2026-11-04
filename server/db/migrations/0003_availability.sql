CREATE TABLE app.planning_preferences (
 period_id uuid PRIMARY KEY, owner_id uuid NOT NULL, timezone text NOT NULL,
 valid_from date NOT NULL, valid_to date,
 day_states jsonb NOT NULL CHECK(jsonb_typeof(day_states)='array' AND jsonb_array_length(day_states)=7),
 min_minutes integer NOT NULL CHECK(min_minutes>0), preferred_minutes integer NOT NULL,
 max_minutes integer NOT NULL, revision integer NOT NULL CHECK(revision>0),
 CHECK(min_minutes<=preferred_minutes AND preferred_minutes<=max_minutes),
 CHECK(valid_to IS NULL OR valid_to>=valid_from),
 FOREIGN KEY(owner_id,period_id) REFERENCES app.academic_periods(owner_id,id)
);
CREATE TABLE app.study_windows (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, period_id uuid NOT NULL,
 weekday integer NOT NULL CHECK(weekday BETWEEN 1 AND 7),
 local_start_minutes integer NOT NULL CHECK(local_start_minutes BETWEEN 0 AND 1439),
 local_end_minutes integer NOT NULL CHECK(local_end_minutes BETWEEN 1 AND 1440),
 timezone text NOT NULL, valid_from date NOT NULL, valid_to date,
 CHECK(local_end_minutes>local_start_minutes),CHECK(valid_to IS NULL OR valid_to>=valid_from),
 FOREIGN KEY(owner_id,period_id) REFERENCES app.academic_periods(owner_id,id)
);
CREATE INDEX study_windows_period ON app.study_windows(owner_id,period_id,weekday);
CREATE TABLE app.availability_exceptions (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, period_id uuid NOT NULL, local_date date NOT NULL,
 mode text NOT NULL CHECK(mode IN ('replace','no_study','unknown')), intervals jsonb NOT NULL CHECK(jsonb_typeof(intervals)='array'),
 UNIQUE(owner_id,period_id,local_date), FOREIGN KEY(owner_id,period_id) REFERENCES app.academic_periods(owner_id,id)
);
CREATE TABLE app.manual_coverage (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, period_id uuid NOT NULL,
 range_start date NOT NULL, range_end date NOT NULL CHECK(range_end>range_start),timezone text NOT NULL,
 source_revision integer NOT NULL CHECK(source_revision>0),confirmed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,period_id) REFERENCES app.academic_periods(owner_id,id)
);
CREATE TABLE app.manual_commitments (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, period_id uuid NOT NULL,title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL CHECK(end_at>start_at),timezone text NOT NULL,
 source_kind text NOT NULL DEFAULT 'manual' CHECK(source_kind='manual'),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,period_id) REFERENCES app.academic_periods(owner_id,id)
);
CREATE INDEX manual_commitments_period_range ON app.manual_commitments(owner_id,period_id,start_at,end_at);
CREATE TABLE app.planning_input_changes (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,period_id uuid NOT NULL,workspace_revision integer NOT NULL,
 kind text NOT NULL,summary jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,period_id,workspace_revision),FOREIGN KEY(owner_id,period_id) REFERENCES app.academic_periods(owner_id,id)
);
REVOKE ALL ON app.planning_preferences,app.study_windows,app.availability_exceptions,app.manual_coverage,app.manual_commitments,app.planning_input_changes FROM public,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.planning_preferences,app.study_windows,app.availability_exceptions,app.manual_coverage,app.manual_commitments TO cw_runtime;
GRANT SELECT,INSERT ON app.planning_input_changes TO cw_runtime;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['planning_preferences','study_windows','availability_exceptions','manual_coverage','manual_commitments','planning_input_changes'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY owner_only ON app.%I USING (owner_id=nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (owner_id=nullif(current_setting(''app.user_id'',true),'''')::uuid)',name);
 END LOOP; END $$;
