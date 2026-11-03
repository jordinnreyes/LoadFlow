-- F1: business data is private to the verified owner; identity metadata has a
-- separate resolver role. No anon/authenticated/service-role business grants.
CREATE TABLE app.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  owner_id uuid NOT NULL UNIQUE CHECK (owner_id = id),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 100),
  study_timezone text,
  onboarding_state text NOT NULL DEFAULT 'new' CHECK (onboarding_state IN ('new','seen')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,id)
);
CREATE TABLE app.academic_periods (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES app.users(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  start_date date, end_date date, timezone text,
  is_default boolean NOT NULL DEFAULT false,
  workspace_revision integer NOT NULL DEFAULT 1 CHECK (workspace_revision > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  UNIQUE (owner_id,id)
);
CREATE UNIQUE INDEX one_default_period_per_owner ON app.academic_periods(owner_id) WHERE is_default;
CREATE TABLE app.courses (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, period_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,id), UNIQUE (owner_id,period_id,id),
  FOREIGN KEY (owner_id,period_id) REFERENCES app.academic_periods(owner_id,id)
);
CREATE INDEX courses_by_period ON app.courses(owner_id,period_id,name);
CREATE TABLE app.activities (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, period_id uuid NOT NULL, course_id uuid,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  type text NOT NULL CHECK (type IN ('Práctica calificada','Examen parcial','Examen final','Tarea','Informe','Exposición','Proyecto individual','Entrega grupal')),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  due_date date NOT NULL, due_time time, academic_timezone text, due_at timestamptz,
  allowed_start_at timestamptz,
  divisibility text NOT NULL DEFAULT 'unknown' CHECK (divisibility IN ('unknown','divisible','indivisible')),
  priority_mode text NOT NULL DEFAULT 'inherit' CHECK (priority_mode IN ('inherit','override','none')),
  priority_override text CHECK (priority_override IN ('Alta','Media','Baja')),
  preparation_state text NOT NULL DEFAULT 'new' CHECK (preparation_state IN ('new','progress','done')),
  fulfillment_state text NOT NULL DEFAULT 'pending' CHECK (fulfillment_state IN ('pending','fulfilled')),
  operating_minutes integer CHECK (operating_minutes >= 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  confirmed_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((priority_mode='override' AND priority_override IS NOT NULL) OR (priority_mode<>'override' AND priority_override IS NULL)),
  CHECK (type<>'Entrega grupal' OR operating_minutes IS NULL),
  CHECK (due_at IS NULL OR (due_time IS NOT NULL AND academic_timezone IS NOT NULL)),
  UNIQUE (owner_id,id), UNIQUE (owner_id,period_id,id),
  FOREIGN KEY (owner_id,period_id) REFERENCES app.academic_periods(owner_id,id),
  FOREIGN KEY (owner_id,period_id,course_id) REFERENCES app.courses(owner_id,period_id,id)
);
CREATE INDEX activities_by_deadline ON app.activities(owner_id,period_id,due_at,id);
CREATE TABLE app.fixed_evaluations (
  activity_id uuid PRIMARY KEY, owner_id uuid NOT NULL,
  start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, timezone text NOT NULL,
  CHECK (end_at>start_at), FOREIGN KEY (owner_id,activity_id) REFERENCES app.activities(owner_id,id)
);
CREATE TABLE app.priority_rules (
  owner_id uuid NOT NULL, course_id uuid NOT NULL, activity_type text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('Alta','Media','Baja')),
  PRIMARY KEY (owner_id,course_id,activity_type),
  FOREIGN KEY (owner_id,course_id) REFERENCES app.courses(owner_id,id),
  CHECK (activity_type IN ('Práctica calificada','Examen parcial','Examen final','Tarea','Informe','Exposición','Proyecto individual','Entrega grupal'))
);
CREATE TABLE app.activity_dependencies (
  owner_id uuid NOT NULL, period_id uuid NOT NULL, activity_id uuid NOT NULL, predecessor_id uuid NOT NULL,
  PRIMARY KEY(owner_id,activity_id,predecessor_id), CHECK (activity_id<>predecessor_id),
  FOREIGN KEY(owner_id,period_id,activity_id) REFERENCES app.activities(owner_id,period_id,id),
  FOREIGN KEY(owner_id,period_id,predecessor_id) REFERENCES app.activities(owner_id,period_id,id)
);
CREATE TABLE app.effort_confirmations (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, activity_id uuid NOT NULL,
  minutes integer CHECK (minutes>=0), origin text NOT NULL CHECK (origin IN ('manual','corrected')),
  supersedes_id uuid, confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,id),
  FOREIGN KEY(owner_id,activity_id) REFERENCES app.activities(owner_id,id),
  FOREIGN KEY(owner_id,supersedes_id) REFERENCES app.effort_confirmations(owner_id,id)
);
CREATE TABLE app.progress_current (
  activity_id uuid PRIMARY KEY, owner_id uuid NOT NULL,
  real_total_minutes integer CHECK (real_total_minutes>=0),
  remaining_minutes integer CHECK (remaining_minutes>=0), effective_completion_date date,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  FOREIGN KEY(owner_id,activity_id) REFERENCES app.activities(owner_id,id)
);
CREATE TABLE app.progress_revisions (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, activity_id uuid NOT NULL,
  before_value jsonb NOT NULL, after_value jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(owner_id,activity_id) REFERENCES app.activities(owner_id,id)
);
CREATE INDEX progress_history_by_activity ON app.progress_revisions(owner_id,activity_id,recorded_at DESC,id);
CREATE TABLE app.academic_date_revisions (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, activity_id uuid NOT NULL,
  before_value jsonb NOT NULL, after_value jsonb NOT NULL, source jsonb NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(owner_id,activity_id) REFERENCES app.activities(owner_id,id)
);
CREATE TABLE app.date_change_proposals (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, activity_id uuid NOT NULL,
  base_revision integer NOT NULL, workspace_revision integer NOT NULL,
  before_value jsonb NOT NULL, after_value jsonb NOT NULL, source jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','applied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(owner_id,activity_id) REFERENCES app.activities(owner_id,id)
);
CREATE TABLE app.idempotency_records (
  owner_id uuid NOT NULL REFERENCES app.users(id), operation text NOT NULL, key text NOT NULL,
  request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,operation,key)
);
CREATE TABLE app.auth_challenges (
  id uuid PRIMARY KEY, email_hash text NOT NULL, email_ciphertext text NOT NULL,
  purpose text NOT NULL CHECK(purpose IN ('register','login')),
  expires_at timestamptz NOT NULL, attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5),
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_challenges_cooldown ON app.auth_challenges(email_hash,created_at DESC);
CREATE TABLE app.oauth_transactions (
  id uuid PRIMARY KEY, state_hash text NOT NULL UNIQUE, verifier_ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE app.client_sessions (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES app.users(id), auth_session_id uuid,
  opaque_hash text NOT NULL UNIQUE, tokens_ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM public,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON app.users,app.academic_periods,app.courses,app.activities,app.fixed_evaluations,app.priority_rules,app.activity_dependencies,app.progress_current,app.date_change_proposals,app.idempotency_records TO cw_runtime;
GRANT DELETE ON app.priority_rules,app.activity_dependencies,app.fixed_evaluations TO cw_runtime;
GRANT SELECT,INSERT ON app.effort_confirmations,app.progress_revisions,app.academic_date_revisions TO cw_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.auth_challenges,app.oauth_transactions,app.client_sessions TO cw_identity;
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['users','academic_periods','courses','activities','fixed_evaluations','priority_rules','activity_dependencies','effort_confirmations','progress_current','progress_revisions','academic_date_revisions','date_change_proposals','idempotency_records'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',name);
    EXECUTE format('CREATE POLICY owner_only ON app.%I USING (owner_id = nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (owner_id = nullif(current_setting(''app.user_id'',true),'''')::uuid)',name);
  END LOOP;
END $$;
