import { lessonAccess } from '../lib/access';
import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { eq, and, asc, desc, inArray, isNull, sql } from 'drizzle-orm';
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

const courseRealm = (organizationId: string | null) => organizationId === null
  ? isNull(courses.organizationId)
  : eq(courses.organizationId, organizationId);

async function verifyLessonAccess(lessonId: string, userId: string, role: string, organizationId: string | null): Promise<LessonAccessResult> {
 const access = await lessonAccess(lessonId,userId,role,organizationId);
 return access.allowed && access.lesson ? {allowed:true,lesson:access.lesson} : {allowed:false,status:access.status,message:access.message};
}

export async function generateWeakTopics(
  studentId: string,
  courseId: string,
  organizationId: string | null = null,
) {
  const courseRows = await db.select({ title: courses.title }).from(courses)
    .where(and(eq(courses.id, courseId), courseRealm(organizationId))).limit(1);
  if (courseRows.length === 0) return { error: 'Course not found' };

  const attemptRows = await db
    .select({
      attempt: quizAttempts,
      lessonTitle: lessons.title,
      quizTitle: quizzes.title,
    })
    .from(quizAttempts)
    .innerJoin(lessons, eq(quizAttempts.lessonId, lessons.id))
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .innerJoin(courses, eq(quizAttempts.courseId, courses.id))
    .where(and(
      eq(quizAttempts.studentId, studentId),
      eq(quizAttempts.courseId, courseId),
      eq(quizzes.courseId, courses.id),
      eq(lessons.courseId, courses.id),
      courseRealm(organizationId),
    ))
    .orderBy(desc(quizAttempts.completedAt)).limit(50);

  if (attemptRows.length < 2) {
    return { error: 'Not enough quiz data yet. Complete at least 2 lesson quizzes to get a weak topic analysis.' };
  }

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
      .where(and(
        eq(weakTopics.id, existing[0].id),
        eq(weakTopics.studentId, studentId),
        eq(weakTopics.courseId, courseId),
      ))
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

    const access = await verifyLessonAccess(lessonId, userId, role, req.organization?.id ?? null);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const quizRows = await db.select().from(quizzes).where(and(
      eq(quizzes.lessonId, lessonId),
      eq(quizzes.courseId, access.lesson.courseId),
    )).limit(1);
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

    if (!z.record(z.string().uuid(), z.enum(['a','b','c','d'])).safeParse(answers).success) {
      return res.status(400).json({ message: 'answers object is required' });
    }

    const quizRows = await db.select({ quiz: quizzes })
      .from(quizzes)
      .innerJoin(courses, eq(quizzes.courseId, courses.id))
      .where(and(eq(quizzes.id, quizId), courseRealm(req.organization?.id ?? null)))
      .limit(1);
    if (quizRows.length === 0) return res.status(404).json({ message: 'Quiz not found' });
    const quiz = quizRows[0].quiz;
    const lessonAccess = await verifyLessonAccess(quiz.lessonId, studentId, req.user!.role, req.organization?.id ?? null);
    if (!lessonAccess.allowed || lessonAccess.lesson.courseId !== quiz.courseId) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

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

    const quizRows = await db.select({ quiz: quizzes })
      .from(quizzes)
      .innerJoin(courses, eq(quizzes.courseId, courses.id))
      .where(and(eq(quizzes.id, quizId), courseRealm(req.organization?.id ?? null)))
      .limit(1);
    if (quizRows.length === 0) return res.status(404).json({ message: 'Quiz not found' });
    const lessonAccess = await verifyLessonAccess(
      quizRows[0].quiz.lessonId,
      studentId,
      req.user!.role,
      req.organization?.id ?? null,
    );
    if (!lessonAccess.allowed || lessonAccess.lesson.courseId !== quizRows[0].quiz.courseId) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

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
      .orderBy(desc(quizAttempts.completedAt)).limit(100);

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

    const scopedCourse = await db.select({ id: courses.id }).from(courses)
      .where(and(eq(courses.id, courseId), courseRealm(req.organization?.id ?? null))).limit(1);
    if (scopedCourse.length === 0) return res.status(404).json({ message: 'Course not found' });

    const enr = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId), eq(enrollments.status, 'active')))
      .limit(1);
    if (enr.length === 0) return res.status(403).json({ message: 'Not enrolled in this course' });

    const courseRows = await db.select({ title: courses.title }).from(courses)
      .where(and(eq(courses.id, courseId), courseRealm(req.organization?.id ?? null))).limit(1);
    const courseTitle = courseRows[0]?.title ?? '';

    const generated = await db.transaction(async tx => {
    await tx.select({id:courses.id}).from(courses).where(eq(courses.id,courseId)).for('share');
    const active = await tx.select({id:enrollments.id}).from(enrollments).where(and(eq(enrollments.studentId,studentId),eq(enrollments.courseId,courseId),eq(enrollments.status,'active'))).limit(1);
    if (!active.length) throw Object.assign(new Error('Not enrolled in this course'), {status:403});
    const pool = await tx
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
      .innerJoin(courses, eq(quizzes.courseId, courses.id))
      .where(and(eq(quizzes.courseId, courseId), courseRealm(req.organization?.id ?? null)))
      .orderBy(sql`random()`).limit(questionCount);

    const shuffled = pool.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(questionCount, shuffled.length));

    const examId = randomUUID();
    if (!selected.length) throw Object.assign(new Error('No questions are available.'), {status:422});
    const snapshots = await tx.select({question:quizQuestions,quiz:quizzes}).from(quizQuestions).innerJoin(quizzes,eq(quizQuestions.quizId,quizzes.id)).where(inArray(quizQuestions.id,selected.map(q=>q.id)));
    await tx.execute(sql`INSERT INTO exam_assignments(id,student_id,course_id,questions,expires_at) VALUES(${examId},${studentId},${courseId},${JSON.stringify(snapshots)}::jsonb,now()+${timeLimitMinutes*60}*interval '1 second')`);
    return {selected,examId};
    });
    const {selected,examId} = generated;
    return res.json({
      examId,
      questions: selected,
      timeLimitMinutes,
      courseTitle,
      totalQuestions: selected.length,
    });
  } catch (err) {
    console.error('exam generate error', err);
    if (err instanceof Error && 'status' in err && (err.status===403 || err.status===422)) return res.status(err.status).json({message:err.message});
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const examSubmitSchema = z.object({
  courseId: z.string().uuid(),
  examId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.enum(['a','b','c','d'])),
  timeTakenSeconds: z.number().int().min(0).max(86400),
});

router.post('/exam/submit', requireRole('student'), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const parsed = examSubmitSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid submission', errors: parsed.error.flatten() });
    }
    const { courseId, answers, examId } = parsed.data;

    const scopedCourse = await db.select({ id: courses.id }).from(courses)
      .where(and(eq(courses.id, courseId), courseRealm(req.organization?.id ?? null))).limit(1);
    if (scopedCourse.length === 0) return res.status(404).json({ message: 'Course not found' });

    const enr = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId), eq(enrollments.status, 'active')))
      .limit(1);
    if (enr.length === 0) return res.status(403).json({ message: 'Not enrolled in this course' });

    const assignmentResult = await db.execute(sql`SELECT * FROM exam_assignments WHERE id=${examId} AND student_id=${studentId} AND course_id=${courseId}`);
    const assignment = assignmentResult.rows[0] as {questions:Array<{question:typeof quizQuestions.$inferSelect;quiz:typeof quizzes.$inferSelect}>;started_at:Date;expires_at:Date;result:unknown}|undefined;
    if (!assignment) return res.status(404).json({message:'Exam not found'});
    if (assignment.result) return res.json(assignment.result);
    if (Date.now()>new Date(assignment.expires_at).getTime()+30000) return res.status(409).json({message:'The exam has expired.'});
    const timeTakenSeconds = Math.max(0,Math.floor((Date.now()-new Date(assignment.started_at).getTime())/1000));
    const questionRows = assignment.questions;
    if (Object.keys(answers).some(id=>!questionRows.some(row=>row.question.id===id))) return res.status(400).json({message:'Question does not belong to this exam'});

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

    // AI analysis is a separate bounded operation; grading never waits for a provider.
    const weakTopicsResult = null;

    const result = {score,total,percentage,timeTakenSeconds,questions:graded,weakTopics:weakTopicsResult};
    const saved = await db.transaction(async tx => {
      const [current] = await tx.execute(sql`SELECT result FROM exam_assignments WHERE id=${examId} FOR UPDATE`).then(r=>r.rows);
      if (current.result) return current.result;
      for (const group of byQuiz.values()) {
        // Preserve snapshots in the exam; practice attempts reference only a still-existing quiz.
        const [exists] = await tx.select({id:quizzes.id}).from(quizzes).where(eq(quizzes.id,group.quizId));
        if (!exists) continue;
        const groupAnswers=Object.fromEntries(group.questions.map(row=>[row.question.id,answers[row.question.id]??'']));
        const groupScore=group.questions.filter(row=>answers[row.question.id]===row.question.correctOption).length;
        await tx.insert(quizAttempts).values({quizId:group.quizId,studentId,lessonId:group.lessonId,courseId,answers:JSON.stringify(groupAnswers),score:groupScore,totalQuestions:group.questions.length,percentage:Math.round(groupScore*100/group.questions.length)});
      }
      await tx.execute(sql`UPDATE exam_assignments SET submitted_at=now(),result=${JSON.stringify(result)}::jsonb WHERE id=${examId}`);
      return result;
    });
    return res.json(saved);
  } catch (err) {
    console.error('exam submit error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
