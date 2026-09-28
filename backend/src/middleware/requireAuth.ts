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

export const requireRole = (role: 'student' | 'instructor') => {
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
    next();
  };
};
