-- Separate real development jobs from provider-double integration jobs. This
-- partition is configured by the server/test harness, never by an HTTP body.
ALTER TABLE app.jobs ADD COLUMN queue_name text NOT NULL DEFAULT 'calendar' CHECK(queue_name ~ '^[a-zA-Z0-9_-]{1,80}$');
CREATE INDEX jobs_queue_claimable ON app.jobs(queue_name,run_after,created_at) WHERE status IN ('queued','running');
DROP FUNCTION app.claim_calendar_job(timestamptz,uuid);
CREATE FUNCTION app.claim_calendar_job(p_now timestamptz,p_token uuid,p_queue text)
RETURNS SETOF app.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 UPDATE app.jobs SET status='failed',safe_error='RETRY_EXHAUSTED',lease_token=NULL,lease_until=NULL,finished_at=p_now
 WHERE queue_name=p_queue AND type='calendar_refresh' AND status='running' AND lease_until<=p_now AND attempts>=3;
 RETURN QUERY WITH candidate AS (
  SELECT id FROM app.jobs WHERE queue_name=p_queue AND type='calendar_refresh' AND attempts<3 AND
   ((status='queued' AND run_after<=p_now) OR (status='running' AND lease_until<=p_now))
  ORDER BY run_after,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE app.jobs j SET status='running',attempts=j.attempts+1,lease_token=p_token,
 lease_until=p_now+interval '60 seconds',heartbeat_at=p_now
 FROM candidate c WHERE j.id=c.id RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION app.claim_calendar_job(timestamptz,uuid,text) FROM public,anon,authenticated,service_role,cw_runtime;
GRANT EXECUTE ON FUNCTION app.claim_calendar_job(timestamptz,uuid,text) TO cw_identity;
