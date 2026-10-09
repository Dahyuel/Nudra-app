import { lessonAccess } from '../lib/access';
import { Router, Request, Response } from 'express';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../db';
import { lessons, courses, enrollments, lessonNotes } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';

async function verifyLessonAccess(lessonId: string, userId: string, role: string, organizationId: string | null) {
  return lessonAccess(lessonId, userId, role, organizationId ?? null);
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

    if (typeof content !== 'string' || !content.trim() || content.length > 10000) {
      return res.status(400).json({ message: 'content is required' });
    }
    if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0 || timestampSeconds > 86400) {
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
