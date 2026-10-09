import { maintenance } from './lib/maintenance';
import { startSocketRevocation, stopSocketRevocation, socketRevocationReady } from './lib/socketRevocation';
import { providerContext } from './lib/providerBudget';
import { protectRouter } from './lib/asyncRouter';
import { pool } from './db';
import { rateLimitRedis } from './middleware/rateLimit';
import { videoQueue } from './lib/queue';
import { sql } from 'drizzle-orm';
import { storage, HLS_BUCKET } from './lib/minio';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { createHash } from 'crypto';
import { isIP } from 'node:net';
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
import { sessions, users, organizations, courses, enrollments, orgMemberships, subjectCommunities } from './db/schema';
import { eq, and, gt, or, isNotNull } from 'drizzle-orm';
import { isUserAllowedInOrganization, requireActiveOrganizationMembership, requireAuth, requireRole } from './middleware/requireAuth';
import { resolveOrg } from './middleware/resolveOrg';
import { setIO } from './lib/socket';
import notificationsRouter from './routes/notifications';
import searchRouter from './routes/search';
import adminRouter from './routes/admin';
import paymentsRouter from './routes/payments';
import organizationsRouter from './routes/organizations';
import domainAuthorizationRouter from './routes/domainAuthorization';
import { catalogRouter, adminCatalogRouter } from './routes/catalog';
import bookingsRouter from './routes/bookings';
import { createRedisRateLimitStore } from './middleware/rateLimit';

const isProd = process.env.NODE_ENV === 'production';
const app = express();
if (isProd && (!process.env.ANON_TOKEN_SALT || process.env.ANON_TOKEN_SALT.length < 32)) throw new Error('ANON_TOKEN_SALT must contain at least 32 characters in production');
if (isProd && !/^[0-9a-f]{64}$/i.test(process.env.EMAIL_OUTBOX_KEY ?? '')) throw new Error('EMAIL_OUTBOX_KEY must be a 32-byte hex key in production');
if (isProd && !process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required for production account email');
const httpServer = createServer(app);
const trustProxy = process.env.TRUST_PROXY?.trim();
function isExplicitProxyAddress(value: string): boolean {
  const [address, mask, extra] = value.split('/');
  if (extra !== undefined) return false;
  const family = isIP(address);
  if (!family) return false;
  if (mask === undefined) return true;
  if (!/^\d+$/.test(mask)) return false;
  const bits = Number(mask);
  return bits >= 0 && bits <= (family === 4 ? 32 : 128);
}
if (isProd && (!trustProxy || trustProxy.split(',').some((proxy) => !isExplicitProxyAddress(proxy.trim())))) {
  throw new Error('TRUST_PROXY must contain only explicit trusted reverse-proxy IP addresses or CIDRs in production');
}
app.set('trust proxy', trustProxy || 'loopback');

const configuredOrigins = process.env.ALLOWED_ORIGINS;
if (isProd && !configuredOrigins?.trim()) {
  throw new Error('ALLOWED_ORIGINS must list the exact HTTPS frontend origins in production');
}

const ALLOWED_ORIGINS = (configuredOrigins || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
if (ALLOWED_ORIGINS.length === 0) throw new Error('ALLOWED_ORIGINS must contain at least one exact frontend origin');

function parseSafeOrigin(origin: string): URL | null {
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    if (isProd ? parsed.protocol !== 'https:' : !['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

for (const origin of ALLOWED_ORIGINS) {
  if (!parseSafeOrigin(origin)) throw new Error(`Invalid or insecure ALLOWED_ORIGINS entry: ${origin}`);
}

const inferredOrganizationRootDomains = ALLOWED_ORIGINS
  .map((origin) => new URL(origin).hostname)
  .filter((host) => host.split('.').length === 2 || (host.startsWith('www.') && host.split('.').length === 3))
  .map((host) => host.startsWith('www.') ? host.slice(4) : host)
  .filter((host, index, all) => all.indexOf(host) === index);
const ORGANIZATION_ROOT_DOMAINS = (process.env.ORGANIZATION_ROOT_DOMAINS
  ? process.env.ORGANIZATION_ROOT_DOMAINS.split(',')
  : inferredOrganizationRootDomains)
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

async function isAllowedOrigin(origin: string): Promise<boolean> {
  const parsed = parseSafeOrigin(origin);
  if (!parsed) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (parsed.port) return false;

  const hostname = parsed.hostname.toLowerCase();
  const tenantRoot = ORGANIZATION_ROOT_DOMAINS.find((root) => {
    const prefix = `${hostname.slice(0, -(root.length + 1))}`;
    return hostname.endsWith(`.${root}`) && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix);
  });
  const conditions = [and(eq(organizations.customDomain, hostname), eq(organizations.customDomainStatus, 'active'), eq(organizations.isActive, true), isNotNull(organizations.customDomainVerifiedAt))];
  if (tenantRoot) {
    const slug = hostname.slice(0, -(tenantRoot.length + 1));
    conditions.push(and(eq(organizations.slug, slug), eq(organizations.isActive, true)));
  }
  const rows = await db.select({ id: organizations.id }).from(organizations)
    .where(or(...conditions)).limit(1);
  return rows.length > 0;
}

function allowCorsOrigin(origin: string | undefined, callback: (err: Error | null, allowed?: boolean) => void) {
  if (!origin) return callback(null, true);
  void isAllowedOrigin(origin).then((allowed) => callback(null, allowed)).catch(() => callback(null, false));
}

export const io = new Server(httpServer, {
  cors: {
    origin: allowCorsOrigin,
    credentials: true,
  },
});

setIO(io);

io.use(async (socket, next) => {
  try {
    const origin = socket.handshake.headers.origin;
    if (!origin || !parseSafeOrigin(origin) || !(await isAllowedOrigin(origin))) {
      return next(new Error('Unauthorized'));
    }

    const sessionCookie = socket.request.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('session_id='))
      ?.slice('session_id='.length);
    const sessionId = sessionCookie ? decodeURIComponent(sessionCookie) : undefined;

    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      return next(new Error('Unauthorized'));
    }

    const rows = await db
      .select({ userId: sessions.userId, mfaVerified: sessions.mfaVerified })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (rows.length === 0) {
      return next(new Error('Unauthorized'));
    }

    const userRows = await db
      .select({ id: users.id, role: users.role, organizationId: users.organizationId, mustChangePassword: users.mustChangePassword })
      .from(users)
      .where(eq(users.id, rows[0].userId))
      .limit(1);

    if (userRows.length === 0 || userRows[0].mustChangePassword || (isProd && userRows[0].role==='admin' && !rows[0].mfaVerified)) {
      return next(new Error('Unauthorized'));
    }

    const hostname = new URL(origin).hostname.toLowerCase();
    const rootDomain = ORGANIZATION_ROOT_DOMAINS.find((root) => hostname === root || hostname.endsWith(`.${root}`));
    const isServiceHost = ['www', 'api', 'app', 'assets'].includes(hostname.split('.')[0]);
    let organization: (typeof organizations.$inferSelect) | undefined;

    if (rootDomain && hostname !== rootDomain && !isServiceHost) {
      const slug = hostname.slice(0, -(rootDomain.length + 1));
      const [bySlug] = await db.select().from(organizations).where(and(
        eq(organizations.slug, slug), eq(organizations.isActive, true),
      )).limit(1);
      organization = bySlug;
    } else if (!rootDomain && !['localhost', '127.0.0.1'].includes(hostname)) {
      const [byDomain] = await db.select().from(organizations).where(and(
        eq(organizations.customDomain, hostname), eq(organizations.customDomainStatus, 'active'),
        eq(organizations.isActive, true), isNotNull(organizations.customDomainVerifiedAt),
      )).limit(1);
      organization = byDomain;
    }

    if (rootDomain && hostname !== rootDomain && !isServiceHost && !organization) {
      return next(new Error('Unauthorized'));
    }
    if (!(await isUserAllowedInOrganization(userRows[0], organization))) {
      return next(new Error('Unauthorized'));
    }
    if (organization && userRows[0].organizationId === organization.id) {
      const [membership] = await db.select({ id: orgMemberships.id }).from(orgMemberships).where(and(
        eq(orgMemberships.orgId, organization.id), eq(orgMemberships.userId, userRows[0].id),
        eq(orgMemberships.status, 'active'),
      )).limit(1);
      if (!membership) return next(new Error('Unauthorized'));
    }

    socket.data.sessionId = sessionId;
    if ((io.sockets.adapter.rooms.get('user:'+userRows[0].id)?.size??0)>=5 || io.engine.clientsCount>=1000) return next(new Error('Connection limit reached'));
    socket.data.user = userRows[0];
    socket.data.organization = organization ?? null;
    next();
  } catch (err) {
    next(new Error('Unauthorized'));
  }
});

async function canJoinCommunityRoom(
  user: { id: string; role: string; organizationId: string | null },
  organization: typeof organizations.$inferSelect | null,
  roomName: string,
): Promise<boolean> {
  const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const courseRoom = new RegExp(`^course:(${uuidPattern})$`, 'i').exec(roomName);
  const subjectRoom = new RegExp(`^subject:(${uuidPattern})$`, 'i').exec(roomName);

  if (roomName === 'community:general') {
    return organization === null && user.organizationId === null;
  }

  if (subjectRoom) {
    if (organization !== null || user.organizationId !== null) return false;
    const [subject] = await db.select({ id: subjectCommunities.id }).from(subjectCommunities)
      .where(eq(subjectCommunities.id, subjectRoom[1])).limit(1);
    return Boolean(subject);
  }

  if (!courseRoom) return false;

  const [course] = await db.select({ id: courses.id, instructorId: courses.instructorId, organizationId: courses.organizationId })
    .from(courses).where(eq(courses.id, courseRoom[1])).limit(1);
  if (!course || (organization ? course.organizationId !== organization.id : course.organizationId !== null)) {
    return false;
  }

  if (user.role === 'admin' && user.organizationId === null) return true;

  if (organization) {
    const [membership] = await db.select({ id: orgMemberships.id, role: orgMemberships.role }).from(orgMemberships).where(and(
      eq(orgMemberships.orgId, organization.id), eq(orgMemberships.userId, user.id),
      eq(orgMemberships.status, 'active'),
    )).limit(1);
    if (!membership) return false;
    if (membership.role === 'organization_manager') return true;
  }

  if (course.instructorId === user.id) return true;
  const [enrollment] = await db.select({ id: enrollments.id }).from(enrollments).where(and(
    eq(enrollments.courseId, course.id), eq(enrollments.studentId, user.id), eq(enrollments.status, 'active'),
  )).limit(1);
  return Boolean(enrollment);
}

io.on('connection', (socket) => {
  const sessionId = socket.data.sessionId as string;
  socket.join('session:' + sessionId);
  socket.join('user:' + socket.data.user.id);
  let checking = false;
  let windowStarted = Date.now();
  let events = 0;
  async function refresh(): Promise<boolean> {
    const [row] = await db.select({user:users,mfaVerified:sessions.mfaVerified}).from(sessions).innerJoin(users,eq(users.id,sessions.userId))
      .where(and(eq(sessions.id,sessionId),gt(sessions.expiresAt,new Date()))).limit(1);
    const organization = socket.data.organization ?? undefined;
    if (!row || row.user.mustChangePassword || (isProd && row.user.role==='admin' && !row.mfaVerified) || !(await isUserAllowedInOrganization(row.user,organization))) return false;
    if (organization) {
      const [org] = await db.select({id:organizations.id}).from(organizations).where(and(eq(organizations.id,organization.id),eq(organizations.isActive,true))).limit(1);
      const [membership] = await db.select({id:orgMemberships.id}).from(orgMemberships).where(and(eq(orgMemberships.orgId,organization.id),eq(orgMemberships.userId,row.user.id),eq(orgMemberships.status,'active'))).limit(1);
      if (!org || (!membership && row.user.role !== 'admin')) return false;
    }
    const {passwordHash, ...publicUser} = row.user;
    socket.data.user = publicUser;
    for (const room of socket.rooms) {
      if (/^(course:|subject:|community:)/.test(room) && !(await canJoinCommunityRoom(publicUser,organization ?? null,room))) await socket.leave(room);
    }
    return true;
  }
  const timer = setInterval(() => {
    if (checking) return;
    checking = true;
    void refresh().then(ok => {if (!ok) socket.disconnect(true);}).catch(() => socket.disconnect(true)).finally(() => {checking=false;});
  },15000);
  timer.unref();
  socket.on('disconnect',() => clearInterval(timer));
  socket.on('join_room', (roomName: unknown) => {
    if (Date.now()-windowStarted > 60000) {windowStarted=Date.now();events=0;}
    if (++events > 20) {socket.disconnect(true);return;}
    if (checking || typeof roomName !== 'string' || roomName.length > 100 || socket.rooms.size >= 16) return;
    checking = true;
    void refresh().then(async ok => {
      if (!ok) {socket.disconnect(true);return;}
      if (await canJoinCommunityRoom(socket.data.user,socket.data.organization ?? null,roomName)) await socket.join(roomName);
    }).catch(() => socket.disconnect(true)).finally(() => {checking=false;});
  });
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'blob:', 'data:', ...ALLOWED_ORIGINS],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...ALLOWED_ORIGINS],
        styleSrc: ["'self'", "'unsafe-inline'", ...ALLOWED_ORIGINS],
        imgSrc: ["'self'", 'blob:', 'data:', 'https:', ...ALLOWED_ORIGINS],
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
    crossOriginResourcePolicy: { policy: 'same-site' },
    strictTransportSecurity: isProd
      ? { maxAge: 31_536_000, includeSubDomains: false, preload: false }
      : false,
  })
);
app.use(
  cors({
    origin: allowCorsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 100 }));
app.use(cookieParser());
app.use(providerContext);

app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  });
  return next();
});
app.use((req,res,next) => {
  const requestId = randomUUID();
  res.setHeader('X-Request-ID',requestId);
  const started = Date.now();
  res.on('finish',() => console.log(JSON.stringify({type:'request',requestId,method:req.method,path:req.path.replace(/[0-9a-f-]{36}/gi,':id'),status:res.statusCode,durationMs:Date.now()-started})));
  res.on('finish',() => {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method) && req.user) void db.execute(sql`INSERT INTO security_audit_events(actor_id,action,resource,outcome,request_id) VALUES(${req.user.id},${req.method},${req.originalUrl.split('?')[0]},${res.statusCode},${requestId})`).catch(()=>console.error('Security audit persistence failed'));
  });
  next();
});
app.get('/api/health/live',(_req,res) => res.json({status:'ok'}));
app.get(['/api/health','/api/health/ready'],async (_req,res) => {
  try {
    if (!socketRevocationReady()) throw new Error('Realtime revocation listener unavailable');
    await Promise.race([
      Promise.all([pool.query('SELECT 1'), rateLimitRedis.ping(), storage.bucketExists(HLS_BUCKET)]),
      new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Readiness deadline')),3000);timer.unref();}),
    ]);
    res.json({status:'ready'});
  } catch {res.status(503).json({status:'unavailable'});}
});
// Internal TLS authorization is independent of public tenant host resolution.
app.use('/api/domains',domainAuthorizationRouter);
app.use(resolveOrg);
app.use('/api', requireActiveOrganizationMembership);

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use('/api', (req, res, next) => {
  if (safeMethods.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) {
    if (req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ message: 'Request origin is not allowed.' });
    }
    return next();
  }
  void isAllowedOrigin(origin).then((allowed) => {
    if (!allowed) return res.status(403).json({ message: 'Request origin is not allowed.' });
    return next();
  }).catch(() => res.status(403).json({ message: 'Request origin is not allowed.' }));
});

function positiveLimit(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

const limiter = rateLimit({
  windowMs: positiveLimit(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 86_400_000),
  limit: positiveLimit(process.env.RATE_LIMIT_MAX, 1000, 1_000_000),
  store: createRedisRateLimitStore('nudra:rate:api'),
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: positiveLimit(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 86_400_000),
  limit: positiveLimit(process.env.AUTH_RATE_LIMIT_MAX, 10, 1000),
  store: createRedisRateLimitStore('nudra:rate:auth'),
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later' },
});

// Login brute-force protection: only FAILED attempts count, and they are counted
// per IP + email. Successful sign-ins (e.g. switching accounts) never use up the
// limit, and a typo on one account can't lock out everyone on a shared network.
const loginLimiter = rateLimit({
  windowMs: positiveLimit(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 86_400_000),
  limit: positiveLimit(process.env.LOGIN_RATE_LIMIT_MAX, 10, 1000),
  store: createRedisRateLimitStore('nudra:rate:login'),
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    const emailKey = createHash('sha256').update(email).digest('hex');
    return `${ipKeyGenerator(req.ip || '127.0.0.1')}|${emailKey}`;
  },
  message: { message: 'Too many failed sign-in attempts. Please wait a few minutes and try again.' },
});

const domainAuthorizationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 600,
  store: createRedisRateLimitStore('nudra:rate:domain-auth'),
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many domain authorization checks. Please try again later.' },
});

const speedLimiter = slowDown({
  windowMs: Number(process.env.SLOW_DOWN_WINDOW_MS || 15 * 60 * 1000),
  delayAfter: Number(process.env.SLOW_DOWN_AFTER || 100),
  delayMs: () => Number(process.env.SLOW_DOWN_MS || 500),
});

const aiLimiter = rateLimit({
  windowMs: positiveLimit(process.env.AI_RATE_LIMIT_WINDOW_MS, 60 * 1000, 86_400_000),
  limit: positiveLimit(process.env.AI_RATE_LIMIT_MAX, 20, 1000),
  store: createRedisRateLimitStore('nudra:rate:ai'),
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many AI requests, please slow down' },
});

app.use('/api', (req,res,next) => req.path.startsWith('/videos/') ? next() : speedLimiter(req,res,next));
// Only credential endpoints get the strict limiter; /api/auth/me runs on every
// page load and must not lock users out.
app.use('/api/auth/login', loginLimiter);
app.use('/api/domains/authorize', domainAuthorizationLimiter);
app.use(
  [
    '/api/auth/register',
    '/api/auth/register-instructor',
    '/api/auth/password',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
  ],
  authLimiter
);
app.use('/api/ai', aiLimiter);
app.use('/api', (req,res,next) => req.path.startsWith('/videos/') ? next() : limiter(req,res,next));



const globalOnlyOrgRoutes = new Set([
  'my-courses', 'progress', 'notes', 'stats', 'quizzes', 'sanaweya',
  'notifications', 'search', 'payments', 'catalog',
]);
app.use('/api', (req, res, next) => {
  const apiPath = req.originalUrl.split('?')[0].replace(/^\/api(?=\/|$)/, '');
  const section = apiPath.split('/').filter(Boolean)[0];
  if (req.organization && section && globalOnlyOrgRoutes.has(section)) {
    return res.status(404).json({ message: 'This feature is not available in the organization learning space.' });
  }
  return next();
});
app.use('/api', async (req, res, next) => {
  if (!req.cookies?.session_id || req.path.startsWith('/auth/')) return next();
  try {
    const [row] = await db.select({ mustChangePassword: users.mustChangePassword }).from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, req.cookies.session_id), gt(sessions.expiresAt, new Date()))).limit(1);
    if (row?.mustChangePassword && req.path !== '/auth/password' && req.method !== 'OPTIONS') {
      return res.status(403).json({ message: 'Change your password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
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
app.use('/api/admin/catalog', adminCatalogRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/organizations', organizationsRouter);
protectRouter(app);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return res.destroy();
  if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'File is too large. Maximum size is 5MB.' });
  }
  const status = typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
    ? err.status
    : 500;
  if (status >= 500) console.error('Unhandled request error', err);
  return res.status(status >= 400 && status < 600 ? status : 500).json({
    message: status === 413 ? 'Request body is too large.' : status === 400 ? 'Invalid request.' : 'Internal server error.',
  });
});

const maintenanceTimer=setInterval(()=>void maintenance().catch(()=>console.error('Maintenance failed')),60000);maintenanceTimer.unref();
const PORT = Number(process.env.PORT) || 3001;

httpServer.listen(PORT, () => {
  void startSocketRevocation();
  console.log(`Nudra backend running on port ${PORT}`);
  void ensureBucket().catch(error => console.error('Storage initialization failed', error));
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(maintenanceTimer);
  const deadline=setTimeout(() => process.exit(1),25000);deadline.unref();
  await new Promise<void>(resolve => io.close(() => resolve()));
  await Promise.allSettled([stopSocketRevocation(),pool.end(),rateLimitRedis.quit(),videoQueue.close()]);
  clearTimeout(deadline);
}
process.once('SIGTERM',() => void shutdown());
process.once('SIGINT',() => void shutdown());
