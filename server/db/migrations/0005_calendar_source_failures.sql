-- A failed calendar remains uncertain even when its previous read is <30 min old.
ALTER TABLE app.calendar_sources ADD COLUMN last_error text;
ALTER TABLE app.calendar_sources ADD COLUMN last_error_at timestamptz;
