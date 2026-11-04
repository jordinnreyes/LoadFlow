-- Calendar metadata and occupancy use the business owner context. Credentials
-- and single-use consent transactions are private to the integration resolver.
CREATE TABLE app.calendar_credentials (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES app.users(id),ciphertext text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner_id,id)
);
CREATE TABLE app.calendar_oauth_transactions (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES app.users(id),session_id uuid NOT NULL,
 state_hash text NOT NULL UNIQUE,browser_hash text NOT NULL,verifier_ciphertext text NOT NULL,
 base_revision integer NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz
);
CREATE TABLE app.calendar_connections (
 owner_id uuid PRIMARY KEY REFERENCES app.users(id),id uuid NOT NULL UNIQUE,
 credential_id uuid,state text NOT NULL CHECK(state IN ('active','disconnected','revoked')),
 granted_scopes text[] NOT NULL DEFAULT '{}',revision integer NOT NULL CHECK(revision>0),selection_revision integer NOT NULL DEFAULT 1,
 changed_at timestamptz NOT NULL DEFAULT now(),last_attempt_at timestamptz,last_success_at timestamptz,safe_error text,
 UNIQUE(owner_id,id),FOREIGN KEY(owner_id,credential_id) REFERENCES app.calendar_credentials(owner_id,id)
);
CREATE TABLE app.calendar_sources (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,connection_id uuid NOT NULL,provider_id text NOT NULL,
 display_name text NOT NULL,timezone text,primary_calendar boolean NOT NULL DEFAULT false,
 selected boolean NOT NULL DEFAULT false,accessible boolean NOT NULL DEFAULT true,
 UNIQUE(owner_id,connection_id,provider_id),UNIQUE(owner_id,id),
 FOREIGN KEY(owner_id,connection_id) REFERENCES app.calendar_connections(owner_id,id)
);
CREATE TABLE app.busy_snapshots (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,calendar_id uuid NOT NULL,
 connection_revision integer NOT NULL,selection_revision integer NOT NULL,
 range_start timestamptz NOT NULL,range_end timestamptz NOT NULL CHECK(range_end>range_start),
 fetched_at timestamptz NOT NULL,content_hash text NOT NULL,
 UNIQUE(owner_id,id),FOREIGN KEY(owner_id,calendar_id) REFERENCES app.calendar_sources(owner_id,id)
);
CREATE INDEX snapshots_by_range ON app.busy_snapshots(owner_id,calendar_id,range_start,range_end,fetched_at DESC);
CREATE TABLE app.external_busy_intervals (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,snapshot_id uuid NOT NULL,
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL CHECK(end_at>start_at),
 FOREIGN KEY(owner_id,snapshot_id) REFERENCES app.busy_snapshots(owner_id,id)
);
CREATE INDEX busy_by_snapshot ON app.external_busy_intervals(owner_id,snapshot_id);
CREATE TABLE app.jobs (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,period_id uuid NOT NULL,type text NOT NULL CHECK(type='calendar_refresh'),
 connection_revision integer NOT NULL,selection_revision integer NOT NULL,dedupe_key text NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','succeeded','partial','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),run_after timestamptz NOT NULL,
 lease_token uuid,lease_until timestamptz,heartbeat_at timestamptz,safe_error text,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 UNIQUE(owner_id,id),FOREIGN KEY(owner_id,period_id) REFERENCES app.academic_periods(owner_id,id)
);
CREATE UNIQUE INDEX jobs_dedupe_active ON app.jobs(owner_id,dedupe_key) WHERE status IN ('queued','running');
CREATE INDEX jobs_claimable ON app.jobs(run_after,created_at) WHERE status IN ('queued','running');
REVOKE ALL ON app.calendar_credentials,app.calendar_oauth_transactions,app.calendar_connections,app.calendar_sources,app.busy_snapshots,app.external_busy_intervals,app.jobs FROM public,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.calendar_credentials,app.calendar_oauth_transactions TO cw_identity;
GRANT SELECT,INSERT,UPDATE ON app.calendar_connections,app.calendar_sources,app.jobs TO cw_runtime;
GRANT SELECT,INSERT ON app.busy_snapshots,app.external_busy_intervals TO cw_runtime;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['calendar_credentials','calendar_oauth_transactions','calendar_connections','calendar_sources','busy_snapshots','external_busy_intervals','jobs'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY owner_only ON app.%I USING (owner_id=nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (owner_id=nullif(current_setting(''app.user_id'',true),'''')::uuid)',name);
 END LOOP; END $$;
-- The only cross-owner privilege is this queue-only claim. Business RLS is intact.
CREATE POLICY queue_claim ON app.jobs TO cw_migrator USING(true) WITH CHECK(true);
CREATE FUNCTION app.claim_calendar_job(p_now timestamptz,p_token uuid)
RETURNS SETOF app.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 UPDATE app.jobs SET status='failed',safe_error='RETRY_EXHAUSTED',lease_token=NULL,lease_until=NULL,finished_at=p_now
 WHERE type='calendar_refresh' AND status='running' AND lease_until<=p_now AND attempts>=3;
 RETURN QUERY WITH candidate AS (
  SELECT id FROM app.jobs WHERE type='calendar_refresh' AND attempts<3 AND
   ((status='queued' AND run_after<=p_now) OR (status='running' AND lease_until<=p_now))
  ORDER BY run_after,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE app.jobs j SET status='running',attempts=j.attempts+1,lease_token=p_token,
 lease_until=p_now+interval '60 seconds',heartbeat_at=p_now
 FROM candidate c WHERE j.id=c.id RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION app.claim_calendar_job(timestamptz,uuid) FROM public,anon,authenticated,service_role,cw_runtime;
GRANT EXECUTE ON FUNCTION app.claim_calendar_job(timestamptz,uuid) TO cw_identity;
