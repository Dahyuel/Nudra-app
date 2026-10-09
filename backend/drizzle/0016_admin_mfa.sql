CREATE TABLE admin_mfa (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 encrypted_secret text NOT NULL,
 last_counter bigint NOT NULL DEFAULT -1,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_mfa ENABLE ROW LEVEL SECURITY;
-- Require privileged users to authenticate again after this upgrade.
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role='admin');
