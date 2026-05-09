ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS pending_otp TEXT,
  ADD COLUMN IF NOT EXISTS pending_otp_expires_at TIMESTAMPTZ;
