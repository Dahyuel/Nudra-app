import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { eq, and, asc, desc, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import {
  courses,
  enrollments,
  lessons,
  quizzes,
  quizQuestions,
  quizAttempts,
  weakTopics,
} from '../db/schema';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import { chatCompletion } from '../lib/deepseek';

const router = Router();

router.use(requireAuth);

const optionLetters = ['a', 'b', 'c', 'd'] as const;
type OptionLetter = (typeof optionLetters)[number];

type LessonAccessResult =
  | { allowed: true; lesson: typeof lessons.$inferSelect }
  | { allowed: false; status: number; message: string };

async function verifyLessonAccess(lessonId: string, userId: string, role: string): Promise<LessonAccessResult> {
  const lessonRows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (lessonRows.length === 0) return { allowed: false, status: 404, message: 'Lesson not found' };

  const lesson = lessonRows[0];

  if (role === 'instructor') {
    const courseRows = await db.select().from(courses).where(eq(courses.id, lesson.courseId)).limit(1);
    if (courseRows.length > 0 && courseRows[0].instructorId === userId) {
      return { allowed: true, lesson };
    }
  }

  if (lesson.isFree) return { allowed: true, lesson };

  const enr = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.studentId, userId), eq(enrollments.courseId, lesson.courseId)))
    .limit(1);
  if (enr.length > 0) return { allowed: true, lesson };

  return { allowed: false, status: 403, message: 'Access denied' };
}

export async function generateWeakTopics(studentId: string, courseId: string) {
  const attemptRows = await db
    .select({
      attempt: quizAttempts,
      lessonTitle: lessons.title,
      quizTitle: quizzes.title,
    })
    .from(quizAttempts)
    .innerJoin(lessons, eq(quizAttempts.lessonId, lessons.id))
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(and(eq(quizAttempts.studentId, studentId), eq(quizAttempts.courseId, courseId)))
    .orderBy(desc(quizAttempts.completedAt));

  if (attemptRows.length < 2) {
    return { error: 'Not enough quiz data yet. Complete at least 2 lesson quizzes to get a weak topic analysis.' };
  }

  const courseRows = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1);
  const courseTitle = courseRows[0]?.title ?? 'this course';

  const questionIds = new Set<string>();
  for (const row of attemptRows) {
    try {
      const parsed = JSON.parse(row.attempt.answers) as Record<string, string>;
      Object.keys(parsed).forEach((id) => questionIds.add(id));
    } catch {
      // ignore malformed
    }
  }

  const questionRows = questionIds.size
    ? await db.select().from(quizQuestions).where(inArray(quizQuestions.id, Array.from(questionIds)))
    : [];
  const questionMap = new Map(questionRows.map((q) => [q.id, q]));

  const summaryLines: string[] = [];
  for (const row of attemptRows) {
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(row.attempt.answers) as Record<string, string>;
    } catch {
      parsed = {};
    }
    summaryLines.push(`Lesson: ${row.lessonTitle} — Score: ${row.attempt.percentage}%`);
    for (const [qId, answer] of Object.entries(parsed)) {
      const q = questionMap.get(qId);
      if (!q) continue;
      if (answer !== q.correctOption) {
        const correctText =
          q.correctOption === 'a' ? q.optionA : q.correctOption === 'b' ? q.optionB : q.correctOption === 'c' ? q.optionC : q.optionD;
        summaryLines.push(`  Missed: "${q.questionText}" (correct answer: ${correctText})`);
      }
    }
  }

  const NL = String.fromCharCode(10);
  const summaryText = summaryLines.join(NL);
  const prompt = [
    `You are an educational analyst for an Egyptian edtech platform. A student has completed the following quizzes in the course '${courseTitle}':`,
    '',
    summaryText,
    '',
    'Based on this performance data, identify the student\'s 2-3 weakest topic areas and provide specific, actionable study recommendations. Be encouraging and constructive. Write in a clear, student-friendly tone. Structure your response as:',
    '',
    'WEAK AREAS:',
    '[bullet points of weak topics]',
    '',
    'RECOMMENDATIONS:',
    '[specific actionable steps]',
  ].join(NL);

  const content = await chatCompletion([{ role: 'user', content: prompt }]);

  const weakMatch = content.match(/WEAK AREAS:\s*([\s\S]*?)(?:RECOMMENDATIONS:|$)/i);
  const recMatch = content.match(/RECOMMENDATIONS:\s*([\s\S]*)/i);
  const topicSummary = weakMatch ? weakMatch[1].trim() : content;
  const recommendations = recMatch ? recMatch[1].trim() : '';

  const existing = await db
    .select()
    .from(weakTopics)
    .where(and(eq(weakTopics.studentId, studentId), eq(weakTopics.courseId, courseId)))
    .limit(1);

  let saved;
  if (existing.length > 0) {
    const rows = await db
      .update(weakTopics)
      .set({ topicSummary, recommendations, generatedAt: new Date() })
      .where(eq(weakTopics.id, existing[0].id))
      .returning();
    saved = rows[0];
  } else {
    const rows = await db
      .insert(weakTopics)
      .values({ studentId, courseId, topicSummary, recommendations })
      .returning();
    saved = rows[0];
  }

  return { topicSummary: saved.topicSummary, recommendations: saved.recommendations, generatedAt: saved.generatedAt };
}

router.get('/lesson/:lessonId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const { lessonId } = req.params;

    const access = await verifyLessonAccess(lessonId, userId, role);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const quizRows = await db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).limit(1);
    if (quizRows.length === 0) {
      return res.json({ quiz: null, lastAttempt: null });
    }

    const quiz = quizRows[0];

    const questions = await db
      .select({
        id: quizQuestions.id,
        questionText: quizQuestions.questionText,
        optionA: quizQuestions.optionA,
        optionB: quizQuestions.optionB,
        optionC: quizQuestions.optionC,
        optionD: quizQuestions.optionD,
        position: quizQuestions.position,
      })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quiz.id))
      .orderBy(asc(quizQuestions.position));

    const lastAttemptRows = await db
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.studentId, userId)))
      .orderBy(desc(quizAttempts.completedAt))
      .limit(1);

    const lastAttempt = lastAttemptRows[0]
      ? {
          score: lastAttemptRows[0].score,
          total: lastAttemptRows[0].totalQuestions,
          percentage: lastAttemptRows[0].percentage,
          completedAt: lastAttemptRows[0].completedAt,
          answers: JSON.parse(lastAttemptRows[0].answers),
        }
      : null;

    return res.json({
      quiz: { id: quiz.id, title: quiz.title, lessonId: quiz.lessonId, courseId: quiz.courseId, questions },
      lastAttempt,
    });
  } catch (err) {
    console.error('get lesson quiz error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:quizId/attempt', requireRole('student'), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { quizId } = req.params;
    const { answers } = req.body ?? {};

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ message: 'answers object is required' });
    }

    const quizRows = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
    if (quizRows.length === 0) return res.status(404).json({ message: 'Quiz not found' });
    const quiz = quizRows[0];

    const questions = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.position));

    if (questions.length === 0) return res.status(404).json({ message: 'Quiz has no questions' });

    const answersRecord = answers as Record<string, string>;
    for (const q of questions) {
      if (!answersRecord[q.id]) {
        return res.status(400).json({ message: 'Please answer every question before submitting' });
      }
    }

    let score = 0;
    const graded = questions.map((q) => {
      const studentAnswer = answersRecord[q.id] as OptionLetter;
      const isCorrect = studentAnswer === q.correctOption;
      if (isCorrect) score++;
      const correctText =
        q.correctOption === 'a' ? q.optionA : q.correctOption === 'b' ? q.optionB : q.correctOption === 'c' ? q.optionC : q.optionD;
      return {
        questionId: q.id,
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        studentAnswer,
        correctOption: q.correctOption,
        correctText,
        explanation: q.explanation,
        isCorrect,
      };
    });

    const totalQuestions = questions.length;
    const percentage = Math.round((score / totalQuestions) * 100);

    await db.insert(quizAttempts).values({
      quizId: quiz.id,
      studentId,
      lessonId: quiz.lessonId,
      courseId: quiz.courseId,
      answers: JSON.stringify(answersRecord),
      score,
      totalQuestions,
      percentage,
    });

    return res.json({ score, totalQuestions, percentage, questions: graded });
  } catch (err) {
    console.error('submit attempt error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:quizId/attempts', requireRole('student'), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { quizId } = req.params;

    const rows = await db
      .select({
        id: quizAttempts.id,
        score: quizAttempts.score,
        totalQuestions: quizAttempts.totalQuestions,
        percentage: quizAttempts.percentage,
        completedAt: quizAttempts.completedAt,
      })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.studentId, studentId)))
      .orderBy(desc(quizAttempts.completedAt));

    return res.json({ attempts: rows });
  } catch (err) {
    console.error('get attempts error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const examGenerateSchema = z.object({
  courseId: z.string().uuid(),
  questionCount: z.union([z.literal(10), z.literal(20), z.literal(30)]),
  timeLimitMinutes: z.union([z.literal(15), z.literal(30), z.literal(45)]),
});

router.post('/exam/generate', requireRole('student'), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const parsed = examGenerateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid exam parameters', errors: parsed.error.flatten() });
    }
    const { courseId, questionCount, timeLimitMinutes } = parsed.data;

    const enr = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId)))
      .limit(1);
    if (enr.length === 0) return res.status(403).json({ message: 'Not enrolled in this course' });

    const courseRows = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1);
    const courseTitle = courseRows[0]?.title ?? '';

    const pool = await db
      .select({
        id: quizQuestions.id,
        questionText: quizQuestions.questionText,
        optionA: quizQuestions.optionA,
        optionB: quizQuestions.optionB,
        optionC: quizQuestions.optionC,
        optionD: quizQuestions.optionD,
      })
      .from(quizQuestions)
      .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
      .where(eq(quizzes.courseId, courseId));

    const shuffled = pool.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(questionCount, shuffled.length));

    return res.json({
      examId: randomUUID(),
      questions: selected,
      timeLimitMinutes,
      courseTitle,
      totalQuestions: selected.length,
    });
  } catch (err) {
    console.error('exam generate error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const examSubmitSchema = z.object({
  courseId: z.string().uuid(),
  answers: z.record(z.string(), z.string()),
  timeTakenSeconds: z.number().int().min(0),
});

router.post('/exam/submit', requireRole('student'), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const parsed = examSubmitSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid submission', errors: parsed.error.flatten() });
    }
    const { courseId, answers, timeTakenSeconds } = parsed.data;

    const enr = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId)))
      .limit(1);
    if (enr.length === 0) return res.status(403).json({ message: 'Not enrolled in this course' });

    const answerEntries = Object.entries(answers);
    if (answerEntries.length === 0) {
      return res.json({
        score: 0,
        total: 0,
        percentage: 0,
        timeTakenSeconds,
        questions: [],
        weakTopics: null,
      });
    }

    const questionRows = await db
      .select({
        question: quizQuestions,
        quiz: quizzes,
      })
      .from(quizQuestions)
      .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
      .where(inArray(quizQuestions.id, answerEntries.map(([id]) => id)));

    const byQuiz = new Map<string, { quizId: string; lessonId: string; questions: typeof questionRows }>();
    for (const row of questionRows) {
      const key = row.quiz.id;
      if (!byQuiz.has(key)) {
        byQuiz.set(key, { quizId: row.quiz.id, lessonId: row.quiz.lessonId, questions: [] });
      }
      byQuiz.get(key)!.questions.push(row);
    }

    let score = 0;
    const graded = questionRows.map((row) => {
      const q = row.question;
      const studentAnswer = answers[q.id] as OptionLetter;
      const isCorrect = studentAnswer === q.correctOption;
      if (isCorrect) score++;
      const correctText =
        q.correctOption === 'a' ? q.optionA : q.correctOption === 'b' ? q.optionB : q.correctOption === 'c' ? q.optionC : q.optionD;
      return {
        questionId: q.id,
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        studentAnswer,
        correctOption: q.correctOption,
        correctText,
        explanation: q.explanation,
        isCorrect,
      };
    });

    const total = questionRows.length;
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

    for (const group of byQuiz.values()) {
      const groupAnswers: Record<string, string> = {};
      let groupScore = 0;
      for (const row of group.questions) {
        const ans = answers[row.question.id];
        if (ans) groupAnswers[row.question.id] = ans;
        if (ans === row.question.correctOption) groupScore++;
      }
      const groupTotal = group.questions.length;
      await db.insert(quizAttempts).values({
        quizId: group.quizId,
        studentId,
        lessonId: group.lessonId,
        courseId,
        answers: JSON.stringify(groupAnswers),
        score: groupScore,
        totalQuestions: groupTotal,
        percentage: groupTotal > 0 ? Math.round((groupScore / groupTotal) * 100) : 0,
      });
    }

    let weakTopicsResult: { topicSummary: string; recommendations: string; generatedAt: Date } | null = null;
    try {
      const result = await generateWeakTopics(studentId, courseId);
      if (!('error' in result)) weakTopicsResult = result;
    } catch (weakErr) {
      console.warn('weak topic generation failed after exam', weakErr);
    }

    return res.json({ score, total, percentage, timeTakenSeconds, questions: graded, weakTopics: weakTopicsResult });
  } catch (err) {
    console.error('exam submit error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
