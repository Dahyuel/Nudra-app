ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS custom_domain varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_custom_domain_unique
  ON public.organizations (custom_domain)
  WHERE custom_domain IS NOT NULL;

ALTER TABLE public.org_memberships
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active';

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courses_organization_id_organizations_id_fk'
      AND conrelid = 'public.courses'::regclass
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS org_memberships_org_status_idx
  ON public.org_memberships (org_id, status);
CREATE INDEX IF NOT EXISTS courses_organization_id_idx
  ON public.courses (organization_id);
