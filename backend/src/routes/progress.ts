import { courseAccess } from '../lib/access';
import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { eq, and, count, sql, isNull } from 'drizzle-orm';
import { db } from '../db';
import { lessons, enrollments, lessonProgress, studySessions, certificates, courses } from '../db/schema';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import { checkAndAwardBadges } from '../lib/badges';
import { sendCertificateEmail } from '../lib/mailer';
import { createNotification } from '../lib/notifications';

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const router = Router();

router.post('/lesson/:lessonId', requireAuth, requireRole('student'), async (req: Request, res: Response) => {
 const studentId = req.user!.id;
 const { lessonId } = req.params;
 const { watchedSeconds, completed } = req.body ?? {};
 if (!Number.isSafeInteger(watchedSeconds) || watchedSeconds < 0 || watchedSeconds > 86400 || (completed !== undefined && typeof completed !== 'boolean')) {
   return res.status(400).json({ message: 'Invalid lesson progress' });
 }
 const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
 if (!lesson) return res.status(404).json({ message: 'Lesson not found' });
 const access = await courseAccess(lesson.courseId, studentId, req.user!.role, req.organization?.id ?? null);
 if (!access.course || !access.enrollment) return res.status(403).json({ message: 'Active enrollment is required to record progress' });
 const courseId = lesson.courseId;
 const result = await db.transaction(async (tx) => {
   const [currentCourse] = await tx.select().from(courses).where(eq(courses.id,courseId)).for('share');
   if (!currentCourse) throw Object.assign(new Error('Course was removed'), {status:404});
   const [enrollment] = await tx.select().from(enrollments).where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId), eq(enrollments.status, 'active'))).for('update');
   if (!enrollment) throw Object.assign(new Error('Enrollment was revoked'), { status: 403 });
   const [existing] = await tx.select().from(lessonProgress).where(and(eq(lessonProgress.studentId, studentId), eq(lessonProgress.lessonId, lessonId)));
   const now = new Date();
   const previous = existing?.watchedSeconds ?? 0;
   const elapsed = existing ? Math.min(60, Math.max(0, Math.floor((now.getTime() - existing.lastActivityAt.getTime()) / 1000))) : 0;
   const duration = lesson.durationSeconds ?? 0;
   const accepted = Math.max(previous, Math.min(watchedSeconds, previous + elapsed, duration || 86400));
   const isCompleted = duration > 0 && accepted >= Math.ceil(duration * 0.9) && (existing?.completed === true || completed === true);
   const [updated] = await tx.insert(lessonProgress).values({studentId, lessonId, courseId, watchedSeconds: accepted, completed: isCompleted, completedAt: isCompleted ? existing?.completedAt ?? now : null, lastActivityAt: now})
     .onConflictDoUpdate({target: [lessonProgress.studentId, lessonProgress.lessonId], set: {watchedSeconds: accepted, completed: isCompleted, completedAt: isCompleted ? existing?.completedAt ?? now : null, lastActivityAt: now}}).returning();
   const totals = await tx.execute(sql`SELECT count(l.id)::int AS total, count(p.id) FILTER (WHERE p.completed AND l.duration_seconds > 0 AND p.watched_seconds >= ceil(l.duration_seconds * 0.9))::int AS completed FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id=l.id AND p.student_id=${studentId} WHERE l.course_id=${courseId}`);
   const counts = totals.rows[0] as { total: number; completed: number };
   const progress = counts.total ? Math.min(100, Math.round(counts.completed * 100 / counts.total)) : 0;
   await tx.update(enrollments).set({progress, lastLessonId: lessonId}).where(eq(enrollments.id, enrollment.id));
   const minutes = Math.floor(accepted / 60) - Math.floor(previous / 60);
   if (minutes > 0) await tx.insert(studySessions).values({studentId, date: now.toISOString().slice(0,10), minutesStudied: minutes}).onConflictDoUpdate({target:[studySessions.studentId,studySessions.date],set:{minutesStudied:sql`${studySessions.minutesStudied} + ${minutes}`}});
   let certificateEarned = null;
   if (progress === 100 && currentCourse.isPublished && currentCourse.approvalStatus === 'approved') {
     const certCode = 'CERT-EDR-' + randomBytes(8).toString('hex').toUpperCase();
     const inserted = await tx.insert(certificates).values({studentId,courseId,certCode}).onConflictDoNothing().returning();
     if (inserted.length) {
       certificateEarned = {certCode,courseId,courseTitle:currentCourse.title};
       await sendCertificateEmail({name:req.user!.name,email:req.user!.email},{title:currentCourse.title},certCode,tx);
     }
   }
   return {lessonProgress:updated,courseProgress:progress,certificateEarned};
 });
 await checkAndAwardBadges(studentId);
 return res.json(result);
});

router.get('/course/:courseId', requireAuth, requireRole('student'), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { courseId } = req.params;

    const courseScope = req.organization
      ? eq(courses.organizationId, req.organization.id)
      : isNull(courses.organizationId);
    const scopedCourse = await db.select({ id: courses.id }).from(courses)
      .where(and(eq(courses.id, courseId), courseScope)).limit(1);
    if (scopedCourse.length === 0) return res.status(404).json({ message: 'Course not found' });

    const rows = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.studentId, studentId), eq(lessonProgress.courseId, courseId)));

    const result: Record<string, { watchedSeconds: number; completed: boolean; completedAt: Date | null }> = {};
    for (const row of rows) {
      result[row.lessonId] = {
        watchedSeconds: row.watchedSeconds,
        completed: row.completed,
        completedAt: row.completedAt,
      };
    }

    return res.json({ progress: result });
  } catch (err) {
    console.error('course progress error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
