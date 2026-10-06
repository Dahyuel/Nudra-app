import { Request, Response, NextFunction } from 'express';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { sessions, users, orgMemberships, User, Organization } from '../db/schema';
import { clearSessionCookie } from '../lib/sessionCookie';

declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, 'passwordHash'>;
      organization?: Organization;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const sessionId = req.cookies?.session_id;

  if (!sessionId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        avatarUrl: users.avatarUrl,
        grade: users.grade,
        phone: users.phone,
        instructorStatus: users.instructorStatus,
        mustChangePassword: users.mustChangePassword,
        preferredLanguage: users.preferredLanguage,
        notifyCommunity: users.notifyCommunity,
        notifySessions: users.notifySessions,
        organizationId: users.organizationId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (rows.length === 0) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!(await isUserAllowedInOrganization(rows[0], req.organization))) {
      return res.status(403).json({ message: 'This account cannot access this organization.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    console.error('requireAuth error', err);
    clearSessionCookie(res);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

/**
 * Enforce account realm boundaries for HTTP requests and realtime sockets.
 * Organization-scoped accounts cannot switch organizations. Global accounts
 * may enter an organization only as Nudra admins or active managers there.
 */
export async function isUserAllowedInOrganization(
  user: Pick<User, 'id' | 'role' | 'organizationId'>,
  organization?: Organization,
): Promise<boolean> {
  if (!organization) return user.organizationId === null;
  if (user.organizationId === organization.id) return true;
  if (user.organizationId !== null) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'organization_manager') return false;

  const [membership] = await db.select({ id: orgMemberships.id }).from(orgMemberships).where(and(
    eq(orgMemberships.orgId, organization.id),
    eq(orgMemberships.userId, user.id),
    eq(orgMemberships.role, 'organization_manager'),
    eq(orgMemberships.status, 'active'),
  )).limit(1);
  return Boolean(membership);
}

const ORGANIZATION_LEARNING_SECTIONS = new Set([
  'courses', 'my-courses', 'instructor', 'progress', 'notes', 'ai', 'videos',
  'community', 'stats', 'quizzes', 'sanaweya', 'notifications', 'search', 'payments',
  'bookings',
]);

/**
 * Pending or invited organization accounts may use account and membership
 * workflows, but must not call learning APIs until their membership is active.
 * This is mounted centrally after resolveOrg; route-specific auth still owns
 * unauthenticated responses. Organization manager/admin exceptions are covered
 * by isUserAllowedInOrganization.
 */
export const requireActiveOrganizationMembership = async (req: Request, res: Response, next: NextFunction) => {
  const apiPath = req.originalUrl.split('?')[0].replace(/^\/api(?=\/|$)/, '');
  const section = apiPath.split('/').filter(Boolean)[0] || '';
  if (!req.organization || !ORGANIZATION_LEARNING_SECTIONS.has(section)) {
    return next();
  }

  const sessionId = req.cookies?.session_id;
  if (!sessionId) return next();

  try {
    const [row] = await db.select({
      user: {
        id: users.id,
        role: users.role,
        organizationId: users.organizationId,
      },
    }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(
      eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date()),
    )).limit(1);
    if (!row) return next();

    if (!(await isUserAllowedInOrganization(row.user, req.organization))) {
      return res.status(403).json({ message: 'This account cannot access this organization.' });
    }

    if (row.user.organizationId === req.organization.id) {
      const [membership] = await db.select({ id: orgMemberships.id }).from(orgMemberships).where(and(
        eq(orgMemberships.orgId, req.organization.id),
        eq(orgMemberships.userId, row.user.id),
        eq(orgMemberships.status, 'active'),
      )).limit(1);
      if (!membership) {
        return res.status(403).json({ message: 'Organization approval is required before accessing learning features.' });
      }
    }

    return next();
  } catch (err) {
    console.error('requireActiveOrganizationMembership error', err);
    return res.status(503).json({ message: 'Organization access could not be verified.' });
  }
};

// NULL status covers seeded/legacy instructors created before the approval flow.
export const isApprovedInstructor = (user: { role: string; instructorStatus: string | null }) =>
  user.role === 'instructor' && (user.instructorStatus === null || user.instructorStatus === 'approved');

// Instructors may also use student routes (student portal); admins must match exactly.
export const requireRole = (role: 'student' | 'instructor' | 'admin') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (role === 'student' && req.user.role === 'instructor') {
      return next();
    }
    if (req.user.role !== role) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (role === 'admin' && req.user.organizationId !== null) {
      return res.status(403).json({ message: 'A global administrator account is required.' });
    }
    if (role === 'instructor' && !isApprovedInstructor(req.user)) {
      return res.status(403).json({
        message: 'Your instructor application has not been approved yet',
        code: 'INSTRUCTOR_NOT_APPROVED',
      });
    }
    next();
  };
};
