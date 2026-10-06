CREATE TABLE IF NOT EXISTS organization_landing_page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
  published jsonb CHECK (published IS NULL OR jsonb_typeof(published) = 'object'),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, revision)
);

CREATE INDEX IF NOT EXISTS organization_landing_page_versions_recent_idx
  ON organization_landing_page_versions(org_id, revision DESC);
