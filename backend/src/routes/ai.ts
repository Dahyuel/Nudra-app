import { Router, Request, Response } from 'express';
import { eq, and, asc, desc, sql, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import {
  aiConversations,
  aiMessages,
  courses,
  enrollments,
  flashcards,
  lessons,
  lessonChunks,
  lessonSummaries,
  users,
  weakTopics,
  orgMemberships,
} from '../db/schema';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import { embedText, getEmbeddingProvider } from '../lib/embeddings';
import { chatCompletion, streamChatCompletion } from '../lib/deepseek';
import { generateWeakTopics } from './quizzes';
import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();

router.use(requireAuth);

const chatLimiter = createRateLimiter({
  keyPrefix: 'ai:chat',
  maxRequests: 20,
  windowSeconds: 3600,
  errorMessage: 'لقد تجاوزت الحد المسموح به للمحادثات. حاول مرة أخرى بعد ساعة.',
});

const flashcardLimiter = createRateLimiter({
  keyPrefix: 'ai:flashcards',
  maxRequests: 10,
  windowSeconds: 86400,
  errorMessage: 'لقد وصلت للحد اليومي لإنشاء البطاقات التعليمية.',
});

const summaryLimiter = createRateLimiter({
  keyPrefix: 'ai:summary',
  maxRequests: 20,
  windowSeconds: 86400,
  errorMessage: 'لقد وصلت للحد اليومي لإنشاء الملخصات.',
});

const weakTopicsLimiter = createRateLimiter({
  keyPrefix: 'ai:weak-topics',
  maxRequests: 5,
  windowSeconds: 86400,
  errorMessage: 'لقد وصلت للحد اليومي لتحليل المواضيع الضعيفة.',
});

const flashcardSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

async function getCourseTitle(courseId: string | null): Promise<string | null> {
  if (!courseId) return null;
  const rows = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1);
  return rows[0]?.title ?? null;
}

async function verifyConversationOwnership(conversationId: string, studentId: string, organizationId?: string) {
  const courseScope = organizationId ? eq(courses.organizationId, organizationId) : isNull(courses.organizationId);
  const rows = await db.select({ id: aiConversations.id })
    .from(aiConversations)
    .leftJoin(courses, eq(aiConversations.courseId, courses.id))
    .where(and(
      eq(aiConversations.id, conversationId),
      eq(aiConversations.studentId, studentId),
      or(isNull(aiConversations.courseId), courseScope),
    ))
    .limit(1);
  return rows.length > 0;
}

type LessonAccessResult =
  | { allowed: true; courseId: string | null }
  | { allowed: false; status: number; message: string };

async function verifyCourseTenant(userId: string, courseId: string, organizationId?: string): Promise<boolean> {
  const [course] = await db.select({ organizationId: courses.organizationId }).from(courses)
    .where(eq(courses.id, courseId)).limit(1);
  if (!course || (organizationId ? course.organizationId !== organizationId : course.organizationId !== null)) return false;
  if (!organizationId) return true;
  const [membership] = await db.select({ id: orgMemberships.id }).from(orgMemberships).where(and(
    eq(orgMemberships.orgId, organizationId), eq(orgMemberships.userId, userId), eq(orgMemberships.status, 'active')
  )).limit(1);
  return Boolean(membership);
}

async function verifyLessonAccess(lessonId: string, userId: string, role: string, organizationId?: string): Promise<LessonAccessResult> {
  const lessonRows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (lessonRows.length === 0) return { allowed: false, status: 404, message: 'Lesson not found' };

  const lesson = lessonRows[0];

  if (lesson.courseId && !(await verifyCourseTenant(userId, lesson.courseId, organizationId))) {
    return { allowed: false, status: 404, message: 'Lesson not found' };
  }

  if (role === 'instructor' && lesson.courseId) {
    const courseRows = await db.select().from(courses).where(eq(courses.id, lesson.courseId)).limit(1);
    if (courseRows.length > 0 && courseRows[0].instructorId === userId) {
      return { allowed: true, courseId: lesson.courseId };
    }
  }

  if (lesson.courseId) {
    const enr = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, userId), eq(enrollments.courseId, lesson.courseId)))
      .limit(1);
    if (enr.length > 0) {
      return { allowed: true, courseId: lesson.courseId };
    }
  }

  return { allowed: false, status: 403, message: 'Access denied' };
}

async function getLessonTranscript(lessonId: string, maxChars?: number): Promise<string | null> {
  const rows = await db
    .select({ content: lessonChunks.content })
    .from(lessonChunks)
    .where(eq(lessonChunks.lessonId, lessonId))
    .orderBy(asc(lessonChunks.chunkIndex));

  if (rows.length === 0) return null;

  const text = rows.map((r) => r.content).join('\n\n');
  return maxChars && text.length > maxChars ? text.slice(0, maxChars) : text;
}

async function verifyCourseAccess(userId: string, role: string, courseId: string, organizationId?: string): Promise<boolean> {
  if (!(await verifyCourseTenant(userId, courseId, organizationId))) return false;
  if (role === 'instructor') {
    const courseRows = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    if (courseRows.length > 0 && courseRows[0].instructorId === userId) {
      return true;
    }
  }
  const enr = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.studentId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);
  return enr.length > 0;
}

router.post('/conversations', async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const role = req.user!.role;
    const { courseId } = req.body ?? {};

    if (courseId) {
      const hasAccess = await verifyCourseAccess(studentId, role, courseId, req.organization?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this course' });
      }
    }

    const inserted = await db
      .insert(aiConversations)
      .values({ studentId, courseId: courseId || null })
      .returning();
    return res.json({ conversationId: inserted[0].id });
  } catch (err) {
    console.error('create conversation error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/chat', chatLimiter, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { message, conversationId, courseId } = req.body ?? {};

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'message is required' });
    }

    if (!conversationId) {
      return res.status(400).json({ message: 'conversationId is required' });
    }

    const owns = await verifyConversationOwnership(conversationId, studentId, req.organization?.id);
    if (!owns) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const conversationRows = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, conversationId))
      .limit(1);
    const conversation = conversationRows[0];

    if (courseId && conversation?.courseId && conversation.courseId !== courseId) {
      return res.status(403).json({ message: 'Course mismatch' });
    }

    const effectiveCourseId = courseId || conversation?.courseId;
    if (effectiveCourseId) {
      const hasAccess = await verifyCourseAccess(studentId, req.user!.role, effectiveCourseId, req.organization?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this course' });
      }
    }

    const userContent = message.trim();

    await db.insert(aiMessages).values({
      conversationId,
      role: 'user',
      content: userContent,
    });

    let context = '';
    if (effectiveCourseId) {
      try {
        const embedding = await embedText(userContent);
        const chunks = await db.execute(sql`
          SELECT content FROM lesson_chunks
          WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id = ${effectiveCourseId})
            AND embedding_provider = ${getEmbeddingProvider()}
          ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector(768)
          LIMIT 5
        `);
        const rows = chunks.rows as { content: string }[];
        if (rows.length > 0) {
          context = rows.map((r) => r.content).join('\n\n---\n\n');
        }
      } catch (ragErr) {
        console.warn('RAG embedding failed, falling back to empty context', ragErr);
      }
    }

    const historyRows = await db
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(desc(aiMessages.createdAt))
      .limit(11);

    const history = historyRows.slice(1).reverse();

    const courseTitle = await getCourseTitle(effectiveCourseId ?? null);
    const contextIntro = courseTitle ? `an expert educational assistant for ${courseTitle}` : 'general learning';
    const contextBlock = context
      ? `Here is relevant content from the course materials:\n\n${context}\n\nBase your answer on this content when relevant.`
      : '';

    const systemMessage = `You are Nudra's AI Tutor, ${contextIntro}. ${contextBlock}
Answer clearly and educationally. You may use markdown formatting for headers, bullet points, bold text, and code blocks.
If asked something unrelated to the course, gently redirect the student back to the course topics.`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemMessage.trim() },
      ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: userContent },
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullText = '';

    try {
      await streamChatCompletion(messages, (chunk) => {
        fullText += chunk;
        // SSE spec: every line of a multi-line payload needs its own `data:` prefix
        const escaped = chunk.replace(/\r?\n/g, '\ndata: ');
        res.write(`data: ${escaped}\n\n`);
      });

      await db.insert(aiMessages).values({
        conversationId,
        role: 'assistant',
        content: fullText,
      });

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (streamErr) {
      const errMessage = streamErr instanceof Error ? streamErr.message : String(streamErr);
      console.error('stream chat error', streamErr);

      if (errMessage.includes('authentication expired')) {
        res.write('data: [ERROR:AI_AUTH_EXPIRED]\n\n');
      } else {
        res.write('data: [ERROR:UNKNOWN]\n\n');
      }
      res.end();
    }
  } catch (err) {
    console.error('chat error', err);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.write('data: [ERROR:UNKNOWN]\n\n');
    res.end();
  }
});

router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;

    const courseScope = req.organization ? eq(courses.organizationId, req.organization.id) : isNull(courses.organizationId);
    const rows = await db
      .select({
        id: aiConversations.id,
        courseId: aiConversations.courseId,
        createdAt: aiConversations.createdAt,
        courseTitle: courses.title,
      })
      .from(aiConversations)
      .leftJoin(courses, eq(aiConversations.courseId, courses.id))
      .where(and(
        eq(aiConversations.studentId, studentId),
        or(isNull(aiConversations.courseId), courseScope),
      ))
      .orderBy(desc(aiConversations.createdAt));

    const conversations = await Promise.all(
      rows.map(async (row) => {
        // Fetch the FIRST user message as the conversation title
        const firstUserMsg = await db
          .select({ content: aiMessages.content })
          .from(aiMessages)
          .where(and(eq(aiMessages.conversationId, row.id), eq(aiMessages.role, 'user')))
          .orderBy(asc(aiMessages.createdAt))
          .limit(1);

        const countRows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(aiMessages)
          .where(eq(aiMessages.conversationId, row.id));

        return {
          id: row.id,
          courseId: row.courseId,
          courseTitle: row.courseTitle,
          createdAt: row.createdAt,
          messageCount: countRows[0]?.count ?? 0,
          lastMessage: firstUserMsg[0]?.content ?? null,
        };
      })
    );

    const filtered = conversations.filter((c) => c.messageCount > 0);

    return res.json({ conversations: filtered });
  } catch (err) {
    console.error('list conversations error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/conversations/:conversationId', async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { conversationId } = req.params;

    const owns = await verifyConversationOwnership(conversationId, studentId, req.organization?.id);
    if (!owns) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await db.delete(aiConversations).where(eq(aiConversations.id, conversationId));
    return res.json({ success: true });
  } catch (err) {
    console.error('delete conversation error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/conversations/:conversationId/messages', async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { conversationId } = req.params;

    const owns = await verifyConversationOwnership(conversationId, studentId, req.organization?.id);
    if (!owns) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const rows = await db
      .select({ id: aiMessages.id, role: aiMessages.role, content: aiMessages.content, createdAt: aiMessages.createdAt })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(asc(aiMessages.createdAt));

    return res.json(
      rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        createdAt: r.createdAt,
      }))
    );
  } catch (err) {
    console.error('list messages error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/flashcards/:lessonId', flashcardLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const { lessonId } = req.params;

    const access = await verifyLessonAccess(lessonId, userId, role, req.organization?.id);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const transcript = await getLessonTranscript(lessonId, 3000);
    if (!transcript) {
      return res.status(422).json({
        message: 'Lesson transcript not ready yet. Please wait for video processing to complete.',
      });
    }

    await db.delete(flashcards).where(and(eq(flashcards.studentId, userId), eq(flashcards.lessonId, lessonId)));

    const prompt = `You are an educational flashcard generator. Based on the following lesson content, generate exactly 5 flashcards. Return ONLY a valid JSON array with no markdown, no explanation, no backticks.
Format: [{"question": "...", "answer": "..."}]

Lesson content:
${transcript}`;

    let raw: string;
    try {
      raw = await chatCompletion([{ role: 'user', content: prompt }]);
    } catch (err) {
      console.error('flashcard generation error', err);
      throw new Error('Failed to generate flashcards');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const retryPrompt = `${prompt}\n\nCRITICAL: Return ONLY a valid JSON array. Do not include markdown code fences or any other text.`;
      raw = await chatCompletion([{ role: 'user', content: retryPrompt }]);
      parsed = JSON.parse(raw);
    }

    const validated = z.array(flashcardSchema).parse(parsed);
    const cards = validated.slice(0, 5);

    const inserted = await db
      .insert(flashcards)
      .values(
        cards.map((c) => ({
          studentId: userId,
          lessonId,
          question: c.question,
          answer: c.answer,
        }))
      )
      .returning();

    return res.json(
      inserted.map((f) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
      }))
    );
  } catch (err) {
    console.error('flashcards error', err);
    if (err instanceof z.ZodError) {
      return res.status(422).json({ message: 'Invalid flashcard format from AI' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/flashcards/:lessonId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { lessonId } = req.params;

    const access = await verifyLessonAccess(lessonId, userId, req.user!.role, req.organization?.id);
    if (!access.allowed) return res.status(access.status).json({ message: access.message });

    const rows = await db
      .select({ id: flashcards.id, question: flashcards.question, answer: flashcards.answer })
      .from(flashcards)
      .where(and(eq(flashcards.studentId, userId), eq(flashcards.lessonId, lessonId)))
      .orderBy(asc(flashcards.createdAt));

    return res.json(rows);
  } catch (err) {
    console.error('get flashcards error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/summary/:lessonId', summaryLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const { lessonId } = req.params;

    const access = await verifyLessonAccess(lessonId, userId, role, req.organization?.id);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const existing = await db
      .select()
      .from(lessonSummaries)
      .where(eq(lessonSummaries.lessonId, lessonId))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ lessonId, content: existing[0].content, cached: true });
    }

    const transcript = await getLessonTranscript(lessonId, 4000);
    if (!transcript) {
      return res.status(422).json({
        message: 'Lesson transcript not ready yet. Please wait for video processing to complete.',
      });
    }

    const prompt = `Summarize this lesson for a student in exactly 5 bullet points. Each bullet should be one clear, concise sentence.
Return only the bullet points, no headers, no preamble.
Start each bullet with a bullet character •

Lesson content:
${transcript}`;

    const content = await chatCompletion([{ role: 'user', content: prompt }]);

    const inserted = await db
      .insert(lessonSummaries)
      .values({ lessonId, content })
      .returning();

    return res.json({ lessonId, content: inserted[0].content, cached: false });
  } catch (err) {
    console.error('summary error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/summary/:lessonId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const { lessonId } = req.params;

    const access = await verifyLessonAccess(lessonId, userId, role, req.organization?.id);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const rows = await db
      .select({ content: lessonSummaries.content })
      .from(lessonSummaries)
      .where(eq(lessonSummaries.lessonId, lessonId))
      .limit(1);

    return res.json({ content: rows[0]?.content ?? null });
  } catch (err) {
    console.error('get summary error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/weak-topics/:courseId', requireRole('student'), weakTopicsLimiter, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { courseId } = req.params;

    if (!z.string().uuid().safeParse(courseId).success) return res.status(400).json({ message: 'Invalid course id' });
    if (!(await verifyCourseTenant(studentId, courseId, req.organization?.id))) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const enr = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId)))
      .limit(1);
    if (enr.length === 0) {
      return res.status(403).json({ message: 'Not enrolled in this course' });
    }

    const result = await generateWeakTopics(studentId, courseId, req.organization?.id ?? null);
    if ('error' in result) {
      return res.status(422).json({ message: result.error });
    }

    return res.json(result);
  } catch (err) {
    console.error('weak topics error', err);
    // chatCompletion throws these when the LLM proxy is down or rejects us.
    const message = err instanceof Error ? err.message : '';
    if (/AI service|DeepSeek proxy|AI request failed/i.test(message)) {
      return res.status(503).json({ message: 'The AI service is unavailable right now. Please try again later.' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/weak-topics/:courseId', requireRole('student'), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { courseId } = req.params;

    if (!z.string().uuid().safeParse(courseId).success) return res.status(400).json({ message: 'Invalid course id' });
    if (!(await verifyCourseTenant(studentId, courseId, req.organization?.id))) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const rows = await db
      .select()
      .from(weakTopics)
      .where(and(eq(weakTopics.studentId, studentId), eq(weakTopics.courseId, courseId)))
      .limit(1);

    if (rows.length === 0) {
      return res.json({ weakTopics: null });
    }

    return res.json({
      weakTopics: {
        topicSummary: rows[0].topicSummary,
        recommendations: rows[0].recommendations,
        generatedAt: rows[0].generatedAt,
      },
    });
  } catch (err) {
    console.error('get weak topics error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
