import { disconnectUser, disconnectSession } from '../lib/socket';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { z } from 'zod';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { eq, and, gt, ne, isNull, sql } from 'drizzle-orm';
import { decryptMfaSecret, verifyTotp } from '../lib/totp';
import { queueEmail } from '../lib/emailOutbox';
import { createRateLimiter } from '../middleware/rateLimit';
import { db } from '../db';
import { users, sessions, instructorApplications, passwordResetTokens, orgMemberships } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../lib/mailer';
import { createNotification } from '../lib/notifications';
import { r2Client, THUMBNAIL_BUCKET, getThumbnailUrl, storage } from '../lib/minio';
import { clearSessionCookie, SESSION_COOKIE_OPTIONS } from '../lib/sessionCookie';

const router = Router();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);

async function queueVerification(user:{id:string;email:string},req:Request,executor:Pick<typeof db,'execute'>=db) {
 const token=randomBytes(32).toString('base64url');
 await executor.execute(sql`DELETE FROM email_verification_tokens WHERE user_id=${user.id}`);
 await executor.execute(sql`INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES(${user.id},${createHash('sha256').update(token).digest('hex')},now()+interval '24 hours')`);
 const base=req.organization && process.env.NODE_ENV==='production' ? 'https://'+req.organization.slug+'.'+process.env.BASE_DOMAIN : process.env.FRONTEND_URL||'http://localhost:3000';
 const url=new URL('/api/auth/verify-email',base);url.searchParams.set('token',token);if(req.organization)url.searchParams.set('org',req.organization.slug);
 await queueEmail({to:user.email,from:process.env.SMTP_FROM||'Nudra Support <support@nudra.org>',subject:'Verify your Nudra email',html:'<p>Confirm this email address for your Nudra account. This link expires in 24 hours.</p><p><a href="'+url.toString().replace(/&/g,'&amp;')+'">Verify email</a></p>'},executor);
}
router.post('/verify-email/request',requireAuth,createRateLimiter({keyPrefix:'email-verification',maxRequests:3,windowSeconds:3600,errorMessage:'Try again later.'}),async(req,res)=>{
 if(req.user!.emailVerifiedAt)return res.json({message:'Email already verified.'});
 await db.transaction(tx=>queueVerification(req.user!,req,tx));
 return res.status(202).json({message:'Verification email queued.'});
});
router.get('/verify-email',async(req,res)=>{
 const token=req.query.token;if(typeof token!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(token))return res.status(400).json({message:'Invalid verification link.'});
 const verified=await db.transaction(async tx=>{
  const result=await tx.execute(sql`DELETE FROM email_verification_tokens t USING users u WHERE t.user_id=u.id AND t.token_hash=${createHash('sha256').update(token).digest('hex')} AND t.expires_at>now() AND u.organization_id IS NOT DISTINCT FROM ${req.organization?.id??null}::uuid RETURNING t.user_id`);
  if(!result.rows[0])return false;
  await tx.update(users).set({emailVerifiedAt:new Date()}).where(eq(users.id,String(result.rows[0].user_id)));return true;
 });
 return res.status(verified?200:400).json({message:verified?'Email verified. You may return to Nudra.':'This verification link has expired or already been used.'});
});

function isValidPassword(password: string): boolean {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return false;
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
  emailVerifiedAt: user.emailVerifiedAt,
  role: user.role,
  avatarUrl: user.avatarUrl,
  grade: user.grade,
  instructorStatus: user.instructorStatus,
  mustChangePassword: user.mustChangePassword,
  preferences: {
    language: user.preferredLanguage,
    notifyCommunity: user.notifyCommunity,
    notifySessions: user.notifySessions,
  },
});

async function responseUser(req: Request, user: typeof users.$inferSelect) {
  if (!req.organization) return publicUser(user);
  const [membership] = await db.select({ id: orgMemberships.id, role: orgMemberships.role, status: orgMemberships.status })
    .from(orgMemberships).where(and(eq(orgMemberships.orgId, req.organization.id), eq(orgMemberships.userId, user.id))).limit(1);
  return {
    ...publicUser(user),
    organizationContext: {
      id: req.organization.id,
      name: req.organization.name,
      slug: req.organization.slug,
      logoUrl: req.organization.logoUrl,
      primaryColor: req.organization.primaryColor,
      membership: membership ?? null,
    },
  };
}

async function hasActiveOrganizationManagerMembership(orgId: string, userId: string): Promise<boolean> {
  const [membership] = await db.select({ id: orgMemberships.id }).from(orgMemberships).where(and(
    eq(orgMemberships.orgId, orgId),
    eq(orgMemberships.userId, userId),
    eq(orgMemberships.role, 'organization_manager'),
    eq(orgMemberships.status, 'active'),
  )).limit(1);
  return Boolean(membership);
}

async function isAllowedInRealm(user: typeof users.$inferSelect, req: Request): Promise<boolean> {
  if (!req.organization) return user.organizationId === null;
  if (user.organizationId === req.organization.id) {
    return user.role === 'student' || user.role === 'instructor';
  }
  if (user.organizationId !== null) return false;
  if (user.role === 'admin') return true;
  return user.role === 'organization_manager' &&
    await hasActiveOrganizationManagerMembership(req.organization.id, user.id);
}

async function findRealmUser(email: string, req: Request) {
  const globalScope = isNull(users.organizationId);
  if (!req.organization) {
    const [user] = await db.select().from(users).where(and(eq(users.email, email), globalScope)).limit(1);
    return user;
  }

  const [organizationUser] = await db.select().from(users).where(and(
    eq(users.email, email), eq(users.organizationId, req.organization.id),
  )).limit(1);
  if (organizationUser && await isAllowedInRealm(organizationUser, req)) return organizationUser;
  if (organizationUser) return undefined;

  const [globalUser] = await db.select().from(users).where(and(eq(users.email, email), globalScope)).limit(1);
  if (globalUser && await isAllowedInRealm(globalUser, req)) return globalUser;
  return undefined;
}

async function startSession(res: Response, userId: string) {
  const sessionRows = await db
    .insert(sessions)
    .values({
      userId,
      expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
    })
    .returning();

  res.cookie('session_id', sessionRows[0].id, SESSION_COOKIE_OPTIONS);
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

// Egyptian numbers plus a general international shape; we store what the user
// typed after trimming, but only accept 7–20 characters of digits, spaces,
// '+', '-', '(', ')'. The CSV later renders it verbatim.
const PHONE_PATTERN = /^[+()\-\s0-9]{7,20}$/;

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, grade, phone } = req.body ?? {};

    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 255 || typeof email !== 'string' || !email || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    if (!trimmedPhone) {
      return res.status(400).json({ message: 'A contact phone number is required.' });
    }
    if (!PHONE_PATTERN.test(trimmedPhone)) {
      return res.status(400).json({ message: 'Enter a valid phone number (digits, +, -, spaces).' });
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

    if (!z.string().email().max(255).safeParse(normalizedEmail).success) {
      return res.status(400).json({ message: 'Invalid email address' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and contain uppercase, lowercase, and numeric characters',
      });
    }

    const existing = await db.select({ id: users.id }).from(users).where(and(
      eq(users.email, normalizedEmail),
      req.organization ? eq(users.organizationId, req.organization.id) : isNull(users.organizationId),
    )).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          name: name.trim().slice(0, 255),
          email: normalizedEmail,
          organizationId: req.organization?.id ?? null,
          passwordHash,
          role: 'student',
          grade: grade ? String(grade).trim().slice(0, 255) : null,
          phone: trimmedPhone.slice(0, 32),
        })
        .returning();

      if (req.organization) {
        await tx.insert(orgMemberships).values({
          orgId: req.organization.id,
          userId: created.id,
          role: 'student',
          status: 'pending',
        });
      }
      await queueVerification(created,req,tx);
      await sendWelcomeEmail({name:created.name,email:created.email,role:created.role},tx);
      return created;
    });

    await startSession(res, user.id);

    createNotification(
      user.id,
      'enrollment_confirmed',
      'مرحباً بك في ندرة',
      'تم إنشاء حسابك بنجاح',
      '/dashboard'
    ).catch(console.warn);

    return res.status(201).json({
      message: 'Account created successfully',
      user: await responseUser(req, user),
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
    if (req.organization) {
      return res.status(403).json({ message: 'Ask your organization manager for an instructor invitation.' });
    }
    const parsed = instructorApplicationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Please check the application fields',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { name, password, subjects, experienceYears, bio, portfolioUrl } = parsed.data;
    const normalizedEmail = sanitizeEmail(parsed.data.email);

    if (!z.string().email().max(255).safeParse(normalizedEmail).success) {
      return res.status(400).json({ message: 'Invalid email address' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and contain uppercase, lowercase, and numeric characters',
      });
    }

    const existing = await db.select({ id: users.id }).from(users).where(and(
      eq(users.email, normalizedEmail), isNull(users.organizationId),
    )).limit(1);
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
      user: await responseUser(req, user),
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

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Always answers the same way whether or not the email exists, so this can't be
// used to discover which addresses have accounts.
router.post('/forgot-password', async (req: Request, res: Response) => {
  const genericReply = {
    message: 'If an account exists for that email, a password reset link has been sent.',
  };
  try {
    const email = typeof req.body?.email === 'string' ? sanitizeEmail(req.body.email) : '';
    if (!email.includes('@') || email.length > 255) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    const user = await findRealmUser(email, req);
    if (user) {
      const token = randomBytes(32).toString('base64url');
      await db.transaction(async (tx) => {
        await tx.select({id:users.id}).from(users).where(eq(users.id,user.id)).for('update');
        // Only the newest link works.
        await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
        await tx.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        });
        await sendPasswordResetEmail(user, token, req.organization,tx);
      });
    }

    return res.json(genericReply);
  } catch (err) {
    console.error('forgot password error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body ?? {};
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and contain uppercase, lowercase, and numeric characters',
      });
    }

    const rows = await db
      .select({ resetToken: passwordResetTokens, user: users })
      .from(passwordResetTokens)
      .innerJoin(users, eq(passwordResetTokens.userId, users.id))
      .where(and(eq(passwordResetTokens.tokenHash, hashResetToken(token)), gt(passwordResetTokens.expiresAt, new Date())))
      .limit(1);
    const reset = rows[0];
    if (!reset || !(await isAllowedInRealm(reset.user, req))) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
    }
    const resetToken = reset.resetToken;

    const passwordHash = await bcrypt.hash(password, 12);
    const consumed = await db.transaction(async (tx) => {
      const [lockedUser]=await tx.select().from(users).where(eq(users.id,resetToken.userId)).for('update');
      if(!lockedUser || !(await isAllowedInRealm(lockedUser,req)))return false;
      const [claimed] = await tx.delete(passwordResetTokens).where(and(eq(passwordResetTokens.id, resetToken.id), gt(passwordResetTokens.expiresAt, new Date()))).returning();
      if (!claimed) return false;
      await tx.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, resetToken.userId));
      // One-time link: remove it (and any others), and sign the account out everywhere.
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, resetToken.userId));
      await tx.delete(sessions).where(eq(sessions.userId, resetToken.userId));
      return true;
    });
    if (!consumed) return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
    disconnectUser(resetToken.userId);

    return res.json({ message: 'Your password has been reset. You can now sign in.' });
  } catch (err) {
    console.error('reset password error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, role } = req.body ?? {};

    if (typeof email !== 'string' || email.length > 255 || typeof password !== 'string' || password.length === 0 || password.length > 1024) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = sanitizeEmail(email);

    const user = await findRealmUser(normalizedEmail, req);
    // Always perform one password hash comparison so unknown emails and role
    // mismatches take the same expensive path as an incorrect password.
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid || (role !== undefined && role !== user.role)) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const sessionRows = await db.transaction(async (tx) => {
      const [lockedUser]=await tx.select().from(users).where(eq(users.id,user.id)).for('update');
      if(!lockedUser || lockedUser.passwordHash!==user.passwordHash || lockedUser.role!==user.role || lockedUser.organizationId!==user.organizationId) throw Object.assign(new Error('Account changed. Sign in again.'),{status:401});
      if (user.role === 'admin') {
        const mfa = await tx.execute(sql`SELECT encrypted_secret,last_counter FROM admin_mfa WHERE user_id=${user.id} FOR UPDATE`);
        const entry = mfa.rows[0] as {encrypted_secret:string;last_counter:string}|undefined;
        if (!entry && process.env.NODE_ENV === 'production') throw Object.assign(new Error('Administrator MFA must be provisioned by the server operator.'),{status:403});
        if (entry) {
          const counter=verifyTotp(decryptMfaSecret(entry.encrypted_secret),req.body?.otp,Number(entry.last_counter));
          if(counter===null)throw Object.assign(new Error('Enter a fresh six-digit authenticator code.'),{status:401});
          await tx.execute(sql`UPDATE admin_mfa SET last_counter=${counter} WHERE user_id=${user.id}`);
        }
      }
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      return tx
      .insert(sessions)
      .values({
        userId: user.id,
        mfaVerified: user.role === 'admin',
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
      })
      .returning();

    });
    disconnectUser(user.id);
    res.cookie('session_id', sessionRows[0].id, SESSION_COOKIE_OPTIONS);

    return res.json({
      message: 'Logged in successfully',
      user: await responseUser(req, user),
    });
  } catch (err) {
    if (err instanceof Error && [401,403].includes((err as Error & {status:number}).status)) return res.status((err as Error & {status:number}).status).json({message:err.message});
    console.error('login error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session_id;

    if (typeof sessionId === 'string' && /^[0-9a-f-]{36}$/i.test(sessionId)) {
      disconnectSession(sessionId);
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }

    clearSessionCookie(res);
    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('logout error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session_id;

    if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const rows = await db
      .select({ user: users, mfaVerified: sessions.mfaVerified })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (rows.length === 0 || !(await isAllowedInRealm(rows[0].user, req)) || (process.env.NODE_ENV==='production' && rows[0].user.role==='admin' && !rows[0].mfaVerified)) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Same shape as login/register (publicUser never includes the password hash).
    return res.json({ user: await responseUser(req, rows[0].user) });
  } catch (err) {
    console.error('me error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const preferencesSchema = z
  .object({
    language: z.enum(['en', 'ar']).optional(),
    notifyCommunity: z.boolean().optional(),
    notifySessions: z.boolean().optional(),
  })
  .strict();

router.put('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = preferencesSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'Invalid preferences' });
    const { language, notifyCommunity, notifySessions } = parsed.data;

    const [updated] = await db
      .update(users)
      .set({
        ...(language !== undefined ? { preferredLanguage: language } : {}),
        ...(notifyCommunity !== undefined ? { notifyCommunity } : {}),
        ...(notifySessions !== undefined ? { notifySessions } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.user!.id))
      .returning();

    return res.json({ user: publicUser(updated) });
  } catch (err) {
    console.error('update preferences error', err);
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

    if (typeof newPassword !== 'string' || (currentPassword !== undefined && typeof currentPassword !== 'string') || (!currentPassword && !req.user!.mustChangePassword)) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    const rows = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = rows[0];

    const valid = currentPassword ? await bcrypt.compare(currentPassword, user.passwordHash) : user.mustChangePassword;
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

    await db.transaction(async (tx) => {
      const [lockedUser]=await tx.select().from(users).where(eq(users.id,user.id)).for('update');
      if(!lockedUser || lockedUser.passwordHash!==user.passwordHash)throw Object.assign(new Error('Password changed. Sign in again.'),{status:409});
      await tx.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, user.id));
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
      await tx.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, req.cookies.session_id)));
    });
    disconnectUser(user.id);

    // Sign out every other session: if the old password leaked, anyone who
    // signed in with it loses access. The current session stays valid.
    const currentSessionId = req.cookies?.session_id;
    if (currentSessionId) {
      await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, currentSessionId)));
    }

    return res.json({ message: 'Password updated. Other devices have been signed out.' });
  } catch (err) {
    if(err instanceof Error && (err as Error & {status?:number}).status===409)return res.status(409).json({message:err.message});
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

      await storage.putObject(THUMBNAIL_BUCKET, objectName, req.file.buffer, req.file.size, {
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
