ALTER TABLE app.academic_periods ADD COLUMN plan_revision integer NOT NULL DEFAULT 0 CHECK(plan_revision>=0);
CREATE TABLE app.sessions (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,period_id uuid NOT NULL,activity_id uuid NOT NULL,
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,
 kind text NOT NULL CHECK(kind IN ('study','group')),fixed boolean NOT NULL,accepted boolean NOT NULL,
 state text NOT NULL CHECK(state IN ('planned','completed','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 cancel_reason text CHECK(cancel_reason IN ('replanned','progress_closed','student')),
 CHECK(end_at>start_at AND date_trunc('minute',start_at)=start_at AND date_trunc('minute',end_at)=end_at),
 UNIQUE(owner_id,id),FOREIGN KEY(owner_id,period_id,activity_id) REFERENCES app.activities(owner_id,period_id,id)
);
CREATE INDEX sessions_active_range ON app.sessions(owner_id,period_id,start_at,end_at) WHERE state='planned';
CREATE TABLE app.group_reservation_settings (
 activity_id uuid PRIMARY KEY,owner_id uuid NOT NULL,enabled boolean NOT NULL,accepted boolean NOT NULL,
 block_count integer NOT NULL CHECK(block_count BETWEEN 1 AND 30),block_minutes integer NOT NULL CHECK(block_minutes BETWEEN 1 AND 1440),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 FOREIGN KEY(owner_id,activity_id) REFERENCES app.activities(owner_id,id)
);
CREATE TABLE app.group_equivalences (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,activity_id uuid NOT NULL,calendar_id uuid NOT NULL,
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,connection_revision integer NOT NULL,selection_revision integer NOT NULL,
 CHECK(end_at>start_at AND date_trunc('minute',start_at)=start_at AND date_trunc('minute',end_at)=end_at),
 UNIQUE(owner_id,id),FOREIGN KEY(owner_id,activity_id) REFERENCES app.activities(owner_id,id),
 FOREIGN KEY(owner_id,calendar_id) REFERENCES app.calendar_sources(owner_id,id)
);
CREATE INDEX group_equivalences_owner_range ON app.group_equivalences(owner_id,start_at,end_at);
CREATE TABLE app.plan_versions (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,period_id uuid NOT NULL,workspace_revision integer NOT NULL,
 plan_revision integer NOT NULL,result jsonb NOT NULL,source_valid_until timestamptz,
 previous_version_id uuid,created_at timestamptz NOT NULL,
 UNIQUE(owner_id,id),UNIQUE(owner_id,period_id,plan_revision),
 FOREIGN KEY(owner_id,period_id) REFERENCES app.academic_periods(owner_id,id),
 FOREIGN KEY(owner_id,previous_version_id) REFERENCES app.plan_versions(owner_id,id)
);
CREATE TABLE app.planning_proposals (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,period_id uuid NOT NULL,workspace_revision integer NOT NULL,plan_revision integer NOT NULL,
 snapshot jsonb NOT NULL,result jsonb NOT NULL,command jsonb NOT NULL,required_confirmations jsonb NOT NULL,
 input_hash text NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','applied')),
 created_at timestamptz NOT NULL,
 UNIQUE(owner_id,id),FOREIGN KEY(owner_id,period_id) REFERENCES app.academic_periods(owner_id,id)
);
CREATE TABLE app.planning_jobs (
 owner_id uuid NOT NULL,period_id uuid NOT NULL,workspace_revision integer NOT NULL,
 queue_name text NOT NULL CHECK(queue_name ~ '^[a-zA-Z0-9_-]{1,80}$'),
 status text NOT NULL CHECK(status IN ('queued','running','done','needs_review','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),lease_token uuid,lease_until timestamptz,
 proposal_id uuid,safe_error text,run_after timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,period_id),FOREIGN KEY(owner_id,period_id) REFERENCES app.academic_periods(owner_id,id),
 FOREIGN KEY(owner_id,proposal_id) REFERENCES app.planning_proposals(owner_id,id)
);
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['sessions','group_reservation_settings','group_equivalences','plan_versions','planning_proposals','planning_jobs'] LOOP
  EXECUTE format('REVOKE ALL ON app.%I FROM public,anon,authenticated,service_role,cw_identity',name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON app.%I TO cw_runtime',name);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY owner_only ON app.%I USING (owner_id=nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (owner_id=nullif(current_setting(''app.user_id'',true),'''')::uuid)',name);
 END LOOP;
END $$;
GRANT DELETE ON app.group_equivalences TO cw_runtime;
CREATE POLICY planning_queue_claim ON app.planning_jobs TO cw_migrator USING(true) WITH CHECK(true);
CREATE FUNCTION app.claim_planning_job(p_now timestamptz,p_token uuid,p_queue text)
RETURNS SETOF app.planning_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 UPDATE app.planning_jobs SET status='failed',safe_error='RETRY_EXHAUSTED',lease_token=NULL,lease_until=NULL
 WHERE queue_name=p_queue AND status='running' AND lease_until<=p_now AND attempts>=3;
 RETURN QUERY WITH candidate AS (
 SELECT owner_id,period_id FROM app.planning_jobs WHERE queue_name=p_queue AND attempts<3 AND
  ((status='queued' AND run_after<=p_now) OR (status='running' AND lease_until<=p_now))
 ORDER BY run_after,period_id FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE app.planning_jobs j SET status='running',attempts=j.attempts+1,lease_token=p_token,lease_until=p_now+interval '60 seconds'
 FROM candidate c WHERE (j.owner_id,j.period_id)=(c.owner_id,c.period_id) RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION app.claim_planning_job(timestamptz,uuid,text) FROM public,anon,authenticated,service_role,cw_runtime;
GRANT EXECUTE ON FUNCTION app.claim_planning_job(timestamptz,uuid,text) TO cw_identity;
