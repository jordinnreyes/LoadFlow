ALTER TABLE app.calendar_connections
  ADD COLUMN event_titles_credential_id uuid,
  ADD COLUMN event_titles_revision integer NOT NULL DEFAULT 0,
  ADD FOREIGN KEY (owner_id, event_titles_credential_id)
    REFERENCES app.calendar_credentials (owner_id, id);

ALTER TABLE app.calendar_oauth_transactions
  ADD COLUMN request_event_titles boolean NOT NULL DEFAULT false,
  ADD COLUMN base_event_titles_revision integer NOT NULL DEFAULT 0;
