DROP TABLE IF EXISTS whatsapp_sessions;

CREATE TABLE line_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  line_user_id TEXT UNIQUE,
  display_name TEXT,
  verified_at TIMESTAMPTZ,
  pending_link_code TEXT,
  pending_link_code_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE line_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_sessions_own" ON line_sessions USING (auth.uid() = user_id);
