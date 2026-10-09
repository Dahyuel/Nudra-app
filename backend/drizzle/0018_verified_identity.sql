ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE sessions ADD COLUMN mfa_verified boolean NOT NULL DEFAULT false;
CREATE TABLE email_verification_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX email_verification_user_idx ON email_verification_tokens(user_id);
CREATE INDEX email_verification_expiry_idx ON email_verification_tokens(expires_at);
