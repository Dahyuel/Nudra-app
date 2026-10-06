import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { enrollments, lessons, courseSections, users } from '../db/schema';
import { sendEnrollmentEmail } from './mailer';
import { createNotification } from './notifications';

type EnrollmentKind = 'online' | 'offline_semester';

/**
 * Enrol a student (free enrollment, or after a confirmed payment). Idempotent:
 * returns { created: false } if they are already enrolled, so a payment
 * confirmation that arrives twice can't double-enrol or double-notify.
 *
 * For offline semester enrollments the caller is expected to also run
 * fanOutBookingsForEnrollment to roster the student on every future session.
 */
export async function enrollStudent(
  studentId: string,
  course: { id: string; title: string },
  kind: EnrollmentKind = 'online',
) {
  const [firstLesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(courseSections, eq(lessons.sectionId, courseSections.id))
    .where(eq(lessons.courseId, course.id))
    .orderBy(courseSections.position, lessons.position)
    .limit(1);

  // The unique constraint is (studentId, courseId). A row that already exists
  // may have been cancelled earlier; reactivate it in place rather than
  // refusing. New rows get the requested kind + status 'active'.
  const inserted = await db
    .insert(enrollments)
    .values({ studentId, courseId: course.id, progress: 0, lastLessonId: firstLesson?.id ?? null, kind, status: 'active' })
    .onConflictDoUpdate({
      target: [enrollments.studentId, enrollments.courseId],
      set: { kind, status: 'active' },
      where: eq(enrollments.status, 'cancelled'),
    })
    .returning();

  if (inserted.length === 0) return { created: false as const, enrollment: null };

  const [student] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);
  if (student) sendEnrollmentEmail(student, { title: course.title }).catch(console.warn);
  createNotification(
    studentId,
    'enrollment_confirmed',
    'تم التسجيل بنجاح',
    `تم تسجيلك في ${course.title}`,
    `/course/${course.id}`
  ).catch(console.warn);

  return { created: true as const, enrollment: inserted[0] };
}

/**
 * Fan out confirmed bookings for every scheduled future session on an offline
 * course to a newly-enrolled student. If the session is already at capacity,
 * the student is waitlisted (same rule the drop-in booking path uses).
 * Idempotent per (session_id, student_id) via the course_bookings UNIQUE.
 */
export async function fanOutBookingsForEnrollment(studentId: string, courseId: string) {
  // ON CONFLICT reactivates a previously-cancelled booking (e.g. the student
  // left the course and re-enrolled). Existing confirmed/waitlisted bookings
  // are left alone so an active drop-in isn't downgraded.
  await db.execute(sql`
    WITH target_sessions AS (
      SELECT s.id, s.course_id, s.organization_id, s.capacity
      FROM course_sessions s
      WHERE s.course_id = ${courseId}
        AND s.status = 'scheduled'
        AND s.starts_at > now()
    ), seat_counts AS (
      SELECT s.id AS session_id,
        COUNT(b.id) FILTER (WHERE b.status = 'confirmed')::int AS confirmed,
        COALESCE(MAX(b.waitlist_position) FILTER (WHERE b.status = 'waitlisted'), 0)::int AS last_wait
      FROM target_sessions s
      LEFT JOIN course_bookings b ON b.session_id = s.id
      GROUP BY s.id
    )
    INSERT INTO course_bookings
      (session_id, course_id, organization_id, student_id, status, waitlist_position,
       payment_method, payment_status)
    SELECT ts.id, ts.course_id, ts.organization_id, ${studentId},
      CASE WHEN sc.confirmed < ts.capacity THEN 'confirmed' ELSE 'waitlisted' END,
      CASE WHEN sc.confirmed < ts.capacity THEN NULL ELSE sc.last_wait + 1 END,
      'offline',
      'pending'
    FROM target_sessions ts JOIN seat_counts sc ON sc.session_id = ts.id
    ON CONFLICT (session_id, student_id) DO UPDATE SET
      status = EXCLUDED.status,
      waitlist_position = EXCLUDED.waitlist_position,
      payment_method = EXCLUDED.payment_method,
      payment_status = EXCLUDED.payment_status,
      cancelled_at = NULL,
      booked_at = now(),
      updated_at = now()
    WHERE course_bookings.status = 'cancelled';
  `);
}

/**
 * Fan out confirmed bookings for a newly-created session to every active
 * offline_semester enrollee of its course. Called from the session-create
 * handler so the roster is populated the moment the session appears.
 * Idempotent per (session_id, student_id).
 */
export async function fanOutEnrolleesToSession(sessionId: string, courseId: string, organizationId: string | null) {
  await db.execute(sql`
    WITH session_info AS (
      SELECT id, capacity FROM course_sessions WHERE id = ${sessionId}
    ), active_enrollees AS (
      SELECT student_id FROM enrollments
      WHERE course_id = ${courseId}
        AND kind = 'offline_semester'
        AND status = 'active'
      ORDER BY enrolled_at ASC
    ), numbered AS (
      SELECT student_id, ROW_NUMBER() OVER ()::int AS rn FROM active_enrollees
    )
    INSERT INTO course_bookings
      (session_id, course_id, organization_id, student_id, status, waitlist_position,
       payment_method, payment_status)
    SELECT ${sessionId}, ${courseId}, ${organizationId}, n.student_id,
      CASE WHEN n.rn <= si.capacity THEN 'confirmed' ELSE 'waitlisted' END,
      CASE WHEN n.rn <= si.capacity THEN NULL ELSE n.rn - si.capacity END,
      'offline',
      'pending'
    FROM numbered n CROSS JOIN session_info si
    ON CONFLICT (session_id, student_id) DO UPDATE SET
      status = EXCLUDED.status,
      waitlist_position = EXCLUDED.waitlist_position,
      payment_method = EXCLUDED.payment_method,
      payment_status = EXCLUDED.payment_status,
      cancelled_at = NULL,
      booked_at = now(),
      updated_at = now()
    WHERE course_bookings.status = 'cancelled';
  `);
}

/**
 * Mark an enrollment cancelled and cancel this student's confirmed/waitlisted
 * bookings for every future session on the course. If a confirmed slot opens
 * up, the next waitlisted booking is promoted (same as a drop-in cancel).
 */
export async function cancelOfflineEnrollment(studentId: string, courseId: string) {
  await db.transaction(async (tx) => {
    const updated = await tx.update(enrollments)
      .set({ status: 'cancelled' })
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId), eq(enrollments.kind, 'offline_semester')))
      .returning({ id: enrollments.id });
    if (updated.length === 0) return;

    // Cancel every active booking for future sessions on this course.
    const cancelledFutureBookings = await tx.execute(sql`
      WITH future_bookings AS (
        SELECT b.id, b.session_id, b.status
        FROM course_bookings b JOIN course_sessions s ON s.id = b.session_id
        WHERE b.student_id = ${studentId}
          AND b.course_id = ${courseId}
          AND s.starts_at > now()
          AND b.status IN ('confirmed', 'waitlisted')
      )
      UPDATE course_bookings b
      SET status = 'cancelled', cancelled_at = now(), waitlist_position = NULL, updated_at = now()
      FROM future_bookings f WHERE b.id = f.id
      RETURNING b.session_id, f.status AS prior_status
    `);
    const rows = ((cancelledFutureBookings as unknown as { rows?: Array<{ session_id: string; prior_status: string }> }).rows ?? []);

    // For each session where we vacated a confirmed seat, promote the next
    // waitlisted booking and renumber the waitlist.
    for (const row of rows) {
      if (row.prior_status !== 'confirmed') continue;
      await tx.execute(sql`
        WITH next_booking AS (
          SELECT id FROM course_bookings
          WHERE session_id = ${row.session_id} AND status = 'waitlisted'
          ORDER BY waitlist_position ASC, booked_at ASC
          FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE course_bookings b SET status = 'confirmed', waitlist_position = NULL, updated_at = now()
        FROM next_booking n WHERE b.id = n.id
      `);
      await tx.execute(sql`
        WITH ordered AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC, booked_at ASC)::int AS position
          FROM course_bookings WHERE session_id = ${row.session_id} AND status = 'waitlisted'
        )
        UPDATE course_bookings b SET waitlist_position = o.position
        FROM ordered o WHERE b.id = o.id
      `);
    }
  });
}
