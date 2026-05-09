-- Remove any duplicate user_id rows (keep the most recently created)
DELETE FROM line_sessions a
USING line_sessions b
WHERE a.user_id = b.user_id AND a.created_at < b.created_at;

-- Enforce one session row per user so upsert onConflict works correctly
ALTER TABLE line_sessions ADD CONSTRAINT line_sessions_user_id_key UNIQUE (user_id);
