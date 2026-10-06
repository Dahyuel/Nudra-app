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

async function recordStudySession(studentId: string): Promise<void> {
  const today = toDateString(new Date());
  await db
    .insert(studySessions)
    .values({ studentId, date: today, minutesStudied: 5 })
    .onConflictDoUpdate({
      target: [studySessions.studentId, studySessions.date],
      set: { minutesStudied: sql`${studySessions.minutesStudied} + 5` },
    });
}

async function verifyStudentLessonAccess(
  lessonId: string,
  studentId: string,
  organizationId: string | null,
): Promise<{ allowed: boolean; status?: number; message?: string; courseId?: string }> {
  const courseScope = organizationId === null
    ? isNull(courses.organizationId)
    : eq(courses.organizationId, organizationId);
  const lessonRows = await db.select({ lesson: lessons, course: courses })
    .from(lessons)
    .innerJoin(courses, eq(lessons.courseId, courses.id))
    .where(and(eq(lessons.id, lessonId), courseScope))
    .limit(1);
  if (lessonRows.length === 0) {
    return { allowed: false, status: 404, message: 'Lesson not found' };
  }

  const { lesson, course } = lessonRows[0];
  const courseId = course.id;

  if (lesson.isFree) {
    return { allowed: true, courseId };
  }

  if (courseId) {
    const enr = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId)))
      .limit(1);
    if (enr.length > 0) {
      return { allowed: true, courseId };
    }
  }

  return { allowed: false, status: 403, message: 'Not enrolled in this course' };
}

const router = Router();

async function recalcCourseProgress(studentId: string, courseId: string): Promise<number> {
  const totalRows = await db
    .select({ count: count(lessons.id) })
    .from(lessons)
    .where(eq(lessons.courseId, courseId));
  const total = Number(totalRows[0]?.count ?? 0);

  const completedRows = await db
    .select({ count: count(lessonProgress.id) })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.studentId, studentId),
        eq(lessonProgress.courseId, courseId),
        eq(lessonProgress.completed, true)
      )
    );
  const completed = Number(completedRows[0]?.count ?? 0);

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  await db
    .update(enrollments)
    .set({ progress: percentage })
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId)));

  return percentage;
}

router.post('/lesson/:lessonId', requireAuth, requireRole('student'), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { lessonId } = req.params;
    const { watchedSeconds, completed } = req.body ?? {};

    if (typeof watchedSeconds !== 'number' || watchedSeconds < 0) {
      return res.status(400).json({ message: 'watchedSeconds must be a non-negative number' });
    }

    const access = await verifyStudentLessonAccess(lessonId, studentId, req.organization?.id ?? null);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
    }
    const courseId = access.courseId!;

    const existing = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.studentId, studentId), eq(lessonProgress.lessonId, lessonId)))
      .limit(1);

    const isCompleted = completed === true;
    let updated;

    if (existing.length > 0) {
      const wasCompleted = existing[0].completed;
      const completedAt = isCompleted && !wasCompleted ? new Date() : existing[0].completedAt;
      const rows = await db
        .update(lessonProgress)
        .set({ watchedSeconds, completed: isCompleted, completedAt })
        .where(eq(lessonProgress.id, existing[0].id))
        .returning();
      updated = rows[0];
    } else {
      const rows = await db
        .insert(lessonProgress)
        .values({
          studentId,
          lessonId,
          courseId,
          watchedSeconds,
          completed: isCompleted,
          completedAt: isCompleted ? new Date() : null,
        })
        .returning();
      updated = rows[0];
    }

    const progress = await recalcCourseProgress(studentId, courseId);

    await db
      .update(enrollments)
      .set({ lastLessonId: lessonId })
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId)));

    await recordStudySession(studentId);

    let certificateEarned: { certCode: string; courseId: string; courseTitle: string } | null = null;

    if (progress === 100 && courseId) {
      const existingCert = await db
        .select()
        .from(certificates)
        .where(and(eq(certificates.studentId, studentId), eq(certificates.courseId, courseId)))
        .limit(1);

      if (existingCert.length === 0) {
        const courseRows = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
        const certCode = `CERT-EDR-${randomBytes(8).toString('hex').toUpperCase()}`;
        try {
          await db.insert(certificates).values({ studentId, courseId, certCode });
          certificateEarned = {
            certCode,
            courseId,
            courseTitle: courseRows[0]?.title ?? '',
          };
        } catch (certErr) {
          console.error('certificate insert error', certErr);
        }
      }
    }

    if (certificateEarned) {
      sendCertificateEmail(
        { name: req.user!.name, email: req.user!.email },
        { title: certificateEarned.courseTitle },
        certificateEarned.certCode
      ).catch(console.warn);
      createNotification(
        studentId,
        'certificate_earned',
        'تهانينا! حصلت على شهادة',
        `أتممت مقرر ${certificateEarned.courseTitle}`,
        '/progress'
      ).catch(console.warn);
    }

    await checkAndAwardBadges(studentId);

    return res.json({ lessonProgress: updated, courseProgress: progress, certificateEarned });
  } catch (err) {
    console.error('lesson progress error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
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
