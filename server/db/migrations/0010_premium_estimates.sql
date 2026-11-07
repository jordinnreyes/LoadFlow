CREATE TABLE app.premium_grants (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES app.users(id),
 actor text NOT NULL CHECK(length(actor) BETWEEN 1 AND 100),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 240),
 granted_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>granted_at),
 revoked_at timestamptz,
 revoked_by text,
 revocation_reason text,
 CHECK((revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
   OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL))
);
CREATE UNIQUE INDEX one_unrevoked_premium_grant ON app.premium_grants(owner_id) WHERE revoked_at IS NULL;

CREATE TABLE app.estimate_consents (
 owner_id uuid PRIMARY KEY REFERENCES app.users(id),
 policy_version text NOT NULL,
 granted boolean NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 changed_at timestamptz NOT NULL
);

CREATE TABLE app.estimate_usage (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 activity_id uuid NOT NULL,
 activity_revision integer NOT NULL,
 environment text NOT NULL CHECK(environment IN ('development','pilot','production')),
 budget_month date NOT NULL,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 grant_id uuid NOT NULL REFERENCES app.premium_grants(id),
 consent_revision integer NOT NULL,
 state text NOT NULL CHECK(state IN ('reserved','running','succeeded','failed','outcome_unknown')),
 model text NOT NULL,
 prompt_version text NOT NULL,
 tariff_version text NOT NULL,
 currency text NOT NULL CHECK(currency='USD'),
 max_input_tokens integer NOT NULL CHECK(max_input_tokens>0),
 max_output_tokens integer NOT NULL CHECK(max_output_tokens>0),
 input_micros_per_million bigint NOT NULL CHECK(input_micros_per_million>0),
 output_micros_per_million bigint NOT NULL CHECK(output_micros_per_million>0),
 reserved_micros bigint NOT NULL CHECK(reserved_micros>0),
 actual_micros bigint CHECK(actual_micros>=0),
 input_tokens integer CHECK(input_tokens>=0),
 output_tokens integer CHECK(output_tokens>=0),
 provider_request_id text,
 result jsonb,
 error_code text,
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 finished_at timestamptz,
 reconciled_at timestamptz,
 reconciled_by text,
 reconciliation_reason text,
 FOREIGN KEY(owner_id,activity_id) REFERENCES app.activities(owner_id,id),
 CHECK((state IN ('succeeded','failed'))=(actual_micros IS NOT NULL)),
 CHECK((state='succeeded')=(result IS NOT NULL))
);
CREATE INDEX estimate_usage_budget ON app.estimate_usage(environment,budget_month,owner_id);
CREATE INDEX estimate_usage_active ON app.estimate_usage(environment,expires_at) WHERE state IN ('reserved','running');
CREATE INDEX estimate_usage_dedupe ON app.estimate_usage(owner_id,activity_id,fingerprint,created_at DESC);

DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['premium_grants','estimate_consents','estimate_usage'] LOOP
  EXECUTE format('REVOKE ALL ON app.%I FROM public,anon,authenticated,service_role,cw_identity,cw_runtime',name);
  EXECUTE format('GRANT SELECT ON app.%I TO cw_runtime',name);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY owner_only ON app.%I TO cw_runtime USING (owner_id=nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (owner_id=nullif(current_setting(''app.user_id'',true),'''')::uuid)',name);
  EXECUTE format('CREATE POLICY premium_operator ON app.%I TO cw_migrator USING(true) WITH CHECK(true)',name);
 END LOOP;
END $$;
GRANT INSERT,UPDATE ON app.estimate_consents TO cw_runtime;
GRANT UPDATE(state,actual_micros,input_tokens,output_tokens,provider_request_id,result,error_code,finished_at) ON app.estimate_usage TO cw_runtime;

CREATE FUNCTION app.reserve_estimate(
 p_id uuid,p_activity uuid,p_revision integer,p_env text,p_hash text,p_grant uuid,p_consent integer,
 p_model text,p_prompt text,p_tariff text,p_input integer,p_output integer,
 p_input_rate bigint,p_output_rate bigint,p_now timestamptz,p_expiry timestamptz,
 p_user_budget bigint,p_global_budget bigint,p_concurrent integer
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE
 account uuid := nullif(current_setting('app.user_id',true),'')::uuid;
 month date := date_trunc('month',p_now AT TIME ZONE 'UTC')::date;
 cost bigint := ceil((p_input::numeric*p_input_rate+p_output::numeric*p_output_rate)/1000000);
 global_cost numeric;
 user_cost numeric;
BEGIN
 IF account IS NULL THEN RAISE EXCEPTION 'missing owner context'; END IF;
 PERFORM pg_advisory_xact_lock(204819,2);
 UPDATE app.estimate_usage SET state='failed',actual_micros=0,error_code='ESTIMATE_EXPIRED',finished_at=p_now
 WHERE environment=p_env AND state='reserved' AND expires_at<=p_now;
 UPDATE app.estimate_usage SET state='outcome_unknown',error_code='PROVIDER_OUTCOME_UNKNOWN',finished_at=p_now
 WHERE environment=p_env AND state='running' AND expires_at<=p_now;
 IF EXISTS (SELECT 1 FROM app.estimate_usage WHERE environment=p_env AND budget_month=month
    AND error_code='PROVIDER_USAGE_EXCEEDED') THEN RETURN 'ESTIMATE_BUDGET_LIMIT'; END IF;
 IF (SELECT count(*) FROM app.estimate_usage
     WHERE environment=p_env AND state IN ('reserved','running') AND expires_at>p_now)>=p_concurrent THEN
  RETURN 'ESTIMATE_BUSY';
 END IF;
 SELECT coalesce(sum(coalesce(actual_micros,reserved_micros)),0),
        coalesce(sum(coalesce(actual_micros,reserved_micros)) FILTER (WHERE owner_id=account),0)
 INTO global_cost,user_cost FROM app.estimate_usage WHERE environment=p_env AND budget_month=month;
 IF global_cost+cost>p_global_budget OR user_cost+cost>p_user_budget THEN
  RETURN 'ESTIMATE_BUDGET_LIMIT';
 END IF;
 INSERT INTO app.estimate_usage(id,owner_id,activity_id,activity_revision,environment,budget_month,fingerprint,
  grant_id,consent_revision,state,model,prompt_version,tariff_version,currency,max_input_tokens,max_output_tokens,
  input_micros_per_million,output_micros_per_million,reserved_micros,created_at,expires_at)
 VALUES(p_id,account,p_activity,p_revision,p_env,month,p_hash,p_grant,p_consent,'reserved',p_model,p_prompt,p_tariff,'USD',
  p_input,p_output,p_input_rate,p_output_rate,cost,p_now,p_expiry);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.reserve_estimate(uuid,uuid,integer,text,text,uuid,integer,text,text,text,integer,integer,bigint,bigint,timestamptz,timestamptz,bigint,bigint,integer)
 FROM PUBLIC,anon,authenticated,service_role,cw_identity;
GRANT EXECUTE ON FUNCTION app.reserve_estimate(uuid,uuid,integer,text,text,uuid,integer,text,text,text,integer,integer,bigint,bigint,timestamptz,timestamptz,bigint,bigint,integer)
 TO cw_runtime;
