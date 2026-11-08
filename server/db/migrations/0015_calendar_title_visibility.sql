ALTER TABLE app.calendar_connections
  ADD COLUMN event_titles_visible boolean NOT NULL DEFAULT false;

UPDATE app.calendar_connections
SET event_titles_visible = true
WHERE event_titles_credential_id IS NOT NULL;
