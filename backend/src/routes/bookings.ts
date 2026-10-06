import { Router, Request, Response } from 'express';
import { SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();
const uuid = z.string().uuid();

type Row = Record<string, unknown>;
type SqlExecutor = { execute: (query: SQL) => Promise<unknown> };
const rowsOf = (result: unknown) => ((result as { rows?: Row[] }).rows ?? []);

async function activeMember(orgId: string, userId: string, executor: SqlExecutor = db) {
  const result = await executor.execute(sql`SELECT 1 FROM org_memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ${orgId} AND m.user_id = ${userId} AND m.status = 'active'
      AND u.organization_id = ${orgId} LIMIT 1`);
  return rowsOf(result).length > 0;
}

async function canManageCourse(req: Request, courseId: string) {
  const result = await db.execute(sql`SELECT c.instructor_id, c.organization_id,
      EXISTS (SELECT 1 FROM org_memberships m JOIN users u ON u.id=m.user_id
        WHERE m.org_id=c.organization_id AND m.user_id=${req.user!.id}
          AND m.role='organization_manager' AND m.status='active'
          AND u.organization_id IS NULL AND u.role IN ('organization_manager','admin')) AS is_manager
    FROM courses c WHERE c.id=${courseId}
      AND c.organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid LIMIT 1`);
  const course = rowsOf(result)[0];
  if (!course) return false;
  return course.instructor_id === req.user!.id || course.is_manager === true || req.user!.role === 'admin';
}

router.get('/sessions', async (req: Request, res: Response) => {
  const courseId = uuid.safeParse(req.query.courseId);
  if (!courseId.success) return res.status(400).json({ message: 'A valid courseId is required.' });
  try {
    const result = await db.execute(sql`SELECT s.id, s.course_id AS "courseId", s.starts_at AS "startsAt",
        s.ends_at AS "endsAt", s.location, s.capacity, s.status,
        GREATEST(s.capacity - COUNT(b.id) FILTER (WHERE b.status='confirmed'), 0)::int AS "seatsAvailable"
      FROM course_sessions s
      JOIN courses c ON c.id=s.course_id
      LEFT JOIN course_bookings b ON b.session_id=s.id
      WHERE s.course_id=${courseId.data}
        AND s.organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid
        AND s.status='scheduled' AND c.is_published=true AND c.approval_status='approved'
        AND c.delivery_mode='offline' AND s.starts_at > now()
      GROUP BY s.id ORDER BY s.starts_at ASC`);
    return res.json({ sessions: rowsOf(result) });
  } catch (error) {
    console.error('list booking sessions failed', error);
    return res.status(500).json({ message: 'Could not load available sessions.' });
  }
});

router.post('/courses/:courseId/sessions', requireAuth, async (req: Request, res: Response) => {
  const courseId = uuid.safeParse(req.params.courseId);
  const parsed = z.object({
    startsAt: z.string().datetime(), endsAt: z.string().datetime(),
    capacity: z.number().int().min(1).max(10000), location: z.string().trim().min(2).max(1000),
  }).strict().safeParse(req.body);
  if (!courseId.success || !parsed.success) return res.status(400).json({ message: 'Enter a valid course, date, capacity, and location.' });
  if (new Date(parsed.data.startsAt) <= new Date() || new Date(parsed.data.endsAt) <= new Date(parsed.data.startsAt)) {
    return res.status(400).json({ message: 'The session must end after it starts and start in the future.' });
  }
  if (!(await canManageCourse(req, courseId.data))) return res.status(403).json({ message: 'Course manager or instructor access required.' });
  try {
    const result = await db.execute(sql`INSERT INTO course_sessions
      (course_id, organization_id, starts_at, ends_at, capacity, location, created_by)
      SELECT c.id, c.organization_id, ${parsed.data.startsAt}::timestamptz,
        ${parsed.data.endsAt}::timestamptz, ${parsed.data.capacity}, ${parsed.data.location}, ${req.user!.id}
      FROM courses c WHERE c.id=${courseId.data}
        AND c.organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid
        AND c.delivery_mode='offline' AND c.approval_status='approved'
      RETURNING id, course_id AS "courseId", starts_at AS "startsAt", ends_at AS "endsAt", capacity, location, status`);
    const session = rowsOf(result)[0];
    if (!session) return res.status(409).json({ message: 'Only approved offline courses can have bookable sessions.' });
    return res.status(201).json({ session });
  } catch (error) {
    console.error('create booking session failed', error);
    return res.status(500).json({ message: 'Could not create the session.' });
  }
});

router.get('/manage/courses/:courseId/sessions', requireAuth, async (req: Request, res: Response) => {
  const courseId = uuid.safeParse(req.params.courseId);
  if (!courseId.success) return res.status(400).json({ message: 'Invalid course.' });
  if (!(await canManageCourse(req, courseId.data))) return res.status(403).json({ message: 'Course manager or instructor access required.' });
  try {
    const result = await db.execute(sql`SELECT s.id, s.course_id AS "courseId", s.starts_at AS "startsAt",
        s.ends_at AS "endsAt", s.location, s.capacity, s.status,
        COUNT(b.id) FILTER (WHERE b.status='confirmed')::int AS "confirmedCount",
        COUNT(b.id) FILTER (WHERE b.status='waitlisted')::int AS "waitlistCount"
      FROM course_sessions s LEFT JOIN course_bookings b ON b.session_id=s.id
      WHERE s.course_id=${courseId.data}
        AND s.organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid
      GROUP BY s.id ORDER BY s.starts_at DESC`);
    return res.json({ sessions: rowsOf(result) });
  } catch (error) {
    console.error('list managed sessions failed', error);
    return res.status(500).json({ message: 'Could not load course sessions.' });
  }
});

router.get('/sessions/:sessionId/roster', requireAuth, async (req: Request, res: Response) => {
  const sessionId = uuid.safeParse(req.params.sessionId);
  if (!sessionId.success) return res.status(400).json({ message: 'Invalid session.' });
  const sessionResult = await db.execute(sql`SELECT course_id FROM course_sessions WHERE id=${sessionId.data}
    AND organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid LIMIT 1`);
  const session = rowsOf(sessionResult)[0];
  if (!session) return res.status(404).json({ message: 'Session not found.' });
  if (!(await canManageCourse(req, String(session.course_id)))) return res.status(403).json({ message: 'Course manager or instructor access required.' });
  const result = await db.execute(sql`SELECT b.id, b.status, b.waitlist_position AS "waitlistPosition",
      b.booked_at AS "bookedAt", u.id AS "studentId", u.name AS "studentName", u.email AS "studentEmail"
    FROM course_bookings b JOIN users u ON u.id=b.student_id
    WHERE b.session_id=${sessionId.data} AND b.organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid
    ORDER BY CASE b.status WHEN 'confirmed' THEN 0 WHEN 'waitlisted' THEN 1 ELSE 2 END,
      b.waitlist_position NULLS LAST, b.booked_at`);
  return res.json({ roster: rowsOf(result) });
});

router.patch('/sessions/:sessionId/roster/:bookingId/attendance', requireAuth, async (req: Request, res: Response) => {
  const sessionId = uuid.safeParse(req.params.sessionId);
  const bookingId = uuid.safeParse(req.params.bookingId);
  const attendance = z.enum(['attended', 'no_show']).safeParse(req.body?.status);
  if (!sessionId.success || !bookingId.success || !attendance.success) return res.status(400).json({ message: 'Choose attended or no-show for a valid booking.' });
  const sessionResult = await db.execute(sql`SELECT course_id, ends_at, status FROM course_sessions WHERE id=${sessionId.data}
    AND organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid LIMIT 1`);
  const session = rowsOf(sessionResult)[0];
  if (!session) return res.status(404).json({ message: 'Session not found.' });
  if (!(await canManageCourse(req, String(session.course_id)))) return res.status(403).json({ message: 'Course manager or instructor access required.' });
  if (new Date(String(session.ends_at)) > new Date() || session.status === 'cancelled') {
    return res.status(409).json({ message: 'Attendance can be recorded after the session ends.' });
  }
  const updated = await db.execute(sql`UPDATE course_bookings SET status=${attendance.data}, updated_at=now()
    WHERE id=${bookingId.data} AND session_id=${sessionId.data} AND status IN ('confirmed','attended','no_show')
      AND organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid
    RETURNING id, status`);
  const booking = rowsOf(updated)[0];
  if (!booking) return res.status(404).json({ message: 'Confirmed booking not found.' });
  return res.json({ booking });
});

router.get('/mine', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`SELECT b.id, b.status, b.waitlist_position AS "waitlistPosition",
        b.booked_at AS "bookedAt", s.starts_at AS "startsAt", s.ends_at AS "endsAt", s.location,
        c.id AS "courseId", c.title AS "courseTitle", s.id AS "sessionId"
      FROM course_bookings b JOIN course_sessions s ON s.id=b.session_id JOIN courses c ON c.id=b.course_id
      WHERE b.student_id=${req.user!.id}
        AND b.organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid
        AND b.status IN ('confirmed','waitlisted') ORDER BY s.starts_at`);
    return res.json({ bookings: rowsOf(result) });
  } catch (error) {
    console.error('list bookings failed', error);
    return res.status(500).json({ message: 'Could not load your bookings.' });
  }
});

router.post('/sessions/:sessionId/book', requireAuth, async (req: Request, res: Response) => {
  const sessionId = uuid.safeParse(req.params.sessionId);
  if (!sessionId.success || req.user!.role !== 'student') return res.status(400).json({ message: 'Only a student can book a valid session.' });
  try {
    const booking = await db.transaction(async (tx) => {
      const lockedResult = await tx.execute(sql`SELECT s.id, s.course_id, s.organization_id, s.capacity, s.status,
          s.starts_at, c.is_published, c.approval_status, c.delivery_mode, c.price
        FROM course_sessions s JOIN courses c ON c.id=s.course_id
        WHERE s.id=${sessionId.data} AND s.organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid
        FOR UPDATE OF s`);
      const session = rowsOf(lockedResult)[0];
      if (!session || session.status !== 'scheduled' || session.is_published !== true
          || session.approval_status !== 'approved' || session.delivery_mode !== 'offline'
          || new Date(String(session.starts_at)) <= new Date()) return null;
      if (req.organization && !(await activeMember(req.organization.id, req.user!.id, tx))) {
        throw new Error('ORG_MEMBERSHIP_REQUIRED');
      }
      if (Number(session.price) > 0) throw new Error('PAID_OFFLINE_UNAVAILABLE');
      const priorResult = await tx.execute(sql`SELECT id, status, waitlist_position AS "waitlistPosition"
        FROM course_bookings WHERE session_id=${sessionId.data} AND student_id=${req.user!.id} LIMIT 1`);
      const prior = rowsOf(priorResult)[0];
      if (prior && ['confirmed','waitlisted'].includes(String(prior.status))) return { prior: true, ...prior };
      const countResult = await tx.execute(sql`SELECT COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed,
          COALESCE(MAX(waitlist_position) FILTER (WHERE status='waitlisted'), 0)::int AS last_wait
        FROM course_bookings WHERE session_id=${sessionId.data}`);
      const stats = rowsOf(countResult)[0] ?? {};
      const confirmed = Number(stats.confirmed ?? 0);
      const available = confirmed < Number(session.capacity);
      const status = available ? 'confirmed' : 'waitlisted';
      const position = available ? null : Number(stats.last_wait ?? 0) + 1;
      const inserted = await tx.execute(sql`INSERT INTO course_bookings
          (session_id, course_id, organization_id, student_id, status, waitlist_position)
        VALUES (${sessionId.data}, ${session.course_id}, ${session.organization_id}, ${req.user!.id}, ${status}, ${position})
        ON CONFLICT (session_id, student_id) DO UPDATE SET status=EXCLUDED.status,
          waitlist_position=EXCLUDED.waitlist_position, booked_at=now(), cancelled_at=NULL, updated_at=now()
        RETURNING id, status, waitlist_position AS "waitlistPosition"`);
      return { prior: false, ...rowsOf(inserted)[0] };
    });
    if (!booking) return res.status(404).json({ message: 'This session is no longer available.' });
    return res.status(booking.prior ? 200 : 201).json({ booking });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORG_MEMBERSHIP_REQUIRED') {
      return res.status(403).json({ message: 'Organization approval is required before booking.' });
    }
    if (error instanceof Error && error.message === 'PAID_OFFLINE_UNAVAILABLE') {
      return res.status(409).json({ message: 'This offline course requires a payment provider before booking can open.' });
    }
    console.error('book session failed', error);
    return res.status(500).json({ message: 'Could not book this session.' });
  }
});

router.delete('/sessions/:sessionId/book', requireAuth, async (req: Request, res: Response) => {
  const sessionId = uuid.safeParse(req.params.sessionId);
  if (!sessionId.success) return res.status(400).json({ message: 'Invalid session.' });
  try {
    const result = await db.transaction(async (tx) => {
      const sessionResult = await tx.execute(sql`SELECT id, status, starts_at FROM course_sessions WHERE id=${sessionId.data}
        AND organization_id IS NOT DISTINCT FROM ${req.organization?.id ?? null}::uuid FOR UPDATE`);
      const session = rowsOf(sessionResult)[0];
      if (!session) return 'missing';
      const activeResult = await tx.execute(sql`SELECT status FROM course_bookings
        WHERE session_id=${sessionId.data} AND student_id=${req.user!.id}
          AND status IN ('confirmed','waitlisted') FOR UPDATE`);
      const activeBooking = rowsOf(activeResult)[0];
      if (!activeBooking) return 'missing';
      const cancelled = await tx.execute(sql`UPDATE course_bookings SET status='cancelled', cancelled_at=now(),
          waitlist_position=NULL, updated_at=now()
        WHERE session_id=${sessionId.data} AND student_id=${req.user!.id} AND status IN ('confirmed','waitlisted')
        RETURNING id, status`);
      if (!rowsOf(cancelled).length) return 'missing';
      let promotedRows: Row[] = [];
      if (activeBooking.status === 'confirmed' && session.status === 'scheduled'
          && new Date(String(session.starts_at)) > new Date()) {
        const promoted = await tx.execute(sql`WITH next_booking AS (
            SELECT id FROM course_bookings WHERE session_id=${sessionId.data} AND status='waitlisted'
            ORDER BY waitlist_position ASC, booked_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
          ) UPDATE course_bookings b SET status='confirmed', waitlist_position=NULL, updated_at=now()
            FROM next_booking n WHERE b.id=n.id RETURNING b.id`);
        promotedRows = rowsOf(promoted);
      }
      await tx.execute(sql`WITH ordered AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC, booked_at ASC)::int AS position
          FROM course_bookings WHERE session_id=${sessionId.data} AND status='waitlisted'
        ) UPDATE course_bookings b SET waitlist_position=o.position FROM ordered o WHERE b.id=o.id`);
      return { cancelled: rowsOf(cancelled)[0], promoted: promotedRows[0] ?? null };
    });
    if (result === 'missing') return res.status(404).json({ message: 'Active booking not found.' });
    return res.json({ result });
  } catch (error) {
    console.error('cancel booking failed', error);
    return res.status(500).json({ message: 'Could not cancel the booking.' });
  }
});

export default router;
