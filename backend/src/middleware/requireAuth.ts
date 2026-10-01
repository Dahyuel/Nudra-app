import { Request, Response, NextFunction } from 'express';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { sessions, users, User } from '../db/schema';

declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, 'passwordHash'>;
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
        instructorStatus: users.instructorStatus,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (rows.length === 0) {
      res.clearCookie('session_id');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    console.error('requireAuth error', err);
    res.clearCookie('session_id');
    return res.status(401).json({ message: 'Unauthorized' });
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
    if (role === 'instructor' && !isApprovedInstructor(req.user)) {
      return res.status(403).json({
        message: 'Your instructor application has not been approved yet',
        code: 'INSTRUCTOR_NOT_APPROVED',
      });
    }
    next();
  };
};
