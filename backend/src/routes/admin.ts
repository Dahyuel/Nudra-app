import { Router, Request, Response } from 'express';
import { sql, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { users, instructorApplications } from '../db/schema';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import { reviewInstructorApplication } from '../lib/instructorReview';

const router = Router();

router.use(requireAuth, requireRole('admin'));

// pg returns COUNT/SUM/AVG/numeric as strings (or null on empty sets).
const num = (value: unknown, digits?: number) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return digits === undefined ? n : Number(n.toFixed(digits));
};

const MONTHS = 6;

function lastMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

router.get('/stats/overview', async (_req: Request, res: Response) => {
  try {
    const [usersRow, coursesRow, enrollRow, activityRow, monthlyEnroll, monthlyUsers] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE role = 'student')                                        AS students,
          COUNT(*) FILTER (WHERE role = 'instructor'
                             AND (instructor_status IS NULL OR instructor_status = 'approved')) AS instructors,
          COUNT(*) FILTER (WHERE role = 'instructor' AND instructor_status = 'pending')    AS pending_applications,
          COUNT(*) FILTER (WHERE role = 'admin')                                          AS admins,
          COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')                AS new_users_30d
        FROM users
      `),
      db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM courses)                                  AS total_courses,
          (SELECT COUNT(*) FROM courses WHERE is_published)               AS published_courses,
          (SELECT COUNT(*) FROM lessons)                                  AS total_lessons,
          (SELECT COUNT(*) FROM lessons WHERE video_url IS NOT NULL)      AS lessons_with_video
      `),
      db.execute(sql`
        SELECT
          COUNT(*)                                       AS total_enrollments,
          COUNT(*) FILTER (WHERE e.progress >= 100)      AS completed_enrollments,
          AVG(e.progress)                                AS avg_progress,
          COALESCE(SUM(c.price), 0)                      AS enrollment_value
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
      `),
      db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM quiz_attempts)            AS quiz_attempts,
          (SELECT AVG(percentage) FROM quiz_attempts)     AS avg_quiz_score,
          (SELECT COUNT(*) FROM community_posts)          AS community_posts,
          (SELECT COUNT(*) FROM community_replies)        AS community_replies,
          (SELECT COUNT(*) FROM certificates)             AS certificates
      `),
      db.execute(sql`
        SELECT to_char(date_trunc('month', enrolled_at), 'YYYY-MM') AS month, COUNT(*) AS count
        FROM enrollments
        WHERE enrolled_at >= date_trunc('month', now()) - interval '5 months'
        GROUP BY 1
      `),
      db.execute(sql`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
        FROM users
        WHERE created_at >= date_trunc('month', now()) - interval '5 months'
        GROUP BY 1
      `),
    ]);

    const u = usersRow.rows[0] as Record<string, unknown>;
    const c = coursesRow.rows[0] as Record<string, unknown>;
    const e = enrollRow.rows[0] as Record<string, unknown>;
    const a = activityRow.rows[0] as Record<string, unknown>;

    const toMap = (rows: unknown[]) =>
      new Map((rows as { month: string; count: string }[]).map((r) => [r.month, num(r.count)]));
    const enrollByMonth = toMap(monthlyEnroll.rows);
    const usersByMonth = toMap(monthlyUsers.rows);

    const totalEnrollments = num(e.total_enrollments);
    const completed = num(e.completed_enrollments);

    return res.json({
      users: {
        students: num(u.students),
        instructors: num(u.instructors),
        pendingApplications: num(u.pending_applications),
        admins: num(u.admins),
        newLast30Days: num(u.new_users_30d),
      },
      courses: {
        total: num(c.total_courses),
        published: num(c.published_courses),
        drafts: num(c.total_courses) - num(c.published_courses),
        lessons: num(c.total_lessons),
        lessonsWithVideo: num(c.lessons_with_video),
      },
      enrollments: {
        total: totalEnrollments,
        completed,
        completionRate: totalEnrollments ? num((completed / totalEnrollments) * 100, 1) : 0,
        avgProgress: num(e.avg_progress, 1),
        // No payment system yet: this is the list-price value of all enrollments.
        enrollmentValue: num(e.enrollment_value, 2),
      },
      activity: {
        quizAttempts: num(a.quiz_attempts),
        avgQuizScore: num(a.avg_quiz_score, 1),
        communityPosts: num(a.community_posts),
        communityReplies: num(a.community_replies),
        certificates: num(a.certificates),
      },
      monthly: lastMonthKeys(MONTHS).map((key) => ({
        month: key,
        enrollments: enrollByMonth.get(key) ?? 0,
        newUsers: usersByMonth.get(key) ?? 0,
      })),
    });
  } catch (err) {
    console.error('admin overview error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/stats/courses', async (_req: Request, res: Response) => {
  try {
    // Each aggregate is computed in its own subquery so the joins can't multiply rows.
    const result = await db.execute(sql`
      SELECT
        c.id,
        c.title,
        c.category,
        c.is_published,
        c.price,
        c.created_at,
        u.name                                      AS instructor_name,
        COALESCE(l.lessons, 0)                      AS lessons,
        COALESCE(l.lessons_with_video, 0)           AS lessons_with_video,
        COALESCE(en.enrollments, 0)                 AS enrollments,
        COALESCE(en.completed, 0)                   AS completed,
        en.avg_progress,
        rv.avg_rating,
        COALESCE(rv.reviews, 0)                     AS reviews,
        COALESCE(qa.attempts, 0)                    AS quiz_attempts,
        qa.avg_score                                AS avg_quiz_score
      FROM courses c
      JOIN users u ON u.id = c.instructor_id
      LEFT JOIN (
        SELECT course_id, COUNT(*) AS lessons, COUNT(*) FILTER (WHERE video_url IS NOT NULL) AS lessons_with_video
        FROM lessons GROUP BY course_id
      ) l ON l.course_id = c.id
      LEFT JOIN (
        SELECT course_id, COUNT(*) AS enrollments, COUNT(*) FILTER (WHERE progress >= 100) AS completed,
               AVG(progress) AS avg_progress
        FROM enrollments GROUP BY course_id
      ) en ON en.course_id = c.id
      LEFT JOIN (
        SELECT course_id, AVG(rating) AS avg_rating, COUNT(*) AS reviews FROM course_reviews GROUP BY course_id
      ) rv ON rv.course_id = c.id
      LEFT JOIN (
        SELECT course_id, COUNT(*) AS attempts, AVG(percentage) AS avg_score FROM quiz_attempts GROUP BY course_id
      ) qa ON qa.course_id = c.id
      ORDER BY COALESCE(en.enrollments, 0) DESC, c.created_at DESC
    `);

    const courses = (result.rows as Record<string, unknown>[]).map((r) => {
      const enrollments = num(r.enrollments);
      const price = num(r.price, 2);
      return {
        id: r.id as string,
        title: r.title as string,
        category: r.category as string,
        isPublished: Boolean(r.is_published),
        instructorName: r.instructor_name as string,
        price,
        lessons: num(r.lessons),
        lessonsWithVideo: num(r.lessons_with_video),
        enrollments,
        completed: num(r.completed),
        avgProgress: num(r.avg_progress, 1),
        enrollmentValue: num(enrollments * price, 2),
        avgRating: r.avg_rating === null ? null : num(r.avg_rating, 1),
        reviews: num(r.reviews),
        quizAttempts: num(r.quiz_attempts),
        avgQuizScore: r.avg_quiz_score === null ? null : num(r.avg_quiz_score, 1),
        createdAt: r.created_at,
      };
    });

    return res.json({ courses });
  } catch (err) {
    console.error('admin course stats error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const statusFilter = z.enum(['pending', 'approved', 'rejected', 'all']).default('pending');

router.get('/instructor-applications', async (req: Request, res: Response) => {
  try {
    const parsed = statusFilter.safeParse(req.query.status ?? undefined);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid status filter' });
    const status = parsed.data;

    const rows = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        subjects: instructorApplications.subjects,
        experienceYears: instructorApplications.experienceYears,
        bio: instructorApplications.bio,
        portfolioUrl: instructorApplications.portfolioUrl,
        status: instructorApplications.status,
        reviewNote: instructorApplications.reviewNote,
        createdAt: instructorApplications.createdAt,
        reviewedAt: instructorApplications.reviewedAt,
      })
      .from(instructorApplications)
      .innerJoin(users, eq(instructorApplications.userId, users.id))
      .where(status === 'all' ? undefined : eq(instructorApplications.status, status))
      .orderBy(desc(instructorApplications.createdAt));

    return res.json({ applications: rows });
  } catch (err) {
    console.error('admin list applications error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const userIdParam = z.string().uuid();
const rejectBody = z.object({ note: z.string().trim().max(1000).optional() });

router.post('/instructor-applications/:userId/approve', async (req: Request, res: Response) => {
  try {
    const userId = userIdParam.safeParse(req.params.userId);
    if (!userId.success) return res.status(400).json({ message: 'Invalid user id' });

    const result = await reviewInstructorApplication(userId.data, 'approved', null);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    return res.json({ message: 'Application approved', status: result.decision });
  } catch (err) {
    console.error('admin approve error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/instructor-applications/:userId/reject', async (req: Request, res: Response) => {
  try {
    const userId = userIdParam.safeParse(req.params.userId);
    if (!userId.success) return res.status(400).json({ message: 'Invalid user id' });
    const body = rejectBody.safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ message: 'Note must be 1000 characters or fewer' });

    const result = await reviewInstructorApplication(userId.data, 'rejected', body.data.note || null);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    return res.json({ message: 'Application rejected', status: result.decision });
  } catch (err) {
    console.error('admin reject error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
