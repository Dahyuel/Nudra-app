import { Router, Request, Response } from 'express';
import { eq, and, sql, count, avg, inArray, desc, type SQL } from 'drizzle-orm';
import { db } from '../db';
import {
  courses,
  users,
  lessons,
  enrollments,
  courseReviews,
  sanaweyaProfiles,
  pastExams,
  pastExamAttempts,
  subjectCommunities,
  communityPosts,
} from '../db/schema';
import { requireAuth, requireRole } from '../middleware/requireAuth';

const router = Router();

const GRADE_LABELS: Record<string, string> = {
  year1: 'سنة أولى ثانوي',
  year2: 'سنة ثانية ثانوي',
  year3: 'سنة ثالثة ثانوي',
};

const VALID_GRADES = ['year1', 'year2', 'year3'];

async function buildCourseList(
  rows: { course: typeof courses.$inferSelect; instructorName: string; instructorAvatar: string | null }[]
) {
  const ids = rows.map((r) => r.course.id);
  const ratingMap = new Map<string, { avg: number; count: number }>();
  const studentMap = new Map<string, number>();
  const lessonMap = new Map<string, number>();

  if (ids.length > 0) {
    const ratings = await db
      .select({
        courseId: courseReviews.courseId,
        avg: avg(courseReviews.rating),
        count: count(courseReviews.id),
      })
      .from(courseReviews)
      .where(inArray(courseReviews.courseId, ids))
      .groupBy(courseReviews.courseId);
    for (const r of ratings) {
      ratingMap.set(r.courseId, { avg: Number(r.avg) | 0, count: Number(r.count) | 0 });
    }

    const students = await db
      .select({ courseId: enrollments.courseId, count: count(enrollments.id) })
      .from(enrollments)
      .where(inArray(enrollments.courseId, ids))
      .groupBy(enrollments.courseId);
    for (const s of students) studentMap.set(s.courseId, Number(s.count) | 0);

    const lessonCounts = await db
      .select({ courseId: lessons.courseId, count: count(lessons.id) })
      .from(lessons)
      .where(inArray(lessons.courseId, ids))
      .groupBy(lessons.courseId);
    for (const l of lessonCounts) lessonMap.set(l.courseId, Number(l.count) | 0);
  }

  return rows.map((r) => {
    const rating = ratingMap.get(r.course.id);
    return {
      id: r.course.id,
      title: r.course.title,
      titleAr: r.course.titleAr,
      subtitle: r.course.subtitle,
      description: r.course.description,
      thumbnail: r.course.thumbnailUrl,
      category: r.course.category,
      level: r.course.level,
      price: Number(r.course.price),
      originalPrice: r.course.originalPrice ? Number(r.course.originalPrice) : null,
      duration: r.course.durationText,
      isPublished: r.course.isPublished,
      sanaweyaGrade: r.course.sanaweyaGrade,
      sanaweyaSubject: r.course.sanaweyaSubject,
      ministryAligned: r.course.ministryAligned,
      instructor: {
        name: r.instructorName,
        avatar: r.instructorAvatar,
      },
      rating: rating ? Number(rating.avg.toFixed(2)) : 0,
      ratingCount: rating?.count ?? 0,
      studentsCount: studentMap.get(r.course.id) ?? 0,
      lessonsCount: lessonMap.get(r.course.id) ?? 0,
    };
  });
}

router.get('/profile', requireAuth, requireRole('student'), async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(sanaweyaProfiles)
      .where(eq(sanaweyaProfiles.userId, req.user!.id))
      .limit(1);

    return res.json({ profile: rows[0] ?? null });
  } catch (err) {
    console.error('sanaweya profile get error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/profile', requireAuth, requireRole('student'), async (req: Request, res: Response) => {
  try {
    const { grade, track, schoolName, governorate } = req.body ?? {};

    if (!(grade && VALID_GRADES.includes(grade))) {
      return res.status(400).json({ message: 'Invalid grade' });
    }

    const existing = await db
      .select()
      .from(sanaweyaProfiles)
      .where(eq(sanaweyaProfiles.userId, req.user!.id))
      .limit(1);

    let profile: typeof sanaweyaProfiles.$inferSelect;

    if (existing.length > 0) {
      const updated = await db
        .update(sanaweyaProfiles)
        .set({
          grade,
          track: track ?? null,
          schoolName: schoolName ?? null,
          governorate: governorate ?? null,
          updatedAt: new Date(),
        })
        .where(eq(sanaweyaProfiles.userId, req.user!.id))
        .returning();
      profile = updated[0];
    } else {
      const inserted = await db
        .insert(sanaweyaProfiles)
        .values({
          userId: req.user!.id,
          grade,
          track: track ?? null,
          schoolName: schoolName ?? null,
          governorate: governorate ?? null,
        })
        .returning();
      profile = inserted[0];
    }

    await db
      .update(users)
      .set({ grade: GRADE_LABELS[grade], updatedAt: new Date() })
      .where(eq(users.id, req.user!.id));

    return res.json({ profile });
  } catch (err) {
    console.error('sanaweya profile upsert error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/courses', async (req: Request, res: Response) => {
  try {
    const grade = (req.query.grade as string) ?? '';
    const subject = (req.query.subject as string) ?? '';
    const search = (req.query.search as string) ?? '';
    const price = (req.query.price as string) ?? '';
    const ministryAligned = req.query.ministryAligned === 'true';
    // `Number(undefined) ?? 1` is NaN (?? doesn't catch NaN), which made the
    // query return nothing when no page/limit was sent. Clamp limit too.
    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(courses.isPublished, true), sql`${courses.sanaweyaGrade} is not null`];
    if (grade) conditions.push(sql`${courses.sanaweyaGrade} = ${grade}`);
    if (subject) conditions.push(sql`${courses.sanaweyaSubject} = ${subject}`);
    if (search) conditions.push(sql`${courses.title} ilike ${'%' + search + '%'}`);
    if (price === 'free') conditions.push(sql`${courses.price} = 0`);
    if (price === 'paid') conditions.push(sql`${courses.price} > 0`);
    if (ministryAligned) conditions.push(sql`${courses.ministryAligned} = true`);

    const rows = await db
      .select({
        course: courses,
        instructorName: users.name,
        instructorAvatar: users.avatarUrl,
      })
      .from(courses)
      .innerJoin(users, eq(courses.instructorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(courses.ministryAligned))
      .limit(limit)
      .offset(offset);

    const result = await buildCourseList(rows);
    return res.json({ courses: result, page, limit });
  } catch (err) {
    console.error('sanaweya courses error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/past-exams', async (req: Request, res: Response) => {
  try {
    const grade = (req.query.grade as string) ?? '';
    const subject = (req.query.subject as string) ?? '';
    const year = (req.query.year as string) ?? '';
    const session = (req.query.session as string) ?? '';

    const conditions: SQL[] = [eq(pastExams.isPublished, true)];
    if (grade) conditions.push(sql`${pastExams.grade} = ${grade}`);
    if (subject) conditions.push(sql`${pastExams.subject} = ${subject}`);
    if (year) conditions.push(eq(pastExams.year, Number(year)));
    if (session) conditions.push(sql`${pastExams.session} = ${session}`);

    const rows = await db
      .select()
      .from(pastExams)
      .where(and(...conditions))
      .orderBy(desc(pastExams.year), desc(pastExams.session));

    return res.json({ exams: rows });
  } catch (err) {
    console.error('sanaweya past exams error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/past-exams/:examId', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(pastExams)
      .where(and(eq(pastExams.id, req.params.examId), eq(pastExams.isPublished, true)))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    return res.json({ exam: rows[0] });
  } catch (err) {
    console.error('sanaweya past exam get error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/past-exams/:examId/start',
  requireAuth,
  requireRole('student'),
  async (req: Request, res: Response) => {
    try {
      const { examId } = req.params;

      const exam = await db
        .select()
        .from(pastExams)
        .where(and(eq(pastExams.id, examId), eq(pastExams.isPublished, true)))
        .limit(1);

      if (exam.length === 0) {
        return res.status(404).json({ message: 'Exam not found' });
      }

      const existing = await db
        .select()
        .from(pastExamAttempts)
        .where(and(eq(pastExamAttempts.studentId, req.user!.id), eq(pastExamAttempts.examId, examId)))
        .limit(1);

      if (existing.length > 0) {
        return res.json({ attemptId: existing[0].id });
      }

      const inserted = await db
        .insert(pastExamAttempts)
        .values({ studentId: req.user!.id, examId })
        .returning();

      return res.json({ attemptId: inserted[0].id });
    } catch (err) {
      console.error('sanaweya start exam error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.get('/subject-communities/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ message: 'Invalid subject community' });
    }
    const rows = await db.select().from(subjectCommunities).where(eq(subjectCommunities.id, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ message: 'Subject community not found' });
    const postCount = await db
      .select({ count: count(communityPosts.id) })
      .from(communityPosts)
      .where(eq(communityPosts.subjectCommunityId, id));
    return res.json({ community: { ...rows[0], postCount: Number(postCount[0]?.count) || 0 } });
  } catch (err) {
    console.error('sanaweya subject community error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/subject-communities', async (req: Request, res: Response) => {
  try {
    const grade = (req.query.grade as string) ?? '';

    const rows = grade
      ? await db.select().from(subjectCommunities).where(sql`${subjectCommunities.grade} = ${grade}`)
      : await db.select().from(subjectCommunities);

    const result = await Promise.all(
      rows.map(async (community) => {
        const postCount = await db
          .select({ count: count(communityPosts.id) })
          .from(communityPosts)
          .where(eq(communityPosts.subjectCommunityId, community.id));
        return {
          ...community,
          postCount: Number(postCount[0]?.count) || 0,
        };
      })
    );

    return res.json({ communities: result });
  } catch (err) {
    console.error('sanaweya subject communities error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/dashboard', requireAuth, requireRole('student'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const profileRows = await db
      .select()
      .from(sanaweyaProfiles)
      .where(eq(sanaweyaProfiles.userId, userId))
      .limit(1);
    const profile = profileRows[0] ?? null;

    const enrolledRows = await db
      .select({
        course: courses,
        instructorName: users.name,
        instructorAvatar: users.avatarUrl,
        progress: enrollments.progress,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .innerJoin(users, eq(courses.instructorId, users.id))
      .where(and(eq(enrollments.studentId, userId), sql`${courses.sanaweyaGrade} is not null`));

    const enrolledSanaweyaCourses = await Promise.all(
      enrolledRows.map(async (r) => {
        const built = await buildCourseList([
          { course: r.course, instructorName: r.instructorName, instructorAvatar: r.instructorAvatar },
        ]);
        return { ...built[0], progress: r.progress };
      })
    );

    const recentAttemptRows = await db
      .select({ attempt: pastExamAttempts, exam: pastExams })
      .from(pastExamAttempts)
      .innerJoin(pastExams, eq(pastExamAttempts.examId, pastExams.id))
      .where(eq(pastExamAttempts.studentId, userId))
      .orderBy(desc(pastExamAttempts.startedAt))
      .limit(3);

    const recentExams = recentAttemptRows.map((r) => ({
      attemptId: r.attempt.id,
      startedAt: r.attempt.startedAt,
      completedAt: r.attempt.completedAt,
      score: r.attempt.score,
      exam: r.exam,
    }));

    const grade = profile?.grade ?? '';
    const communities = grade
      ? await db.select().from(subjectCommunities).where(sql`${subjectCommunities.grade} = ${grade}`)
      : [];

    const subjectCommunitiesWithCount = await Promise.all(
      communities.map(async (community) => {
        const postCount = await db
          .select({ count: count(communityPosts.id) })
          .from(communityPosts)
          .where(eq(communityPosts.subjectCommunityId, community.id));
        return { ...community, postCount: Number(postCount[0]?.count) || 0 };
      })
    );

    let upcomingExamCount = 0;
    if (grade) {
      const examCount = await db
        .select({ count: count(pastExams.id) })
        .from(pastExams)
        .where(and(sql`${pastExams.grade} = ${grade}`, eq(pastExams.isPublished, true)));
      upcomingExamCount = Number(examCount[0]?.count) | 0;
    }

    return res.json({
      profile,
      enrolledSanaweyaCourses,
      recentExams,
      subjectCommunities: subjectCommunitiesWithCount,
      upcomingExamCount,
    });
  } catch (err) {
    console.error('sanaweya dashboard error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
