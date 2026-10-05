ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS custom_domain_verification_token_hash varchar(64),
  ADD COLUMN IF NOT EXISTS custom_domain_verified_at timestamptz;

-- Existing Vercel activation only proved that Vercel accepted the domain.
-- Every custom hostname must prove DNS ownership and point at this VPS again.
UPDATE public.organizations
SET custom_domain_status = 'pending',
    custom_domain_dns_records = '[]'::jsonb,
    custom_domain_verification_token_hash = NULL,
    custom_domain_verified_at = NULL
WHERE custom_domain IS NOT NULL;
