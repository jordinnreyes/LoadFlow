-- Imports are a separate worker queue. No Storage credentials are granted to SQL roles.
CREATE TABLE app.documents (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, period_id uuid NOT NULL,
 format text NOT NULL CHECK (format IN ('pdf','xlsx')), filename text,
 size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
 sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
 object_state text NOT NULL CHECK (object_state IN ('staging','stored','delete_pending','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(), object_expires_at timestamptz NOT NULL,
 removed_at timestamptz, delete_after timestamptz NOT NULL DEFAULT now(),
 UNIQUE (owner_id,id), UNIQUE (owner_id,period_id,id),
 FOREIGN KEY (owner_id,period_id) REFERENCES app.academic_periods(owner_id,id)
);
CREATE UNIQUE INDEX documents_active_hash ON app.documents(owner_id,period_id,sha256)
 WHERE removed_at IS NULL;

CREATE TABLE app.imports (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, period_id uuid NOT NULL, document_id uuid NOT NULL,
 queue_name text NOT NULL CHECK (queue_name ~ '^[a-zA-Z0-9_-]{1,80}$'),
 status text NOT NULL CHECK (status IN ('uploading','queued','running','review','failed','cancelled','removed','expired')),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 extractor_version text NOT NULL, coverage jsonb NOT NULL DEFAULT '[]', warnings jsonb NOT NULL DEFAULT '[]',
 safe_error text, attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
 run_after timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
 review_expires_at timestamptz,
 UNIQUE (owner_id,id), UNIQUE (owner_id,document_id),
 FOREIGN KEY (owner_id,period_id,document_id) REFERENCES app.documents(owner_id,period_id,id),
 CHECK ((status='running') = (lease_until IS NOT NULL AND lease_token IS NOT NULL))
);
CREATE INDEX imports_queue ON app.imports(queue_name,run_after,id)
 WHERE status IN ('queued','running');
CREATE INDEX imports_review_expiry ON app.imports(queue_name,review_expires_at)
 WHERE status='review';
CREATE INDEX documents_cleanup ON app.documents(delete_after,object_expires_at)
 WHERE object_state <> 'deleted';

CREATE TABLE app.import_candidates (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, import_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK (ordinal > 0), revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 evidence jsonb NOT NULL, draft jsonb NOT NULL,
 resolution text CHECK (resolution IN ('distinct','keep','update')),
 confirmed_activity_id uuid,
 UNIQUE (owner_id,id), UNIQUE (owner_id,import_id,ordinal),
 FOREIGN KEY (owner_id,import_id) REFERENCES app.imports(owner_id,id),
 FOREIGN KEY (owner_id,confirmed_activity_id) REFERENCES app.activities(owner_id,id),
 CHECK ((resolution IS NULL) = (confirmed_activity_id IS NULL))
);
CREATE TABLE app.activity_sources (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, activity_id uuid NOT NULL,
 candidate_id uuid, format text NOT NULL CHECK (format IN ('pdf','xlsx')),
 locator jsonb NOT NULL, UNIQUE (owner_id,candidate_id),
 FOREIGN KEY (owner_id,activity_id) REFERENCES app.activities(owner_id,id),
 FOREIGN KEY (owner_id,candidate_id) REFERENCES app.import_candidates(owner_id,id)
);

DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['documents','imports','import_candidates','activity_sources'] LOOP
  EXECUTE format('REVOKE ALL ON app.%I FROM public,anon,authenticated,service_role,cw_identity',name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON app.%I TO cw_runtime',name);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY owner_only ON app.%I USING (owner_id=nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (owner_id=nullif(current_setting(''app.user_id'',true),'''')::uuid)',name);
 END LOOP;
END $$;
GRANT DELETE ON app.import_candidates TO cw_runtime;
CREATE POLICY imports_queue_claim ON app.imports TO cw_migrator USING(true) WITH CHECK(true);
CREATE POLICY documents_queue_scan ON app.documents FOR SELECT TO cw_migrator USING(true);

CREATE FUNCTION app.claim_import(p_now timestamptz,p_token uuid,p_queue text)
RETURNS TABLE(id uuid,owner_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 WITH next_job AS (
  SELECT i.id FROM app.imports i JOIN app.documents d ON d.id=i.document_id
  WHERE i.queue_name=p_queue AND d.object_state='stored' AND d.object_expires_at>p_now
   AND i.attempts<3 AND ((i.status='queued' AND i.run_after<=p_now) OR
    (i.status='running' AND i.lease_until<=p_now))
  ORDER BY i.run_after,i.id FOR UPDATE OF i SKIP LOCKED LIMIT 1
 )
 UPDATE app.imports i SET status='running',attempts=i.attempts+1,
 lease_token=p_token,lease_until=p_now+interval '60 seconds',revision=i.revision+1
 FROM next_job j WHERE j.id=i.id RETURNING i.id,i.owner_id;
$$;
CREATE FUNCTION app.next_import_cleanup(p_now timestamptz,p_queue text)
RETURNS TABLE(id uuid,owner_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT i.id,i.owner_id FROM app.imports i JOIN app.documents d ON d.id=i.document_id
 WHERE i.queue_name=p_queue AND
  ((i.status='review' AND i.review_expires_at<=p_now)
   OR (i.status='running' AND i.attempts>=3 AND i.lease_until<=p_now)
   OR (d.object_state<>'deleted' AND d.delete_after<=p_now AND
    (d.object_state='delete_pending' OR d.object_expires_at<=p_now
     OR (d.object_state='staging' AND d.created_at<=p_now-interval '2 minutes'))))
 ORDER BY d.delete_after,i.id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION app.claim_import(timestamptz,uuid,text),app.next_import_cleanup(timestamptz,text)
 FROM public,anon,authenticated,service_role,cw_runtime;
GRANT EXECUTE ON FUNCTION app.claim_import(timestamptz,uuid,text),app.next_import_cleanup(timestamptz,text) TO cw_identity;
