-- Update any existing events created via the LINE bot (stored as 'whatsapp' before rename)
UPDATE events SET source = 'line' WHERE source = 'whatsapp';

-- Drop the old check constraint (auto-named by PostgreSQL) and recreate with 'line'
DO $$
DECLARE
  c TEXT;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%source%';
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE events DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END $$;

ALTER TABLE events ADD CONSTRAINT events_source_check
  CHECK (source IN ('manual','line','gmail','outlook','imap'));
