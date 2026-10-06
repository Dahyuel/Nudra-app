import { Router, Request, Response } from 'express';
import { eq, and, ilike, sql, count, avg, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import {
  courses,
  users,
  lessons,
  courseSections,
  enrollments,
  courseReviews,
  lessonResources,
  orgMemberships,
} from '../db/schema';
import { isUserAllowedInOrganization, requireAuth, requireRole } from '../middleware/requireAuth';
import { enrollStudent } from '../lib/enrollment';

const router = Router();

async function getOptionalUserId(req: Request): Promise<string | null> {
  const sessionId = req.cookies?.session_id;
  if (!sessionId) return null;
  const rows = await db.execute(
    sql`select user_id from sessions where id = ${sessionId} and expires_at > now() limit 1`
  );
  const row = rows.rows[0] as { user_id?: string } | undefined;
  return row?.user_id ?? null;
}

async function courseBelongsToRequestScope(req: Request, userId: string, courseId: string): Promise<boolean> {
  const [course] = await db.select({ organizationId: courses.organizationId }).from(courses)
    .where(eq(courses.id, courseId)).limit(1);
    if (!course || (req.organization ? course.organizationId !== req.organization.id : course.organizationId !== null)) return false;
  if (!req.organization) return true;
  const [membership] = await db.select({ id: orgMemberships.id }).from(orgMemberships).where(and(
    eq(orgMemberships.orgId, req.organization.id), eq(orgMemberships.userId, userId), eq(orgMemberships.status, 'active')
  )).limit(1);
  return Boolean(membership);
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const category = (req.query.category as string) || '';
    const level = (req.query.level as string) || '';
    const price = (req.query.price as string) || '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const currentUserId = await getOptionalUserId(req);
    if (req.organization && !currentUserId) return res.status(401).json({ message: 'Sign in to access this organization.' });
    if (currentUserId) {
      const [user] = await db.select({ id: users.id, role: users.role, organizationId: users.organizationId })
        .from(users).where(eq(users.id, currentUserId)).limit(1);
      if (!user || !(await isUserAllowedInOrganization(user, req.organization))) {
        return res.status(403).json({ message: 'This account cannot access this realm.' });
      }
    }

    const conditions = [eq(courses.isPublished, true), eq(courses.approvalStatus, 'approved')];
    conditions.push(req.organization ? eq(courses.organizationId, req.organization.id) : isNull(courses.organizationId));
    conditions.push(req.organization ? eq(users.organizationId, req.organization.id) : isNull(users.organizationId));
    if (search) conditions.push(ilike(courses.title, `%${search}%`));
    if (category) conditions.push(eq(courses.category, category));
    if (level) conditions.push(eq(courses.level, level));
    if (price === 'free') conditions.push(eq(courses.price, '0'));
    if (price === 'paid') conditions.push(sql`${courses.price} > 0`);

    const rows = await db
      .select({
        course: courses,
        instructorName: users.name,
        instructorAvatar: users.avatarUrl,
      })
      .from(courses)
      .innerJoin(users, eq(courses.instructorId, users.id))
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

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
        ratingMap.set(r.courseId, { avg: Number(r.avg) || 0, count: Number(r.count) || 0 });
      }

      const students = await db
        .select({ courseId: enrollments.courseId, count: count(enrollments.id) })
        .from(enrollments)
        .where(inArray(enrollments.courseId, ids))
        .groupBy(enrollments.courseId);
      for (const s of students) studentMap.set(s.courseId, Number(s.count) || 0);

      const lessonCounts = await db
        .select({ courseId: lessons.courseId, count: count(lessons.id) })
        .from(lessons)
        .where(inArray(lessons.courseId, ids))
        .groupBy(lessons.courseId);
      for (const l of lessonCounts) lessonMap.set(l.courseId, Number(l.count) || 0);
    }

    const result = rows.map((r) => {
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
        deliveryMode: r.course.deliveryMode,
        location: r.course.location,
        bookingUrl: r.course.bookingUrl,
        scheduleText: r.course.scheduleText,
        capacity: r.course.capacity,
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

    return res.json({ courses: result, page, limit });
  } catch (err) {
    console.error('courses list error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = await getOptionalUserId(req);
    if (req.organization && !currentUserId) return res.status(401).json({ message: 'Sign in to access this organization.' });
    if (currentUserId) {
      const [user] = await db.select({ id: users.id, role: users.role, organizationId: users.organizationId })
        .from(users).where(eq(users.id, currentUserId)).limit(1);
      if (!user || !(await isUserAllowedInOrganization(user, req.organization))) {
        return res.status(403).json({ message: 'This account cannot access this realm.' });
      }
    }

    const rows = await db
      .select({
        course: courses,
        instructorName: users.name,
        instructorAvatar: users.avatarUrl,
      })
      .from(courses)
      .innerJoin(users, eq(courses.instructorId, users.id))
      .where(and(
        eq(courses.id, id), eq(courses.approvalStatus, 'approved'),
        req.organization ? eq(courses.organizationId, req.organization.id) : isNull(courses.organizationId),
        req.organization ? eq(users.organizationId, req.organization.id) : isNull(users.organizationId),
      ))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const row = rows[0];
    const course = row.course;

    if (course.approvalStatus !== 'approved' && currentUserId !== course.instructorId) return res.status(404).json({ message: 'Course not found' });

    const isInstructor = currentUserId === course.instructorId;

    // Unpublished (draft or taken down) courses stay visible to their instructor
    // and to students already enrolled, so unpublishing never locks learners out.
    if (!course.isPublished && !isInstructor) {
      const enrolledRows = currentUserId
        ? await db
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(and(eq(enrollments.studentId, currentUserId), eq(enrollments.courseId, course.id)))
            .limit(1)
        : [];
      if (enrolledRows.length === 0) {
        return res.status(404).json({ message: 'Course not found' });
      }
    }
    let isEnrolled = false;
    let enrollmentRow: typeof enrollments.$inferSelect | undefined;
    if (currentUserId) {
      const enr = await db
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.studentId, currentUserId), eq(enrollments.courseId, id)))
        .limit(1);
      if (enr.length > 0) {
        isEnrolled = true;
        enrollmentRow = enr[0];
      }
    }

    const sectionRows = await db
      .select()
      .from(courseSections)
      .where(eq(courseSections.courseId, id))
      .orderBy(courseSections.position);

    const lessonRows = await db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, id))
      .orderBy(lessons.position);

    const curriculum = sectionRows.map((section) => ({
      id: section.id,
      title: section.title,
      position: section.position,
      lessons: lessonRows
        .filter((l) => l.sectionId === section.id)
        .map((l) => {
          const canViewVideo = l.isFree || isEnrolled || isInstructor;
          return {
            id: l.id,
            title: l.title,
            duration: l.durationText,
            isFree: l.isFree,
            position: l.position,
            videoUrl: canViewVideo && l.videoUrl ? `/api/videos/${l.id}/playlist.m3u8` : null,
            isLocked: !canViewVideo,
          };
        }),
    }));

    const reviewRows = await db
      .select({
        review: courseReviews,
        studentName: users.name,
        studentAvatar: users.avatarUrl,
      })
      .from(courseReviews)
      .innerJoin(users, eq(courseReviews.studentId, users.id))
      .where(eq(courseReviews.courseId, id))
      .orderBy(sql`${courseReviews.createdAt} desc`);

    const ratingAgg = await db
      .select({ avg: avg(courseReviews.rating), count: count(courseReviews.id) })
      .from(courseReviews)
      .where(eq(courseReviews.courseId, id));

    const studentsAgg = await db
      .select({ count: count(enrollments.id) })
      .from(enrollments)
      .where(eq(enrollments.courseId, id));

    const ratingBreakdown: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const r of reviewRows) {
      ratingBreakdown[String(r.review.rating)] = (ratingBreakdown[String(r.review.rating)] || 0) + 1;
    }

    return res.json({
      course: {
        id: course.id,
        title: course.title,
        titleAr: course.titleAr,
        subtitle: course.subtitle,
        description: course.description,
        thumbnail: course.thumbnailUrl,
        category: course.category,
        level: course.level,
        deliveryMode: course.deliveryMode,
        location: course.location,
        bookingUrl: course.bookingUrl,
        scheduleText: course.scheduleText,
        price: Number(course.price),
        originalPrice: course.originalPrice ? Number(course.originalPrice) : null,
        duration: course.durationText,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        instructor: {
          id: course.instructorId,
          name: row.instructorName,
          avatar: row.instructorAvatar,
        },
        rating: Number(Number(ratingAgg[0]?.avg || 0).toFixed(2)),
        ratingCount: Number(ratingAgg[0]?.count || 0),
        studentsCount: Number(studentsAgg[0]?.count || 0),
        lessonsCount: lessonRows.length,
        curriculum,
        reviews: reviewRows.map((r) => ({
          id: r.review.id,
          author: r.studentName,
          avatar: r.studentAvatar,
          rating: r.review.rating,
          comment: r.review.comment,
          date: r.review.createdAt,
        })),
        // Counts per star (1-5); the client turns them into percentages.
        ratingBreakdown,
        my_review: (() => {
          const mine = currentUserId ? reviewRows.find((r) => r.review.studentId === currentUserId) : undefined;
          return mine ? { rating: mine.review.rating, comment: mine.review.comment } : null;
        })(),
        is_enrolled: isEnrolled,
        progress: enrollmentRow?.progress ?? 0,
        last_lesson_id: enrollmentRow?.lastLessonId ?? null,
      },
    });
  } catch (err) {
    console.error('course detail error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

// Create or update the current student's review (one per student per course).
router.post('/:id/reviews', requireAuth, async (req: Request, res: Response) => {
  try {
    const courseId = z.string().uuid().safeParse(req.params.id);
    if (!courseId.success) return res.status(400).json({ message: 'Invalid course id' });
    const parsed = reviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Please choose a rating from 1 to 5 stars (comment up to 1000 characters).' });
    }

    const studentId = req.user!.id;
    if (!(await courseBelongsToRequestScope(req, studentId, courseId.data))) {
      return res.status(404).json({ message: 'Course not found' });
    }
    const enrollment = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId.data)))
      .limit(1);
    if (enrollment.length === 0) {
      return res.status(403).json({ message: 'Only students enrolled in this course can review it.' });
    }

    const comment = parsed.data.comment || null;
    const [review] = await db
      .insert(courseReviews)
      .values({ studentId, courseId: courseId.data, rating: parsed.data.rating, comment })
      .onConflictDoUpdate({
        target: [courseReviews.studentId, courseReviews.courseId],
        set: { rating: parsed.data.rating, comment },
      })
      .returning();

    return res.json({ review: { rating: review.rating, comment: review.comment } });
  } catch (err) {
    console.error('course review error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:id/enroll', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsedCourseId = z.string().uuid().safeParse(req.params.id);
    if (!parsedCourseId.success) return res.status(400).json({ message: 'Invalid course id' });
    const id = parsedCourseId.data;
    const studentId = req.user!.id;

    if (!(await courseBelongsToRequestScope(req, studentId, id))) return res.status(404).json({ message: 'Course not found' });
    const courseRows = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
    // Drafts and unpublished courses can't take new enrollments.
    if (courseRows.length === 0 || !courseRows[0].isPublished || courseRows[0].approvalStatus !== 'approved') {
      return res.status(404).json({ message: 'Course not found' });
    }

    const course = courseRows[0];
    if (course.deliveryMode === 'offline') {
      return res.status(400).json({ message: 'Offline courses are booking only and cannot be enrolled in online.' });
    }

    const existing = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, id)))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Already enrolled' });
    }

    // Paid courses are only enrolled through a confirmed payment (POST /api/payments/checkout).
    if (Number(course.price) > 0) {
      return res.status(402).json({ error: 'Payment required', message: 'This course must be purchased first.' });
    }

    const { enrollment } = await enrollStudent(studentId, course);
    if (!enrollment) return res.status(409).json({ message: 'Already enrolled' });
    return res.status(201).json({ enrollment });
  } catch (err) {
    console.error('enroll error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export async function myCoursesHandler(req: Request, res: Response) {
  try {
    const studentId = req.user!.id;

    const rows = await db
      .select({
        enrollment: enrollments,
        course: courses,
        instructorName: users.name,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .innerJoin(users, eq(courses.instructorId, users.id))
      .where(eq(enrollments.studentId, studentId))
      .orderBy(sql`${enrollments.enrolledAt} desc`);

    const ids = rows.map((r) => r.course.id);

    const lessonMap = new Map<string, number>();
    if (ids.length > 0) {
      const lessonCounts = await db
        .select({ courseId: lessons.courseId, count: count(lessons.id) })
        .from(lessons)
        .where(inArray(lessons.courseId, ids))
        .groupBy(lessons.courseId);
      for (const l of lessonCounts) lessonMap.set(l.courseId, Number(l.count) || 0);
    }

    const result = rows.map((r) => ({
      id: r.course.id,
      title: r.course.title,
      titleAr: r.course.titleAr,
      subtitle: r.course.subtitle,
      thumbnail: r.course.thumbnailUrl,
      category: r.course.category,
      level: r.course.level,
      price: Number(r.course.price),
      duration: r.course.durationText,
      instructor: { name: r.instructorName },
      progress: r.enrollment.progress,
      lastLessonId: r.enrollment.lastLessonId,
      enrolledAt: r.enrollment.enrolledAt,
      lessonsCount: lessonMap.get(r.course.id) ?? 0,
    }));

    return res.json({ enrollments: result });
  } catch (err) {
    console.error('my-courses error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

router.get(
  '/:courseId/lessons/:lessonId/resources',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { courseId, lessonId } = req.params;
      const userId = req.user!.id;

      if (!(await courseBelongsToRequestScope(req, userId, courseId))) return res.status(404).json({ message: 'Course not found' });

      const lessonRows = await db
        .select()
        .from(lessons)
        .where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId)))
        .limit(1);

      if (lessonRows.length === 0) {
        return res.status(404).json({ message: 'Lesson not found' });
      }

      const lesson = lessonRows[0];

      if (!lesson.isFree) {
        const enr = await db
          .select()
          .from(enrollments)
          .where(and(eq(enrollments.studentId, userId), eq(enrollments.courseId, courseId)))
          .limit(1);
        if (enr.length === 0) {
          return res.status(403).json({ message: 'Not enrolled in this course' });
        }
      }

      const rows = await db
        .select()
        .from(lessonResources)
        .where(eq(lessonResources.lessonId, lessonId))
        .orderBy(lessonResources.createdAt);

      const resources = rows.map((r) => ({
        id: r.id,
        title: r.title,
        filename: r.filename,
        file_url: r.fileUrl,
        file_format: r.fileFormat,
        file_size_text: r.fileSizeText,
      }));

      return res.json({ resources });
    } catch (err) {
      console.error('lesson resources error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.get('/my-courses/list', requireAuth, myCoursesHandler);

export default router;
