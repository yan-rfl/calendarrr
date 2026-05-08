CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  detail      TEXT,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ,
  source      TEXT NOT NULL DEFAULT 'manual'
              CHECK (source IN ('manual','whatsapp','gmail','outlook','imap')),
  external_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX events_user_external ON events(user_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE notification_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id       UUID REFERENCES events(id) ON DELETE CASCADE,
  offset_minutes INT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at      TIMESTAMPTZ,
  failed_at    TIMESTAMPTZ,
  retry_count  INT NOT NULL DEFAULT 0,
  channel      TEXT NOT NULL DEFAULT 'whatsapp'
);
CREATE INDEX notification_queue_pending ON notification_queue(scheduled_at)
  WHERE sent_at IS NULL AND failed_at IS NULL;

CREATE TABLE email_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL CHECK (provider IN ('gmail','outlook','imap')),
  access_token            TEXT,
  refresh_token           TEXT,
  imap_host               TEXT,
  imap_port               INT,
  imap_user               TEXT,
  imap_password_encrypted TEXT,
  last_synced_at          TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT UNIQUE NOT NULL,
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_sync_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,
  external_id TEXT,
  action      TEXT NOT NULL CHECK (action IN ('created','updated','skipped','failed')),
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pending_email_imports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_email_id     TEXT NOT NULL,
  suggested_name   TEXT NOT NULL,
  suggested_start  TIMESTAMPTZ,
  suggested_detail TEXT,
  source           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','rejected')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_email_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_own" ON events USING (auth.uid() = user_id);
CREATE POLICY "notification_rules_own" ON notification_rules USING (auth.uid() = user_id);
CREATE POLICY "notification_queue_own" ON notification_queue USING (auth.uid() = user_id);
CREATE POLICY "email_connections_own" ON email_connections USING (auth.uid() = user_id);
CREATE POLICY "whatsapp_sessions_own" ON whatsapp_sessions USING (auth.uid() = user_id);
CREATE POLICY "event_sync_log_own" ON event_sync_log USING (auth.uid() = user_id);
CREATE POLICY "pending_email_imports_own" ON pending_email_imports USING (auth.uid() = user_id);
