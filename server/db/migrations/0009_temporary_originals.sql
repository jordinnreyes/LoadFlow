-- Adopt the approved temporary-file policy for pending local imports too.
-- This does not delete confirmed activities or academic/progress history.
CREATE POLICY temporary_original_migration ON app.documents TO cw_migrator USING(true) WITH CHECK(true);
UPDATE app.documents SET object_expires_at=least(object_expires_at,created_at+interval '2 minutes')
 WHERE object_state IN ('staging','stored');
UPDATE app.imports SET review_expires_at=NULL WHERE status='review';
UPDATE app.documents d SET filename=NULL,object_state='delete_pending',delete_after=now(),
 sha256=CASE WHEN i.status='failed' THEN NULL ELSE d.sha256 END,
 removed_at=CASE WHEN i.status='failed' THEN coalesce(d.removed_at,now()) ELSE d.removed_at END
 FROM app.imports i WHERE (i.owner_id,i.document_id)=(d.owner_id,d.id)
 AND i.status IN ('review','failed','cancelled','removed','expired') AND d.object_state<>'deleted';
DROP POLICY temporary_original_migration ON app.documents;
