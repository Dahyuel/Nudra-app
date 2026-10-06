import { Router, Request, Response } from 'express';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../db';
import { lessons, courses, enrollments, lessonNotes } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';

async function verifyLessonAccess(
  lessonId: string,
  userId: string,
  role: string,
  organizationId: string | null,
): Promise<{ allowed: boolean; status?: number; message?: string }> {
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

  if (role === 'instructor' && lesson.courseId) {
    if (course.instructorId === userId) {
      return { allowed: true };
    }
  }

  if (lesson.isFree) {
    return { allowed: true };
  }

  if (lesson.courseId) {
    const enr = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, userId), eq(enrollments.courseId, lesson.courseId)))
      .limit(1);
    if (enr.length > 0) {
      return { allowed: true };
    }
  }

  return { allowed: false, status: 403, message: 'Access denied' };
}

const router = Router();

router.get('/lesson/:lessonId', requireAuth, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { lessonId } = req.params;

    const access = await verifyLessonAccess(lessonId, studentId, req.user!.role, req.organization?.id ?? null);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
    }

    const rows = await db
      .select()
      .from(lessonNotes)
      .where(and(eq(lessonNotes.studentId, studentId), eq(lessonNotes.lessonId, lessonId)))
      .orderBy(desc(lessonNotes.createdAt));

    return res.json({ notes: rows });
  } catch (err) {
    console.error('notes list error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/lesson/:lessonId', requireAuth, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { lessonId } = req.params;
    const { content, timestampSeconds } = req.body ?? {};

    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ message: 'content is required' });
    }
    if (typeof timestampSeconds !== 'number' || timestampSeconds < 0) {
      return res.status(400).json({ message: 'timestampSeconds must be a non-negative number' });
    }

    const access = await verifyLessonAccess(lessonId, studentId, req.user!.role, req.organization?.id ?? null);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
    }

    const rows = await db
      .insert(lessonNotes)
      .values({
        studentId,
        lessonId,
        content: content.trim(),
        timestampSeconds: Math.floor(timestampSeconds),
      })
      .returning();

    return res.status(201).json({ note: rows[0] });
  } catch (err) {
    console.error('create note error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:noteId', requireAuth, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { noteId } = req.params;

    const courseScope = req.organization
      ? eq(courses.organizationId, req.organization.id)
      : isNull(courses.organizationId);
    const rows = await db.select({ note: lessonNotes })
      .from(lessonNotes)
      .innerJoin(lessons, eq(lessonNotes.lessonId, lessons.id))
      .innerJoin(courses, eq(lessons.courseId, courses.id))
      .where(and(
        eq(lessonNotes.id, noteId),
        eq(lessonNotes.studentId, studentId),
        courseScope,
      ))
      .limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }

    await db.delete(lessonNotes).where(and(eq(lessonNotes.id, noteId), eq(lessonNotes.studentId, studentId)));

    return res.json({ success: true });
  } catch (err) {
    console.error('delete note error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
