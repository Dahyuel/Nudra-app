import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { users, sessions, instructorApplications } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';
import { sendWelcomeEmail } from '../lib/mailer';
import { createNotification } from '../lib/notifications';
import { minioClient, THUMBNAIL_BUCKET, getThumbnailUrl } from '../lib/minio';

const router = Router();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: THIRTY_DAYS_MS,
};

function isValidPassword(password: string): boolean {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 8) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  return hasUpper && hasLower && hasDigit;
}

function sanitizeEmail(email: string): string {
  return String(email).toLowerCase().trim();
}

const publicUser = (user: typeof users.$inferSelect) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatarUrl: user.avatarUrl,
  grade: user.grade,
  instructorStatus: user.instructorStatus,
});

async function startSession(res: Response, userId: string) {
  const sessionRows = await db
    .insert(sessions)
    .values({
      userId,
      expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
    })
    .returning();

  res.cookie('session_id', sessionRows[0].id, COOKIE_OPTIONS);
}

const instructorApplicationSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().trim().max(255),
  password: z.string(),
  subjects: z.string().trim().min(2).max(500),
  experienceYears: z.number().int().min(0).max(60),
  bio: z.string().trim().min(30).max(3000),
  portfolioUrl: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) link')
    .optional()
    .or(z.literal('')),
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only jpg, jpeg, png, webp images are allowed'));
    }
  },
});

const profileSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  avatarUrl: z.string().url().max(2048).optional(),
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, grade } = req.body ?? {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Public sign-up is students only. Instructors apply via /register-instructor
    // and must be approved before they get instructor access.
    if (role !== undefined && role !== 'student') {
      return res.status(400).json({
        message: 'Instructor accounts require an application. Please apply to teach instead.',
        code: 'INSTRUCTOR_APPLICATION_REQUIRED',
      });
    }

    const normalizedEmail = sanitizeEmail(email);

    if (!normalizedEmail.includes('@') || normalizedEmail.length > 255) {
      return res.status(400).json({ message: 'Invalid email address' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and contain uppercase, lowercase, and numeric characters',
      });
    }

    const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const inserted = await db
      .insert(users)
      .values({
        name: name.trim().slice(0, 255),
        email: normalizedEmail,
        passwordHash,
        role: 'student',
        grade: grade ? String(grade).trim().slice(0, 255) : null,
      })
      .returning();

    const user = inserted[0];

    await startSession(res, user.id);

    sendWelcomeEmail({ name: user.name, email: user.email, role: user.role }).catch(console.warn);
    createNotification(
      user.id,
      'enrollment_confirmed',
      'مرحباً بك في ندرة',
      'تم إنشاء حسابك بنجاح',
      '/dashboard'
    ).catch(console.warn);

    return res.status(201).json({
      message: 'Account created successfully',
      user: publicUser(user),
    });
  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Teacher applies to teach: creates an instructor account in 'pending' state.
// It has no instructor API access until approved (see scripts/instructors.ts).
router.post('/register-instructor', async (req: Request, res: Response) => {
  try {
    const parsed = instructorApplicationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Please check the application fields',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { name, password, subjects, experienceYears, bio, portfolioUrl } = parsed.data;
    const normalizedEmail = sanitizeEmail(parsed.data.email);

    if (!normalizedEmail.includes('@')) {
      return res.status(400).json({ message: 'Invalid email address' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and contain uppercase, lowercase, and numeric characters',
      });
    }

    const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          name,
          email: normalizedEmail,
          passwordHash,
          role: 'instructor',
          instructorStatus: 'pending',
        })
        .returning();

      await tx.insert(instructorApplications).values({
        userId: created.id,
        subjects,
        experienceYears,
        bio,
        portfolioUrl: portfolioUrl || null,
      });

      return created;
    });

    await startSession(res, user.id);

    createNotification(
      user.id,
      'instructor_application',
      'Application received',
      'Thanks for applying to teach on Nudra. We will review your application and notify you.',
      '/instructor/pending'
    ).catch(console.warn);

    return res.status(201).json({
      message: 'Application submitted',
      user: publicUser(user),
    });
  } catch (err) {
    console.error('register-instructor error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/instructor-application', requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        status: instructorApplications.status,
        subjects: instructorApplications.subjects,
        reviewNote: instructorApplications.reviewNote,
        createdAt: instructorApplications.createdAt,
        reviewedAt: instructorApplications.reviewedAt,
      })
      .from(instructorApplications)
      .where(eq(instructorApplications.userId, req.user!.id))
      .limit(1);

    return res.json({ application: rows[0] ?? null });
  } catch (err) {
    console.error('get instructor application error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, role } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = sanitizeEmail(email);

    const rows = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = rows[0];

    if (role && user.role !== role) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    await db.delete(sessions).where(eq(sessions.userId, user.id));

    const sessionRows = await db
      .insert(sessions)
      .values({
        userId: user.id,
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
      })
      .returning();

    res.cookie('session_id', sessionRows[0].id, COOKIE_OPTIONS);

    return res.json({
      message: 'Logged in successfully',
      user: publicUser(user),
    });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session_id;

    if (sessionId) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }

    res.clearCookie('session_id');
    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('logout error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session_id;

    if (!sessionId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        avatarUrl: users.avatarUrl,
        grade: users.grade,
        instructorStatus: users.instructorStatus,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (rows.length === 0) {
      res.clearCookie('session_id');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('me error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = profileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid profile data' });
    }

    const { name, avatarUrl } = parsed.data;

    const updates: Partial<typeof users.$inferInsert> = {};
    if (name !== undefined) updates.name = name.trim();
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const rows = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.user!.id))
      .returning();

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    console.error('profile update error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    const rows = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = rows[0];

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and contain uppercase, lowercase, and numeric characters',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('password update error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/avatar',
  requireAuth,
  avatarUpload.single('avatar'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const extByMime: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      };
      const ext = extByMime[req.file.mimetype] ?? 'jpg';
      const objectName = `avatars/${req.user!.id}-${randomUUID()}.${ext}`;

      await minioClient.putObject(THUMBNAIL_BUCKET, objectName, req.file.buffer, req.file.size, {
        'Content-Type': req.file.mimetype,
      });

      const avatarUrl = getThumbnailUrl(objectName);

      await db.update(users).set({ avatarUrl }).where(eq(users.id, req.user!.id));

      return res.json({ avatarUrl });
    } catch (err) {
      console.error('avatar upload error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

export default router;
