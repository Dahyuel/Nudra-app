-- Organization courses must never become global Nudra courses when a tenant
-- is deleted. Keep the nullable organization_id for genuinely global courses,
-- but require explicit course archival/deletion before deleting the tenant.
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_organization_id_organizations_id_fk;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_organization_id_organizations_id_fk
  FOREIGN KEY (organization_id)
  REFERENCES public.organizations(id)
  ON DELETE RESTRICT;
