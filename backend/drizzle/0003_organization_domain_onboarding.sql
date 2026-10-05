ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS custom_domain_status varchar(20) NOT NULL DEFAULT 'unconfigured',
  ADD COLUMN IF NOT EXISTS custom_domain_dns_records jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.organizations
SET custom_domain_status = 'pending'
WHERE custom_domain IS NOT NULL AND custom_domain_status = 'unconfigured';
