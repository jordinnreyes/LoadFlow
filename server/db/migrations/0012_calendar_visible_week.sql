ALTER TABLE app.jobs ADD COLUMN week_start date
  CHECK (EXTRACT(ISODOW FROM week_start) = 1);
