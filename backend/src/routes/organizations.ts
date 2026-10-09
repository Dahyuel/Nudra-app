import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { and, eq, desc, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { courses, courseSections, organizations, organizationLandingPages, orgMemberships, users, passwordResetTokens } from '../db/schema';
import { defaultLandingPage, landingPageSchema } from '../lib/organizationLanding';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import { sendOrganizationInstructorInviteEmail } from '../lib/mailer';
import { createDomainChallenge, normalizeHostname, verifyDomainChallenge } from '../lib/domainVerification';

const router = Router();
const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/);
const RESERVED_ORG_SLUGS = new Set(['admin', 'api', 'app', 'assets', 'auth', 'cdn', 'mail', 'static', 'support', 'www']);

async function managerAccess(orgId: string, userId: string) {
  const [membership] = await db.select({ id: orgMemberships.id }).from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId),
      eq(orgMemberships.role, 'organization_manager'), eq(orgMemberships.status, 'active'),
      isNull(users.organizationId), or(eq(users.role, 'organization_manager'), eq(users.role, 'admin')))).limit(1);
  return Boolean(membership);
}

async function globalAdmin(userId: string) {
  const [admin] = await db.select({ id: users.id }).from(users).where(and(
    eq(users.id, userId), eq(users.role, 'admin'), isNull(users.organizationId),
  )).limit(1);
  return Boolean(admin);
}

async function organizationAccount(userId: string, orgId: string, role?: 'student' | 'instructor') {
  const [account] = await db.select({ id: users.id }).from(users).where(and(
    eq(users.id, userId), eq(users.organizationId, orgId), ...(role ? [eq(users.role, role)] : []),
  )).limit(1);
  return Boolean(account);
}

async function canManageOrganization(orgId: string, userId: string, role: string) {
  return role === 'admin' ? globalAdmin(userId) : managerAccess(orgId, userId);
}

router.post('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  if (!(await globalAdmin(req.user!.id))) return res.status(403).json({ message: 'A global administrator account is required.' });
  const parsed = z.object({ name: z.string().trim().min(2).max(255), slug: slugSchema,
    managerEmail: z.string().trim().email().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Enter an organization name, valid slug, and optional manager email.' });
  if (RESERVED_ORG_SLUGS.has(parsed.data.slug)) return res.status(400).json({ message: 'That subdomain is reserved. Choose another organization slug.' });
  try {
    const manager = parsed.data.managerEmail
      ? (await db.select({ id: users.id }).from(users).where(and(
        eq(users.email, parsed.data.managerEmail.toLowerCase()), isNull(users.organizationId),
        or(eq(users.role, 'organization_manager'), eq(users.role, 'admin')),
      )).limit(1))[0]
      : undefined;
    if (parsed.data.managerEmail && !manager) return res.status(404).json({ message: 'Manager account not found.' });
    const org = await db.transaction(async tx => {
    const [org] = await tx.insert(organizations).values({
      name: parsed.data.name,
      slug: parsed.data.slug,
      ownerId: manager?.id ?? req.user!.id,
    }).returning();
    await tx.insert(orgMemberships).values({
      orgId: org.id,
      userId: manager?.id ?? req.user!.id,
      role: 'organization_manager',
      status: 'active',
    });
    return org;
    });
    return res.status(201).json({ organization: org });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('organizations_slug_unique') || message.includes('duplicate key')) {
      return res.status(409).json({ message: 'That organization slug is already in use.' });
    }
    console.error('create organization error', err);
    return res.status(500).json({ message: 'Could not create organization.' });
  }
});

// The public directory is available only from the global Nudra host. Return
// organization profile fields that are intentionally safe to display publicly;
// never include owner, member, course, or domain-verification details.
router.get('/directory', async (req: Request, res: Response, next) => {
  if (req.organization) return res.status(404).json({ message: 'Organization directory is available on Nudra.' });
  try {
    const rows = await db.select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      logoUrl: organizations.logoUrl,
      primaryColor: organizations.primaryColor,
      customDomain: organizations.customDomain,
      customDomainStatus: organizations.customDomainStatus,
      customDomainVerifiedAt: organizations.customDomainVerifiedAt,
    }).from(organizations).where(eq(organizations.isActive, true)).orderBy(organizations.name);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json({ organizations: rows.map(({ customDomain, customDomainStatus, customDomainVerifiedAt, ...organization }) => ({
      ...organization,
      customDomain: customDomainStatus === 'active' && customDomainVerifiedAt ? customDomain : null,
    })) });
  } catch (error) {
    return next(error);
  }
});

async function publicOrganizationCourses(orgId: string) {
  return db.select({ id: courses.id, title: courses.title, description: courses.description,
    category: courses.category, level: courses.level, thumbnailUrl: courses.thumbnailUrl,
    deliveryMode: courses.deliveryMode, price: courses.price, location: courses.location,
    scheduleText: courses.scheduleText, bookingUrl: courses.bookingUrl })
    .from(courses).where(and(eq(courses.organizationId, orgId), eq(courses.isPublished, true), eq(courses.approvalStatus, 'approved')))
    .orderBy(desc(courses.createdAt)).limit(100);
}

router.get('/public-current', async (req: Request, res: Response, next) => {
  if (!req.organization) return res.status(404).json({ message: 'No organization is configured for this domain.' });
  const { id, name, slug, logoUrl, primaryColor, customDomain } = req.organization;
  try {
    const [page] = await db.select({ published: organizationLandingPages.published }).from(organizationLandingPages)
      .where(eq(organizationLandingPages.orgId, id)).limit(1);
    const published = page?.published ? landingPageSchema.safeParse(page.published) : null;
    res.set('Cache-Control', 'no-store');
    return res.json({ organization: { id, name, slug, logoUrl, primaryColor, customDomain },
      landingPage: published?.success ? published.data : defaultLandingPage(req.organization),
      courses: await publicOrganizationCourses(id) });
  } catch (err) { return next(err); }
});

async function landingManagerAccess(req: Request) {
  return Boolean(req.organization?.id === req.params.orgId &&
    (req.user && await canManageOrganization(req.params.orgId, req.user.id, req.user.role)));
}

router.get('/:orgId/landing-page', requireAuth, async (req: Request, res: Response, next) => {
  try {
    if (!(await landingManagerAccess(req))) return res.status(403).json({ message: 'Organization manager access required.' });
    const [page] = await db.select().from(organizationLandingPages).where(eq(organizationLandingPages.orgId, req.params.orgId)).limit(1);
    const historyResult = await db.execute(sql`SELECT revision, actor_id AS "actorId", created_at AS "createdAt",
        (published IS NOT NULL) AS published
      FROM organization_landing_page_versions WHERE org_id=${req.params.orgId}
      ORDER BY revision DESC LIMIT 30`);
    res.set('Cache-Control', 'no-store');
    return res.json({ draft: page?.draft ?? defaultLandingPage(req.organization!), defaultData: defaultLandingPage(req.organization!), revision: page?.revision ?? 0,
      publishedAt: page?.publishedAt ?? null, updatedAt: page?.updatedAt ?? null,
      history: historyResult.rows,
      courses: await publicOrganizationCourses(req.params.orgId) });
  } catch (err) { return next(err); }
});

// Send the current editor state with publish; unpublished edits never leak to visitors.
router.put('/:orgId/landing-page', requireAuth, async (req: Request, res: Response, next) => {
  try {
    if (!(await landingManagerAccess(req))) return res.status(403).json({ message: 'Organization manager access required.' });
    const parsed = z.object({ data: landingPageSchema, expectedRevision: z.number().int().min(0), publish: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Check the landing page: ' + parsed.error.issues[0].message, errors: parsed.error.flatten() });
    const { data, expectedRevision, publish } = parsed.data;
    const now = new Date();
    const saved = await db.transaction(async (tx) => {
      let result;
      if (expectedRevision === 0) {
        const [created] = await tx.insert(organizationLandingPages).values({ orgId: req.params.orgId, draft: data,
          published: publish ? data : null, publishedAt: publish ? now : null, revision: 1, updatedAt: now })
          .onConflictDoNothing().returning();
        result = created;
      } else {
        const [updated] = await tx.update(organizationLandingPages).set({ draft: data,
          ...(publish ? { published: data, publishedAt: now } : {}), updatedAt: now,
          revision: sql`${organizationLandingPages.revision} + 1` })
          .where(and(eq(organizationLandingPages.orgId, req.params.orgId), eq(organizationLandingPages.revision, expectedRevision))).returning();
        result = updated;
      }
      if (result) await tx.execute(sql`INSERT INTO organization_landing_page_versions
        (org_id, revision, draft, published, actor_id)
        VALUES (${req.params.orgId}, ${result.revision}, ${JSON.stringify(result.draft)}::jsonb,
          ${result.published ? JSON.stringify(result.published) : null}::jsonb, ${req.user!.id})`);
      return result;
    });
    if (!saved) return res.status(409).json({ message: 'Someone else updated this page. Reload the editor before saving again.' });
    return res.json({ revision: saved.revision, updatedAt: saved.updatedAt, publishedAt: saved.publishedAt });
  } catch (err) { return next(err); }
});

router.post('/:orgId/landing-page/restore', requireAuth, async (req: Request, res: Response, next) => {
  try {
    if (!(await landingManagerAccess(req))) return res.status(403).json({ message: 'Organization manager access required.' });
    const parsed = z.object({ sourceRevision: z.number().int().positive(), expectedRevision: z.number().int().min(0), publish: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Choose a saved version and confirm the current revision.' });
    const restored = await db.transaction(async (tx) => {
      const [source] = await tx.execute(sql`SELECT draft FROM organization_landing_page_versions
        WHERE org_id=${req.params.orgId} AND revision=${parsed.data.sourceRevision} LIMIT 1`)
        .then((result) => result.rows as Array<{ draft: unknown }>);
      if (!source || !landingPageSchema.safeParse(source.draft).success) return null;
      const draft = landingPageSchema.parse(source.draft);
      const now = new Date();
      let saved;
      if (parsed.data.expectedRevision === 0) {
        const [created] = await tx.insert(organizationLandingPages).values({ orgId: req.params.orgId,
          draft, published: parsed.data.publish ? draft : null, publishedAt: parsed.data.publish ? now : null,
          revision: 1, updatedAt: now }).onConflictDoNothing().returning();
        saved = created;
      } else {
        const [updated] = await tx.update(organizationLandingPages).set({ draft,
          ...(parsed.data.publish ? { published: draft, publishedAt: now } : {}),
          updatedAt: now, revision: sql`${organizationLandingPages.revision} + 1` })
          .where(and(eq(organizationLandingPages.orgId, req.params.orgId), eq(organizationLandingPages.revision, parsed.data.expectedRevision))).returning();
        saved = updated;
      }
      if (!saved) return null;
      await tx.execute(sql`INSERT INTO organization_landing_page_versions
        (org_id, revision, draft, published, actor_id)
        VALUES (${req.params.orgId}, ${saved.revision}, ${JSON.stringify(saved.draft)}::jsonb,
          ${saved.published ? JSON.stringify(saved.published) : null}::jsonb, ${req.user!.id})`);
      return saved;
    });
    if (!restored) return res.status(409).json({ message: 'The selected version is unavailable or the page changed. Reload before restoring.' });
    return res.json({ revision: restored.revision, updatedAt: restored.updatedAt, publishedAt: restored.publishedAt });
  } catch (err) { return next(err); }
});

router.get('/current', requireAuth, async (req: Request, res: Response) => {
  const org = req.organization;
  if (!org) return res.status(404).json({ message: 'Open an organization domain to continue.' });
  const [membership] = await db.select({ membership: orgMemberships }).from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id)).where(and(
    eq(orgMemberships.orgId, org.id), eq(orgMemberships.userId, req.user!.id),
    or(eq(users.organizationId, org.id), and(isNull(users.organizationId),
      eq(orgMemberships.role, 'organization_manager'),
      or(eq(users.role, 'organization_manager'), eq(users.role, 'admin')))),
  )).limit(1);
  const courseRows = membership?.membership.status === 'active'
    ? await db.select({ id: courses.id, title: courses.title, description: courses.description,
        thumbnailUrl: courses.thumbnailUrl, category: courses.category, level: courses.level,
        deliveryMode: courses.deliveryMode, location: courses.location, scheduleText: courses.scheduleText,
        bookingUrl: courses.bookingUrl })
      .from(courses).where(and(eq(courses.organizationId, org.id), eq(courses.isPublished, true), eq(courses.approvalStatus, 'approved')))
      .orderBy(desc(courses.createdAt))
    : [];
  return res.json({ organization: {
    id: org.id, name: org.name, slug: org.slug, logoUrl: org.logoUrl,
    primaryColor: org.primaryColor, customDomain: org.customDomain,
    customDomainStatus: org.customDomainStatus,
  }, membership: membership?.membership ?? null, courses: courseRows });
});

router.post('/join', requireAuth, async (req: Request, res: Response) => {
  const org = req.organization;
  if (!org) return res.status(404).json({ message: 'Open an organization domain to request access.' });
  if (req.user!.role !== 'student') return res.status(403).json({ message: 'Only student accounts can request to join.' });
  if (!(await organizationAccount(req.user!.id, org.id, 'student'))) {
    return res.status(403).json({ message: 'Register or sign in through this organization to request access.' });
  }
  try {
    const [membership] = await db.insert(orgMemberships).values({
      orgId: org.id, userId: req.user!.id, role: 'student', status: 'pending',
    }).onConflictDoNothing().returning();
    if (membership) return res.status(201).json({ membership });
    const [existing] = await db.select().from(orgMemberships).where(and(
      eq(orgMemberships.orgId, org.id), eq(orgMemberships.userId, req.user!.id)
    )).limit(1);
    return res.json({ membership: existing });
  } catch (err) {
    console.error('organization join request error', err);
    return res.status(500).json({ message: 'Could not request organization access.' });
  }
});

router.get('/:orgId/requests', requireAuth, async (req: Request, res: Response) => {
  if (!(await managerAccess(req.params.orgId, req.user!.id))) return res.status(403).json({ message: 'Organization manager access required.' });
  const rows = await db.select({ membership: orgMemberships, name: users.name, email: users.email })
    .from(orgMemberships).innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(and(eq(orgMemberships.orgId, req.params.orgId), eq(orgMemberships.status, 'pending'),
      eq(orgMemberships.role, 'student'), eq(users.organizationId, req.params.orgId)))
    .orderBy(desc(orgMemberships.createdAt));
  return res.json({ requests: rows });
});

router.get('/:orgId/members', requireAuth, async (req: Request, res: Response) => {
  if (!(await managerAccess(req.params.orgId, req.user!.id))) return res.status(403).json({ message: 'Organization manager access required.' });
  const rows = await db.select({ membership: orgMemberships, name: users.name, email: users.email, userId: users.id })
    .from(orgMemberships).innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(and(eq(orgMemberships.orgId, req.params.orgId), or(
      eq(users.organizationId, req.params.orgId),
      and(isNull(users.organizationId), eq(orgMemberships.role, 'organization_manager'),
        or(eq(users.role, 'organization_manager'), eq(users.role, 'admin'))),
    ))).orderBy(desc(orgMemberships.createdAt));
  return res.json({ members: rows });
});

router.get('/:orgId/courses', requireAuth, async (req: Request, res: Response) => {
  if (!(await managerAccess(req.params.orgId, req.user!.id))) return res.status(403).json({ message: 'Organization manager access required.' });
  const rows = await db.select({ course: courses, instructorName: users.name, instructorEmail: users.email, instructorId: users.id })
    .from(courses).innerJoin(users, eq(courses.instructorId, users.id))
    .where(and(eq(courses.organizationId, req.params.orgId), eq(users.organizationId, req.params.orgId)))
    .orderBy(desc(courses.updatedAt));
  return res.json({ courses: rows.map((row) => ({ ...row.course, instructorId: row.instructorId, instructorName: row.instructorName, instructorEmail: row.instructorEmail })) });
});

router.post('/:orgId/courses', requireAuth, async (req: Request, res: Response) => {
  if (!(await managerAccess(req.params.orgId, req.user!.id))) return res.status(403).json({ message: 'Organization manager access required.' });
  const parsed = z.object({
    instructorId: z.string().uuid(), title: z.string().trim().min(2).max(255), description: z.string().trim().min(1).max(5000),
    category: z.string().trim().min(1).max(255), level: z.string().trim().min(1).max(255), deliveryMode: z.enum(['online', 'offline']),
    price: z.union([z.number().min(0).max(999999), z.string().min(1)]).optional(), thumbnailUrl: z.string().url().max(2048).optional().nullable(),
    location: z.string().trim().max(1000).optional(), bookingUrl: z.string().url().max(2048).optional().nullable(),
    scheduleText: z.string().trim().max(2000).optional(), capacity: z.number().int().min(1).max(100000).optional(),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Enter valid course details and select an active organization instructor.', errors: parsed.error.flatten() });
  if (parsed.data.deliveryMode === 'offline' && (!parsed.data.location || !parsed.data.scheduleText)) {
    return res.status(400).json({ message: 'Offline courses need a location and schedule.' });
  }
  const [membership] = await db.select({ id: orgMemberships.id }).from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id)).where(and(
    eq(orgMemberships.orgId, req.params.orgId), eq(orgMemberships.userId, parsed.data.instructorId),
    eq(orgMemberships.role, 'instructor'), eq(orgMemberships.status, 'active'),
    eq(users.organizationId, req.params.orgId), eq(users.role, 'instructor'))).limit(1);
  if (!membership) return res.status(400).json({ message: 'The selected instructor is not an active member of this organization.' });
  const course = await db.transaction(async tx => {
  const [course] = await tx.insert(courses).values({
    instructorId: parsed.data.instructorId, organizationId: req.params.orgId, title: parsed.data.title,
    description: parsed.data.description, category: parsed.data.category, level: parsed.data.level,
    deliveryMode: parsed.data.deliveryMode, price: parsed.data.deliveryMode === 'offline' ? '0' : String(parsed.data.price ?? 0),
    thumbnailUrl: parsed.data.thumbnailUrl ?? null, location: parsed.data.location ?? null,
    bookingUrl: parsed.data.bookingUrl ?? null, scheduleText: parsed.data.scheduleText ?? null,
    capacity: parsed.data.capacity ?? null,
    isPublished: false, approvalStatus: 'approved',
  }).returning();
  await tx.insert(courseSections).values({ courseId: course.id, title: 'Course content', position: 1 });
  return course;
  });
  return res.status(201).json({ course });
});

router.post('/:orgId/courses/:courseId/decision', requireAuth, async (req: Request, res: Response) => {
  if (!(await managerAccess(req.params.orgId, req.user!.id))) return res.status(403).json({ message: 'Organization manager access required.' });
  const parsed = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(1000).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Choose approve or reject.' });
  const [pendingCourse] = await db.select({ deliveryMode: courses.deliveryMode }).from(courses).where(and(
    eq(courses.id, req.params.courseId), eq(courses.organizationId, req.params.orgId), eq(courses.approvalStatus, 'pending'))).limit(1);
  if (!pendingCourse) return res.status(404).json({ message: 'Pending course submission not found.' });
  const [updated] = await db.update(courses).set({
    approvalStatus: parsed.data.decision === 'approve' ? 'approved' : 'rejected',
    approvalNote: parsed.data.note ?? null,
    isPublished: parsed.data.decision === 'approve' && pendingCourse.deliveryMode === 'offline', updatedAt: new Date(),
  }).where(and(eq(courses.id, req.params.courseId), eq(courses.organizationId, req.params.orgId), eq(courses.approvalStatus, 'pending'))).returning();
  if (!updated) return res.status(404).json({ message: 'Pending course submission not found.' });
  return res.json({ course: updated });
});

router.post('/:orgId/courses/:courseId/visibility', requireAuth, async (req: Request, res: Response) => {
  if (!(await managerAccess(req.params.orgId, req.user!.id))) return res.status(403).json({ message: 'Organization manager access required.' });
  const parsed = z.object({ published: z.boolean() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Choose whether to publish this course.' });
  const [course] = await db.update(courses).set({ isPublished: parsed.data.published, updatedAt: new Date() }).where(and(
    eq(courses.id, req.params.courseId), eq(courses.organizationId, req.params.orgId), eq(courses.approvalStatus, 'approved'))).returning();
  if (!course) return res.status(404).json({ message: 'Approved organization course not found.' });
  return res.json({ course });
});

router.post('/:orgId/domain', requireAuth, async (req: Request, res: Response) => {
  if (!(await canManageOrganization(req.params.orgId, req.user!.id, req.user!.role))) {
    return res.status(403).json({ message: 'Organization manager access required.' });
  }
  const parsed = z.object({ domain: z.string().trim().max(255).nullable() }).strict().safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Enter a valid custom domain.' });
  const input = parsed.data.domain;
  if (input === null || input === '') {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, req.params.orgId)).limit(1);
    if (!org) return res.status(404).json({ message: 'Organization not found.' });
    const [updated] = await db.update(organizations).set({
      customDomain: null,
      customDomainStatus: 'unconfigured',
      customDomainDnsRecords: [],
      customDomainVerificationTokenHash: null,
      customDomainVerifiedAt: null,
    }).where(eq(organizations.id, org.id)).returning();
    return res.json({ organization: updated });
  }
  const normalized = normalizeHostname(input);
  const baseDomain = normalizeHostname(process.env.BASE_DOMAIN || process.env.NUDRA_BASE_DOMAIN || 'nudra.org');
  if (!normalized || normalized === baseDomain || normalized.endsWith(`.${baseDomain}`) ||
      normalized === 'nudra.com' || normalized.endsWith('.nudra.com')) {
    return res.status(400).json({ message: 'Enter a domain you own, such as learn.example.com. Nudra domains are reserved.' });
  }
  try {
    const challenge = createDomainChallenge(normalized, process.env.PUBLIC_IPV4 || '');
    const [updated] = await db.update(organizations).set({
      customDomain: normalized,
      customDomainStatus: 'pending',
      customDomainDnsRecords: challenge.dnsRecords,
      customDomainVerificationTokenHash: challenge.tokenHash,
      customDomainVerifiedAt: null,
    }).where(eq(organizations.id, req.params.orgId)).returning();
    return res.json({ organization: updated, domain: { status: 'pending', dnsRecords: challenge.dnsRecords } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('PUBLIC_IPV4')) return res.status(503).json({ message: 'Custom domains are not available until the VPS public IPv4 is configured.' });
    if (message.includes('custom_domain') || message.includes('duplicate key')) {
      return res.status(409).json({ message: 'That domain is already connected to another organization.' });
    }
    console.error('organization domain setup failed', err);
    return res.status(502).json({ message: 'Could not save this domain. Check the domain and try again.' });
  }
});

router.post('/:orgId/domain/verify', requireAuth, async (req: Request, res: Response) => {
  if (!(await canManageOrganization(req.params.orgId, req.user!.id, req.user!.role))) {
    return res.status(403).json({ message: 'Organization manager access required.' });
  }
  const [org] = await db.select().from(organizations).where(eq(organizations.id, req.params.orgId)).limit(1);
  if (!org?.customDomain) return res.status(404).json({ message: 'Add a custom domain first.' });
  try {
    const publicIpv4 = process.env.PUBLIC_IPV4 || '';
    if (!org.customDomainVerificationTokenHash) {
      const challenge = createDomainChallenge(org.customDomain, publicIpv4);
      const [updated] = await db.update(organizations).set({
        customDomainStatus: 'pending',
        customDomainDnsRecords: challenge.dnsRecords,
        customDomainVerificationTokenHash: challenge.tokenHash,
        customDomainVerifiedAt: null,
      }).where(eq(organizations.id, org.id)).returning();
      return res.json({ organization: updated, domain: { status: 'pending', dnsRecords: challenge.dnsRecords } });
    }
    const isVerified = await verifyDomainChallenge(
      org.customDomain,
      org.customDomainVerificationTokenHash,
      publicIpv4,
    );
    const status = isVerified ? 'active' : 'pending';
    const [updated] = await db.update(organizations).set({
      customDomainStatus: status,
      customDomainVerifiedAt: isVerified ? new Date() : null,
    }).where(eq(organizations.id, org.id)).returning();
    return res.json({ organization: updated, domain: { status, dnsRecords: updated.customDomainDnsRecords } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('PUBLIC_IPV4')) return res.status(503).json({ message: 'Custom domains are not available until the VPS public IPv4 is configured.' });
    console.error('organization domain verification failed', err);
    return res.status(502).json({ message: 'Could not check this domain. Try again shortly.' });
  }
});

router.post('/:orgId/instructors/invite', requireAuth, async (req: Request, res: Response) => {
  if (!(await managerAccess(req.params.orgId, req.user!.id))) return res.status(403).json({ message: 'Organization manager access required.' });
  const [organizationExists] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, req.params.orgId)).limit(1);
  if (!organizationExists) return res.status(404).json({ message: 'Organization not found.' });
  const parsed = z.object({ email: z.string().trim().email(), name: z.string().trim().min(2).max(255).optional().or(z.literal('')) }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Enter a valid instructor name and email.' });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({message:'Invitation email is unavailable.'});
  const email = parsed.data.email.toLowerCase();
  const passwordHash=await bcrypt.hash(randomBytes(32).toString('base64url'),12);
  const setupToken=randomBytes(32).toString('base64url');
  const membership=await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.params.orgId+':'+email}))`);
    const [org]=await tx.select({name:organizations.name,slug:organizations.slug}).from(organizations).where(eq(organizations.id,req.params.orgId)).for('update');
    if(!org)throw Object.assign(new Error('Organization not found.'),{status:404});
    let [instructor]=await tx.select().from(users).where(and(eq(users.email,email),eq(users.organizationId,req.params.orgId))).limit(1);
    const created=!instructor;
    if(!instructor) {
      if(!parsed.data.name)throw Object.assign(new Error('Enter the instructor name.'),{status:400});
      [instructor]=await tx.insert(users).values({name:parsed.data.name,email,passwordHash,organizationId:req.params.orgId,role:'instructor',instructorStatus:'approved',mustChangePassword:true}).returning();
      await tx.insert(passwordResetTokens).values({userId:instructor.id,tokenHash:createHash('sha256').update(setupToken).digest('hex'),expiresAt:new Date(Date.now()+30*60*1000)});
    }
    if(instructor.role!=='instructor'||(instructor.instructorStatus!==null&&instructor.instructorStatus!=='approved'))throw Object.assign(new Error('An approved instructor account is required.'),{status:409});
    const [membership]=await tx.insert(orgMemberships).values({orgId:req.params.orgId,userId:instructor.id,role:'instructor',status:created?'active':'invited'}).onConflictDoNothing().returning();
    if(!membership)throw Object.assign(new Error('Membership or invitation already exists.'),{status:409});
    await sendOrganizationInstructorInviteEmail({name:instructor.name,email,organizationName:org.name,organizationSlug:org.slug,membershipId:membership.id,setupToken:created?setupToken:undefined},tx);
    return membership;
  });
  return res.status(201).json({membership});
});

router.put('/:orgId/branding', requireAuth, async (req: Request, res: Response) => {
  if (!(await canManageOrganization(req.params.orgId, req.user!.id, req.user!.role))) {
    return res.status(403).json({ message: 'Organization manager access required.' });
  }
  const parsed = z.object({
    name: z.string().trim().min(2).max(255).optional(),
    logoUrl: z.string().url().max(2048).nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  }).strict().safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Check the organization name, logo URL, color, and domain.' });
  try {
    const [organization] = await db.update(organizations).set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.logoUrl !== undefined ? { logoUrl: parsed.data.logoUrl } : {}),
      ...(parsed.data.primaryColor !== undefined ? { primaryColor: parsed.data.primaryColor } : {}),
    }).where(eq(organizations.id, req.params.orgId)).returning();
    return res.json({ organization });
  } catch (err) {
    console.warn('organization branding update failed', err);
    return res.status(409).json({ message: 'That custom domain is already connected to another organization.' });
  }
});

router.post('/:orgId/members/:membershipId/decision', requireAuth, async (req: Request, res: Response) => {
  if (!(await managerAccess(req.params.orgId, req.user!.id))) return res.status(403).json({ message: 'Organization manager access required.' });
  const parsed = z.object({ decision: z.enum(['approve', 'reject']) }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Choose approve or reject.' });
  const [target] = await db.select({ id: orgMemberships.id }).from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id)).where(and(
      eq(orgMemberships.id, req.params.membershipId), eq(orgMemberships.orgId, req.params.orgId),
      eq(orgMemberships.role, 'student'), eq(users.organizationId, req.params.orgId),
    )).limit(1);
  if (!target) return res.status(404).json({ message: 'Pending request not found.' });
  const [updated] = await db.update(orgMemberships).set({
    status: parsed.data.decision === 'approve' ? 'active' : 'rejected',
  }).where(and(eq(orgMemberships.id, req.params.membershipId), eq(orgMemberships.orgId, req.params.orgId),
    eq(orgMemberships.status, 'pending'))).returning();
  if (!updated) return res.status(404).json({ message: 'Pending request not found.' });
  return res.json({ membership: updated });
});

router.post('/:orgId/invitations/:membershipId/accept', requireAuth, async (req: Request, res: Response) => {
  if (!(await organizationAccount(req.user!.id, req.params.orgId, 'instructor'))) {
    return res.status(403).json({ message: 'Sign in with the instructor account created for this organization.' });
  }
  const [updated] = await db.update(orgMemberships).set({ status: 'active' }).where(and(
    eq(orgMemberships.id, req.params.membershipId), eq(orgMemberships.orgId, req.params.orgId),
    eq(orgMemberships.userId, req.user!.id), eq(orgMemberships.role, 'instructor'),
    eq(orgMemberships.status, 'invited'),
  )).returning();
  if (!updated) return res.status(404).json({ message: 'Organization invitation not found.' });
  return res.json({ membership: updated });
});

export default router;
