ALTER TABLE app.jobs ADD COLUMN include_current_week boolean NOT NULL DEFAULT false
  CHECK (NOT include_current_week OR week_start IS NULL);
