import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import slowDown from 'express-slow-down';
import authRouter from './routes/auth';
import coursesRouter, { myCoursesHandler } from './routes/courses';
import instructorRouter from './routes/instructor';
import progressRouter from './routes/progress';
import notesRouter from './routes/notes';
import aiRouter from './routes/ai';
import videosRouter from './routes/videos';
import statsRouter from './routes/stats';
import quizzesRouter from './routes/quizzes';
import sanaweyaRouter from './routes/sanaweya';
import { createCommunityRouter } from './routes/community';
import { ensureBucket } from './lib/minio';
import { db } from './db';
import { sessions, users } from './db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { requireAuth, requireRole } from './middleware/requireAuth';
import { setIO } from './lib/socket';
import notificationsRouter from './routes/notifications';
import searchRouter from './routes/search';
import adminRouter from './routes/admin';
import './workers/transcodeWorker';

const app = express();
const httpServer = createServer(app);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

setIO(io);

io.use(async (socket, next) => {
  try {
    const sessionId = socket.request.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('session_id='))
      ?.split('=')[1];

    if (!sessionId) {
      return next(new Error('Unauthorized'));
    }

    const rows = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (rows.length === 0) {
      return next(new Error('Unauthorized'));
    }

    const userRows = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, rows[0].userId))
      .limit(1);

    if (userRows.length === 0) {
      return next(new Error('Unauthorized'));
    }

    socket.data.user = userRows[0];
    next();
  } catch (err) {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.user?.id;
  if (userId) {
    socket.join(`user:${userId}`);
  }

  socket.on('join_room', (roomName: string) => {
    if (typeof roomName !== 'string' || !roomName.match(/^[a-z0-9_:.-]+$/i)) {
      return;
    }
    socket.join(roomName);
  });
});

const isProd = process.env.NODE_ENV === 'production';

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'blob:', 'data:', ...ALLOWED_ORIGINS],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...ALLOWED_ORIGINS],
        styleSrc: ["'self'", "'unsafe-inline'", ...ALLOWED_ORIGINS],
        imgSrc: ["'self'", 'blob:', 'data:', ...ALLOWED_ORIGINS],
        mediaSrc: ["'self'", 'blob:', 'data:', ...ALLOWED_ORIGINS],
        fontSrc: ["'self'", ...ALLOWED_ORIGINS],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 50),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later' },
});

// Login brute-force protection: only FAILED attempts count, and they are counted
// per IP + email. Successful sign-ins (e.g. switching accounts) never use up the
// limit, and a typo on one account can't lock out everyone on a shared network.
const loginLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 50),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
  },
  message: { message: 'Too many failed sign-in attempts. Please wait a few minutes and try again.' },
});

const speedLimiter = slowDown({
  windowMs: Number(process.env.SLOW_DOWN_WINDOW_MS || 15 * 60 * 1000),
  delayAfter: Number(process.env.SLOW_DOWN_AFTER || 100),
  delayMs: () => Number(process.env.SLOW_DOWN_MS || 500),
});

const aiLimiter = rateLimit({
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  max: Number(process.env.AI_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many AI requests, please slow down' },
});

app.use('/api', speedLimiter);
// Only credential endpoints get the strict limiter; /api/auth/me runs on every
// page load and must not lock users out.
app.use('/api/auth/login', loginLimiter);
app.use(['/api/auth/register', '/api/auth/register-instructor', '/api/auth/password'], authLimiter);
app.use('/api/ai', aiLimiter);
app.use('/api', limiter);

app.set('trust proxy', 1);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.get('/api/my-courses', requireAuth, myCoursesHandler);
app.use('/api/courses', coursesRouter);
app.use('/api/instructor', instructorRouter);
app.use('/api/progress', progressRouter);
app.use('/api/notes', notesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/videos', videosRouter);
app.use('/api/community', createCommunityRouter(io));
app.use('/api/stats', statsRouter);
app.use('/api/quizzes', quizzesRouter);
app.use('/api/sanaweya', sanaweyaRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/search', searchRouter);
app.use('/api/admin', adminRouter);

const PORT = Number(process.env.PORT) || 3001;

httpServer.listen(PORT, () => {
  console.log(`Nudra backend running on port ${PORT}`);
  ensureBucket();
});
