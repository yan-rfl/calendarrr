ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS sync_metadata JSONB;

ALTER TABLE email_connections
  ADD CONSTRAINT email_connections_user_provider_unique UNIQUE (user_id, provider);
