CREATE TABLE IF NOT EXISTS public.organization_landing_pages (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
  published jsonb CHECK (published IS NULL OR jsonb_typeof(published) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

-- Nudra uses server-managed sessions. Draft reads/writes go through the
-- backend's manager checks; browser clients have no database credentials.
ALTER TABLE public.organization_landing_pages ENABLE ROW LEVEL SECURITY;
