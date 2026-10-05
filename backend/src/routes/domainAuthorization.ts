import { timingSafeEqual } from 'node:crypto';
import { Router, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { organizations } from '../db/schema';
import { normalizeHostname } from '../lib/domainVerification';

const router = Router();
const RESERVED_SLUGS = new Set(['admin', 'api', 'app', 'assets', 'auth', 'cdn', 'mail', 'static', 'support', 'www']);

function secretMatches(candidate: string | undefined, expected: string | undefined): boolean {
  if (!candidate || !expected) return false;
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

function configuredStaticHosts(baseDomain: string | null): Set<string> {
  const configured = (process.env.TLS_STATIC_HOSTS || '').split(',').map((host) => normalizeHostname(host)).filter(Boolean) as string[];
  const assetsHost = normalizeHostname(process.env.ASSETS_HOST || '');
  if (assetsHost) configured.push(assetsHost);
  if (baseDomain) configured.push(baseDomain, `www.${baseDomain}`);
  return new Set(configured);
}

router.get('/authorize', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  if (!secretMatches(req.get('x-nudra-domain-auth'), process.env.DOMAIN_AUTH_SHARED_SECRET)) {
    return res.sendStatus(403);
  }

  if (typeof req.query.domain !== 'string') return res.sendStatus(403);
  const hostname = normalizeHostname(req.query.domain);
  if (!hostname) return res.sendStatus(403);

  const baseDomain = normalizeHostname(process.env.BASE_DOMAIN || process.env.NUDRA_BASE_DOMAIN || '');
  if (configuredStaticHosts(baseDomain).has(hostname)) return res.sendStatus(200);

  try {
    const [customDomain] = await db.select({ id: organizations.id, verifiedAt: organizations.customDomainVerifiedAt })
      .from(organizations)
      .where(and(
        eq(organizations.customDomain, hostname),
        eq(organizations.customDomainStatus, 'active'),
        eq(organizations.isActive, true),
      ))
      .limit(1);
    if (customDomain?.verifiedAt) return res.sendStatus(200);

    if (baseDomain && hostname.endsWith(`.${baseDomain}`)) {
      const slug = hostname.slice(0, -(`.${baseDomain}`).length);
      if (/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/.test(slug) && !RESERVED_SLUGS.has(slug)) {
        const [organization] = await db.select({ id: organizations.id })
          .from(organizations)
          .where(and(eq(organizations.slug, slug), eq(organizations.isActive, true)))
          .limit(1);
        if (organization) return res.sendStatus(200);
      }
    }
    return res.sendStatus(403);
  } catch (err) {
    console.error('domain certificate authorization lookup failed', err);
    return res.sendStatus(503);
  }
});

export default router;
