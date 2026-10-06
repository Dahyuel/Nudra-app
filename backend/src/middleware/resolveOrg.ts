import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { organizations } from '../db/schema';
import { and, eq, or, isNotNull } from 'drizzle-orm';
import { normalizeHostname } from '../lib/domainVerification';

function rootDomains() {
  const configured = (process.env.ORGANIZATION_ROOT_DOMAINS || process.env.BASE_DOMAIN || 'nudra.org,nudra.com,localhost')
    .split(',').map((value) => normalizeHostname(value)).filter(Boolean) as string[];
  for (const fixed of ['localhost', '127.0.0.1']) if (!configured.includes(fixed)) configured.push(fixed);
  return new Set(configured);
}

export async function resolveOrg(req: Request, res: Response, next: NextFunction) {
  try {
    const requestHost = (req.hostname || '').toLowerCase().replace(/\.$/, '');
    const hintedHost = req.get('x-organization-host');
    let host = requestHost;
    if (hintedHost) {
      const normalizedHint = normalizeHostname(hintedHost);
      if (!normalizedHint) return res.status(400).json({ message: 'Invalid organization host.' });

      let originHost: string | null = null;
      const origin = req.get('origin');
      if (origin) {
        try {
          const parsedOrigin = new URL(origin);
          if (parsedOrigin.origin === origin) originHost = normalizeHostname(parsedOrigin.hostname);
        } catch {
          originHost = null;
        }
      }
      const normalizedRequestHost = normalizeHostname(requestHost);
      if (normalizedHint !== normalizedRequestHost && normalizedHint !== originHost) {
        return res.status(403).json({ message: 'Organization host does not match this request.' });
      }
      host = normalizedHint;
    }
    const knownRoots = rootDomains();
    let requestedSlug: string | undefined;
    let isPlatformHost = knownRoots.has(host);
    for (const root of knownRoots) {
      if (host === root || ['www', 'api', 'app', 'assets'].some((service) => host === `${service}.${root}`)) {
        isPlatformHost = true;
        break;
      }
      const suffix = `.${root}`;
      if (host.endsWith(suffix)) {
        const label = host.slice(0, -suffix.length);
        if (label && !label.includes('.')) {
          if (['www', 'api', 'app', 'assets'].includes(label)) isPlatformHost = true;
          else requestedSlug = label;
          break;
        }
      }
    }
    // The slug header is useful for local development on localhost. In
    // production, tenant identity always comes from a verified hostname.
    const developmentSlug = process.env.NODE_ENV !== 'production' &&
      ['localhost', '127.0.0.1'].includes(host)
      ? req.get('x-organization-slug')
      : undefined;
    requestedSlug = String(requestedSlug || developmentSlug || '').trim().toLowerCase() || undefined;
    if (!requestedSlug && isPlatformHost) return next();

    const hostnameMatch = requestedSlug
      ? eq(organizations.slug, requestedSlug)
      : eq(organizations.customDomain, host);
    const [org] = await db.select().from(organizations).where(and(
      hostnameMatch,
      eq(organizations.isActive, true),
      ...(requestedSlug ? [] : [eq(organizations.customDomainStatus, 'active'), isNotNull(organizations.customDomainVerifiedAt)]),
    )).limit(1);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    req.organization = org;
    return next();
  } catch (err) {
    return next(err);
  }
}
