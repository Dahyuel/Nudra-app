import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { enrollments, lessons, courseSections, users, courses } from '../db/schema';
import { sendEnrollmentEmail } from './mailer';
import { createNotification } from './notifications';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
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
  const result = await db.transaction(async tx => {
  const [locked] = await tx.select().from(courses).where(eq(courses.id,course.id)).for('update');
  if (!locked || !locked.isPublished || locked.approvalStatus !== 'approved') throw new Error('Course unavailable');
  const [prior] = await tx.select().from(enrollments).where(and(eq(enrollments.studentId,studentId),eq(enrollments.courseId,course.id)));
  if (prior?.status === 'active') return {created:false as const,enrollment:null};
  if (kind === 'offline_semester' && locked.capacity !== null) {
    const counts = await tx.execute(sql`SELECT count(*)::int AS value FROM enrollments WHERE course_id=${course.id} AND kind='offline_semester' AND status='active'`);
    if (Number(counts.rows[0]?.value) >= locked.capacity) throw Object.assign(new Error('Course full'),{status:409});
  }
  const [firstLesson] = await tx
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(courseSections, eq(lessons.sectionId, courseSections.id))
    .where(eq(lessons.courseId, course.id))
    .orderBy(courseSections.position, lessons.position)
    .limit(1);

  // The unique constraint is (studentId, courseId). A row that already exists
  // may have been cancelled earlier; reactivate it in place rather than
  // refusing. New rows get the requested kind + status 'active'.
  const inserted = await tx
    .insert(enrollments)
    .values({ studentId, courseId: course.id, progress: 0, lastLessonId: firstLesson?.id ?? null, kind, status: 'active' })
    .onConflictDoUpdate({
      target: [enrollments.studentId, enrollments.courseId],
      set: { kind, status: 'active' },
      where: eq(enrollments.status, 'cancelled'),
    })
    .returning();

  if (inserted.length === 0) return { created: false as const, enrollment: null };
  if (kind === 'offline_semester') await fanOutBookingsForEnrollment(studentId,course.id,tx);
  const [student]=await tx.select({name:users.name,email:users.email}).from(users).where(eq(users.id,studentId)).limit(1);
  if(student)await sendEnrollmentEmail(student,{title:course.title},tx);
  return {created:true as const,enrollment:inserted[0]};
  });
  if (!result.created) return result;

  createNotification(
    studentId,
    'enrollment_confirmed',
    'تم التسجيل بنجاح',
    `تم تسجيلك في ${course.title}`,
    `/course/${course.id}`
  ).catch(console.warn);

  return result;
}

/**
 * Fan out confirmed bookings for every scheduled future session on an offline
 * course to a newly-enrolled student. If the session is already at capacity,
 * the student is waitlisted (same rule the drop-in booking path uses).
 * Idempotent per (session_id, student_id) via the course_bookings UNIQUE.
 */
async function rosterStudent(tx: Tx,studentId:string,sessionId:string) {
 const sessions = await tx.execute(sql`SELECT id,course_id,organization_id,capacity FROM course_sessions WHERE id=${sessionId} AND status='scheduled' AND starts_at>now() FOR UPDATE`);
 const session = sessions.rows[0] as {id:string;course_id:string;organization_id:string|null;capacity:number}|undefined;
 if (!session) return;
 const prior = await tx.execute(sql`SELECT status FROM course_bookings WHERE session_id=${sessionId} AND student_id=${studentId}`);
 if (prior.rows[0] && prior.rows[0].status !== 'cancelled') return;
 const counts = await tx.execute(sql`SELECT count(*) FILTER(WHERE status='confirmed')::int AS confirmed,coalesce(max(waitlist_position) FILTER(WHERE status='waitlisted'),0)::int AS waiting FROM course_bookings WHERE session_id=${sessionId}`);
 const stats=counts.rows[0] as {confirmed:number;waiting:number};const confirmed=stats.confirmed<session.capacity;
 await tx.execute(sql`INSERT INTO course_bookings(session_id,course_id,organization_id,student_id,status,waitlist_position,payment_method,payment_status)
 VALUES(${sessionId},${session.course_id},${session.organization_id},${studentId},${confirmed?'confirmed':'waitlisted'},${confirmed?null:stats.waiting+1},'offline','pending')
 ON CONFLICT(session_id,student_id) DO UPDATE SET status=excluded.status,waitlist_position=excluded.waitlist_position,cancelled_at=NULL,booked_at=now(),updated_at=now() WHERE course_bookings.status='cancelled'`);
}
export async function fanOutBookingsForEnrollment(studentId:string,courseId:string,executor?:Tx) {
 const run=async(tx:Tx)=>{const sessions=await tx.execute(sql`SELECT id FROM course_sessions WHERE course_id=${courseId} AND status='scheduled' AND starts_at>now() ORDER BY id`);for(const s of sessions.rows as {id:string}[])await rosterStudent(tx,studentId,s.id);};
 if(executor)return run(executor);
 return db.transaction(async tx=>{await tx.select().from(courses).where(eq(courses.id,courseId)).for('update');await run(tx);});
}
export async function fanOutEnrolleesToSession(sessionId:string,courseId:string,_organizationId:string|null,executor?:Tx) {
 const run=async(tx:Tx)=>{const students=await tx.select({id:enrollments.studentId}).from(enrollments).where(and(eq(enrollments.courseId,courseId),eq(enrollments.kind,'offline_semester'),eq(enrollments.status,'active'))).orderBy(enrollments.enrolledAt,enrollments.id);for(const student of students)await rosterStudent(tx,student.id,sessionId);};
 if(executor)return run(executor);
 return db.transaction(async tx=>{await tx.select().from(courses).where(eq(courses.id,courseId)).for('update');await run(tx);});
}

/**
 * Mark an enrollment cancelled and cancel this student's confirmed/waitlisted
 * bookings for every future session on the course. If a confirmed slot opens
 * up, the next waitlisted booking is promoted (same as a drop-in cancel).
 */
export async function cancelOfflineEnrollment(studentId: string, courseId: string) {
  await db.transaction(async (tx) => {
    await tx.select().from(courses).where(eq(courses.id,courseId)).for('update');
    await tx.execute(sql`SELECT id FROM course_sessions WHERE course_id=${courseId} AND starts_at>now() ORDER BY id FOR UPDATE`);
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
