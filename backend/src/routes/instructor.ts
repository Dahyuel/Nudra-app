import { Router, Request, Response } from 'express';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { eq, and, count, avg, sum, inArray, sql, desc, isNull, gt, lt } from 'drizzle-orm';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  type ListPartsCommandOutput,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { db } from '../db';
import {
  courses,
  courseSections,
  lessons,
  enrollments,
  courseReviews,
  videoJobs,
  videoUploadSessions,
  quizzes,
  quizQuestions,
  quizAttempts,
  lessonChunks,
  users,
  communityPosts,
  communityReplies,
  orders,
  orgMemberships,
} from '../db/schema';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import {
  r2Client,
  minioClient,
  THUMBNAIL_BUCKET,
  RAW_VIDEO_BUCKET,
  HLS_BUCKET,
  getThumbnailUrl,
  listRawVideoKeys,
  storage,
} from '../lib/minio';
import { videoQueue } from '../lib/queue';
import { chatCompletion } from '../lib/deepseek';

const router = Router();

const courseScope = (req: Request) => req.organization
  ? eq(courses.organizationId, req.organization.id)
  : isNull(courses.organizationId);
const courseById = (req: Request, id: string) => and(eq(courses.id, id), courseScope(req));
const instructorCourses = (req: Request, instructorId: string) => and(eq(courses.instructorId, instructorId), courseScope(req));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only jpg, jpeg, png, webp images are allowed'));
    }
  },
});

const ALLOWED_VIDEO_EXT = ['mp4', 'mov', 'mkv', 'webm', 'avi'];
const VIDEO_PART_SIZE = 8 * 1024 * 1024;
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;

// S3 multipart uploads do not disappear when a browser closes. Expire and
// abort abandoned sessions so incomplete parts cannot consume disk forever.
const multipartCleanupTimer = setInterval(() => {
  void db.select().from(videoUploadSessions).where(and(
    lt(videoUploadSessions.expiresAt, new Date()),
    eq(videoUploadSessions.status, 'uploading'),
  )).then(async (expired) => {
    for (const session of expired) {
      await minioClient.send(new AbortMultipartUploadCommand({
        Bucket: RAW_VIDEO_BUCKET, Key: session.storageKey, UploadId: session.multipartUploadId,
      })).catch(() => {});
      await db.delete(videoUploadSessions).where(eq(videoUploadSessions.id, session.id));
    }
  }).catch((error) => console.error('expired multipart upload cleanup failed', error));
}, 60 * 60 * 1000);
multipartCleanupTimer.unref();

const urlSchema = z.string().url().max(2048).optional().nullable();

const courseBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  title_ar: z.string().max(255).optional().nullable(),
  subtitle: z.string().max(255).optional().nullable(),
  description: z.string().min(1).max(5000).optional(),
  category: z.string().min(1).max(255).optional(),
  level: z.string().min(1).max(255).optional(),
  price: z.union([z.number().min(0).max(999999), z.string().min(1)]).optional(),
  original_price: z.union([z.number().min(0).max(999999), z.string()]).optional().nullable(),
  duration_text: z.string().max(255).optional().nullable(),
  thumbnail_url: urlSchema,
  delivery_mode: z.enum(['online', 'offline']).optional(),
  location: z.string().max(1000).optional().nullable(),
  booking_url: urlSchema,
  schedule_text: z.string().max(2000).optional().nullable(),
  capacity: z.number().int().min(1).max(100000).optional().nullable(),
});

// `id` is sent for sections/lessons that already exist so they are updated in
// place (keeping videos, quizzes, progress and notes); items without an id are new.
const sectionSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  position: z.number().int().min(0).optional(),
  lessons: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        title: z.string().min(1).max(255),
        duration_text: z.string().max(255).optional().nullable(),
        is_free: z.boolean().optional(),
        position: z.number().int().min(0).optional(),
      })
    )
    .max(200),
});

function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

router.use(requireAuth, requireRole('instructor'));
router.use(async (req, res, next) => {
  if (!req.organization) return next();
  const [membership] = await db.select({ id: orgMemberships.id }).from(orgMemberships).where(and(
    eq(orgMemberships.orgId, req.organization.id), eq(orgMemberships.userId, req.user!.id),
    eq(orgMemberships.role, 'instructor'), eq(orgMemberships.status, 'active')
  )).limit(1);
  if (!membership) return res.status(403).json({ message: 'Active instructor membership in this organization is required.' });
  return next();
});

router.get('/courses', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;

    const rows = await db
      .select()
      .from(courses)
      .where(and(eq(courses.instructorId, instructorId), req.organization
        ? eq(courses.organizationId, req.organization.id)
        : isNull(courses.organizationId)))
      .orderBy(courses.createdAt);

    const ids = rows.map((r) => r.id);
    const enrollmentMap = new Map<string, number>();
    const ratingMap = new Map<string, number>();
    const lessonMap = new Map<string, number>();
    const revenueMap = new Map<string, number>();

    if (ids.length > 0) {
      // Revenue = money actually paid (paid orders), not list price x students.
      const paid = await db
        .select({ courseId: orders.courseId, total: sum(orders.amount) })
        .from(orders)
        .where(and(inArray(orders.courseId, ids), eq(orders.status, 'paid')))
        .groupBy(orders.courseId);
      for (const p of paid) revenueMap.set(p.courseId, Number(p.total) || 0);

      const enr = await db
        .select({ courseId: enrollments.courseId, count: count(enrollments.id) })
        .from(enrollments)
        .where(inArray(enrollments.courseId, ids))
        .groupBy(enrollments.courseId);
      for (const e of enr) enrollmentMap.set(e.courseId, Number(e.count) || 0);

      const rat = await db
        .select({ courseId: courseReviews.courseId, avg: avg(courseReviews.rating) })
        .from(courseReviews)
        .where(inArray(courseReviews.courseId, ids))
        .groupBy(courseReviews.courseId);
      for (const r of rat) ratingMap.set(r.courseId, Number(Number(r.avg).toFixed(2)) || 0);

      const les = await db
        .select({ courseId: lessons.courseId, count: count(lessons.id) })
        .from(lessons)
        .where(inArray(lessons.courseId, ids))
        .groupBy(lessons.courseId);
      for (const l of les) lessonMap.set(l.courseId, Number(l.count) || 0);
    }

    const result = rows.map((c) => {
      const enrollmentCount = enrollmentMap.get(c.id) ?? 0;
      const price = Number(c.price);
      return {
        id: c.id,
        title: c.title,
        titleAr: c.titleAr,
        subtitle: c.subtitle,
        thumbnail: c.thumbnailUrl,
        category: c.category,
        level: c.level,
        price,
        originalPrice: c.originalPrice ? Number(c.originalPrice) : null,
        duration: c.durationText,
        isPublished: c.isPublished,
        approvalStatus: c.approvalStatus,
        deliveryMode: c.deliveryMode,
        location: c.location,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        enrollmentCount,
        rating: ratingMap.get(c.id) ?? 0,
        revenue: Math.round((revenueMap.get(c.id) ?? 0) * 100) / 100,
        lessonsCount: lessonMap.get(c.id) ?? 0,
      };
    });

    return res.json({ courses: result });
  } catch (err) {
    console.error('instructor courses error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Full course + curriculum for the edit form (owner only, published or not).
router.get('/courses/:id', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Invalid course id' });

    const rows = await db.select().from(courses).where(courseById(req, id.data)).limit(1);
    if (rows.length === 0) return res.status(404).json({ message: 'Course not found' });
    if (rows[0].instructorId !== instructorId) return res.status(403).json({ message: 'Forbidden' });

    const sectionRows = await db
      .select()
      .from(courseSections)
      .where(eq(courseSections.courseId, id.data))
      .orderBy(courseSections.position);
    const lessonRows = await db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, id.data))
      .orderBy(lessons.position);

    const curriculum = sectionRows.map((section) => ({
      id: section.id,
      title: section.title,
      position: section.position,
      lessons: lessonRows
        .filter((l) => l.sectionId === section.id)
        .map((l) => ({
          id: l.id,
          title: l.title,
          durationText: l.durationText,
          isFree: l.isFree,
          position: l.position,
          hasVideo: !!l.videoUrl,
        })),
    }));

    return res.json({ course: { ...rows[0], curriculum } });
  } catch (err) {
    console.error('get instructor course error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/courses', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;

    const parsed = courseBodySchema
      .extend({
        title: z.string().min(1).max(255),
        description: z.string().min(1).max(5000),
        category: z.string().min(1).max(255),
        level: z.string().min(1).max(255),
      })
      .safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid course data', errors: parsed.error.flatten() });
    }
    if ((parsed.data.delivery_mode ?? 'online') === 'offline' && (!parsed.data.location || !parsed.data.schedule_text || !parsed.data.booking_url)) {
      return res.status(400).json({ message: 'Offline courses need a location, schedule, and booking page URL.' });
    }

    const {
      title,
      title_ar,
      subtitle,
      description,
      category,
      level,
      price,
      original_price,
      duration_text,
      thumbnail_url,
      delivery_mode,
      location,
      booking_url,
      schedule_text,
      capacity,
    } = parsed.data;

    const courseMode = delivery_mode ?? 'online';
    const inserted = await db
      .insert(courses)
      .values({
        instructorId,
        organizationId: req.organization?.id ?? null,
        title,
        titleAr: title_ar ?? null,
        subtitle: subtitle ?? null,
        description,
        thumbnailUrl: sanitizeUrl(thumbnail_url),
        category,
        level,
        price: courseMode === 'offline' ? '0' : price != null ? String(price) : '0',
        originalPrice: original_price != null ? String(original_price) : null,
        durationText: duration_text ?? null,
        isPublished: false,
        deliveryMode: courseMode,
        approvalStatus: req.organization ? 'pending' : 'approved',
        location: location ?? null,
        bookingUrl: booking_url ?? null,
        scheduleText: schedule_text ?? null,
        capacity: capacity ?? null,
      })
      .returning();

    return res.status(201).json({ course: inserted[0] });
  } catch (err) {
    console.error('create course error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/courses/:id', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(courses).where(courseById(req, id)).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }
    if (existing[0].instructorId !== instructorId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const willChangeLiveCourse = req.organization && existing[0].approvalStatus === 'approved' && existing[0].isPublished && Object.keys(req.body ?? {}).some((key) => key !== 'sections');
    if (willChangeLiveCourse) {
      // Changes to a live organization course return it to manager review.
      await db.update(courses).set({ isPublished: false, approvalStatus: 'pending', updatedAt: new Date() }).where(eq(courses.id, id));
    }

    const parsed = courseBodySchema
      .extend({ sections: z.array(sectionSchema).max(50).optional() })
      .safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid course data', errors: parsed.error.flatten() });
    }
    if (parsed.data.delivery_mode === 'offline' && (!parsed.data.location || !parsed.data.schedule_text || !parsed.data.booking_url)) {
      return res.status(400).json({ message: 'Offline courses need a location, schedule, and booking page URL.' });
    }

    const {
      title,
      title_ar,
      subtitle,
      description,
      category,
      level,
      price,
      original_price,
      duration_text,
      thumbnail_url,
      delivery_mode,
      location,
      booking_url,
      schedule_text,
      capacity,
      sections,
    } = parsed.data;

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updateValues.title = title;
    if (title_ar !== undefined) updateValues.titleAr = title_ar;
    if (subtitle !== undefined) updateValues.subtitle = subtitle;
    if (description !== undefined) updateValues.description = description;
    if (category !== undefined) updateValues.category = category;
    if (level !== undefined) updateValues.level = level;
    if (price !== undefined) updateValues.price = String(price);
    if (original_price !== undefined)
      updateValues.originalPrice = original_price != null ? String(original_price) : null;
    if (duration_text !== undefined) updateValues.durationText = duration_text;
    if (thumbnail_url !== undefined) updateValues.thumbnailUrl = sanitizeUrl(thumbnail_url);
    if (delivery_mode !== undefined) updateValues.deliveryMode = delivery_mode;
    if (location !== undefined) updateValues.location = location;
    if (booking_url !== undefined) updateValues.bookingUrl = booking_url;
    if (schedule_text !== undefined) updateValues.scheduleText = schedule_text;
    if (capacity !== undefined) updateValues.capacity = capacity;
    if (delivery_mode === 'offline') updateValues.price = '0';
    if (req.organization && (existing[0].approvalStatus !== 'approved' || willChangeLiveCourse)) {
      updateValues.approvalStatus = 'pending';
      updateValues.isPublished = false;
    }

    await db.transaction(async (tx) => {
      await tx.update(courses).set(updateValues).where(courseById(req, id));

      if (Array.isArray(sections)) {
        // Sync the curriculum instead of deleting and re-inserting it: deleting a
        // lesson cascades to its video, transcript, quizzes, attempts, progress and
        // notes, so only lessons the instructor actually removed may be deleted.
        const existingSections = await tx
          .select({ id: courseSections.id })
          .from(courseSections)
          .where(eq(courseSections.courseId, id));
        const existingLessons = await tx
          .select({ id: lessons.id })
          .from(lessons)
          .where(eq(lessons.courseId, id));
        // Only ids that belong to THIS course are honoured; anything else is
        // treated as new, so a client can't edit another course's lessons.
        const ownSectionIds = new Set(existingSections.map((s) => s.id));
        const ownLessonIds = new Set(existingLessons.map((l) => l.id));
        const keptSectionIds = new Set<string>();
        const keptLessonIds = new Set<string>();

        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const section = sections[sIdx];
          const position = section.position ?? sIdx + 1;
          let sectionId: string;

          if (section.id && ownSectionIds.has(section.id)) {
            sectionId = section.id;
            await tx
              .update(courseSections)
              .set({ title: section.title, position })
              .where(eq(courseSections.id, sectionId));
          } else {
            const [inserted] = await tx
              .insert(courseSections)
              .values({ courseId: id, title: section.title, position })
              .returning({ id: courseSections.id });
            sectionId = inserted.id;
          }
          keptSectionIds.add(sectionId);

          const sectionLessons = Array.isArray(section.lessons) ? section.lessons : [];
          for (let lIdx = 0; lIdx < sectionLessons.length; lIdx++) {
            const lesson = sectionLessons[lIdx];
            const values = {
              sectionId,
              title: lesson.title,
              durationText: lesson.duration_text ?? null,
              isFree: !!lesson.is_free,
              position: lesson.position ?? lIdx + 1,
            };
            if (lesson.id && ownLessonIds.has(lesson.id) && !keptLessonIds.has(lesson.id)) {
              await tx.update(lessons).set(values).where(eq(lessons.id, lesson.id));
              keptLessonIds.add(lesson.id);
            } else {
              const [inserted] = await tx
                .insert(lessons)
                .values({ ...values, courseId: id })
                .returning({ id: lessons.id });
              keptLessonIds.add(inserted.id);
            }
          }
        }

        const removedLessonIds = existingLessons.map((l) => l.id).filter((lid) => !keptLessonIds.has(lid));
        if (removedLessonIds.length > 0) {
          // enrollments.last_lesson_id has no ON DELETE rule; clear it first or
          // the delete fails for any student who resumed one of these lessons.
          await tx
            .update(enrollments)
            .set({ lastLessonId: null })
            .where(inArray(enrollments.lastLessonId, removedLessonIds));
          await tx.delete(lessons).where(inArray(lessons.id, removedLessonIds));
        }

        const removedSectionIds = existingSections.map((s) => s.id).filter((sid) => !keptSectionIds.has(sid));
        if (removedSectionIds.length > 0) {
          await tx.delete(courseSections).where(inArray(courseSections.id, removedSectionIds));
        }
      }
    });

    const updatedCourse = await db.select().from(courses).where(courseById(req, id)).limit(1);
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
      lessons: lessonRows.filter((l) => l.sectionId === section.id),
    }));

    return res.json({ course: { ...updatedCourse[0], curriculum } });
  } catch (err) {
    console.error('update course error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/courses/:id/publish', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(courses).where(courseById(req, id)).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }
    if (existing[0].instructorId !== instructorId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (existing[0].organizationId) {
      return res.status(409).json({ message: 'Organization courses must be submitted for manager review before publication.' });
    }
    if (existing[0].organizationId && existing[0].approvalStatus !== 'approved') {
      return res.status(409).json({ message: 'This course must be approved by the organization manager before it can be published.' });
    }

    const updated = await db
      .update(courses)
      .set({ isPublished: true, updatedAt: new Date() })
      .where(courseById(req, id))
      .returning();

    return res.json({ course: updated[0] });
  } catch (err) {
    console.error('publish course error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

async function loadOwnedCourse(req: Request, res: Response) {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ message: 'Invalid course id' });
    return null;
  }
  const rows = await db.select().from(courses).where(courseById(req, id.data)).limit(1);
  if (rows.length === 0) {
    res.status(404).json({ message: 'Course not found' });
    return null;
  }
  if (rows[0].instructorId !== req.user!.id) {
    res.status(403).json({ message: 'Forbidden' });
    return null;
  }
  return rows[0];
}

// Hide from the catalog and stop new enrollments. Enrolled students keep access.
router.post('/courses/:id/unpublish', async (req: Request, res: Response) => {
  try {
    const course = await loadOwnedCourse(req, res);
    if (!course) return;
    const [updated] = await db
      .update(courses)
      .set({ isPublished: false, updatedAt: new Date() })
      .where(courseById(req, course.id))
      .returning();
    return res.json({ course: updated });
  } catch (err) {
    console.error('unpublish course error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Permanently delete a course. Everything that references a course cascades
// (enrollments, progress, certificates, posts...), so courses with students
// can't be deleted; unpublish them instead.
router.delete('/courses/:id', async (req: Request, res: Response) => {
  try {
    const course = await loadOwnedCourse(req, res);
    if (!course) return;

    const [{ value: studentCount }] = await db
      .select({ value: count() })
      .from(enrollments)
      .where(eq(enrollments.courseId, course.id));
    if (Number(studentCount) > 0) {
      return res.status(409).json({
        message: `${studentCount} student${Number(studentCount) === 1 ? ' is' : 's are'} enrolled in this course, so it can't be deleted. Unpublish it instead to hide it from the catalog.`,
        studentCount: Number(studentCount),
      });
    }

    const lessonIds = (
      await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.courseId, course.id))
    ).map((l) => l.id);

    await db.delete(courses).where(courseById(req, course.id));

    // Storage isn't covered by the database cascade: remove each lesson's raw
    // upload and HLS files. Failures are logged but don't undo the delete.
    for (const lessonId of lessonIds) {
      try {
        for (const key of await listRawVideoKeys(lessonId)) await storage.removeObject(RAW_VIDEO_BUCKET, key);
        const hlsKeys: string[] = [];
        for await (const obj of storage.listObjectsV2(HLS_BUCKET, `lessons/${lessonId}/`, true) as AsyncIterable<{
          name?: string;
        }>) {
          if (obj.name) hlsKeys.push(obj.name);
        }
        for (const key of hlsKeys) await storage.removeObject(HLS_BUCKET, key);
      } catch (storageErr) {
        console.warn(`failed to remove stored video files for lesson ${lessonId}`, storageErr);
      }
    }

    return res.json({ message: 'Course deleted' });
  } catch (err) {
    console.error('delete course error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/upload/thumbnail', upload.single('thumbnail'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No thumbnail file provided' });
    }

    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const objectName = `${randomUUID()}.${ext}`;

    await storage.putObject(
      THUMBNAIL_BUCKET,
      objectName,
      req.file.buffer,
      req.file.size,
      { 'Content-Type': req.file.mimetype }
    );

    const url = getThumbnailUrl(objectName);
    return res.json({ url });
  } catch (err) {
    console.error('thumbnail upload error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

async function getOwnedLesson(lessonId: string, req: Request) {
  const [row] = await db.select({ lesson: lessons, course: courses }).from(lessons)
    .innerJoin(courses, eq(lessons.courseId, courses.id))
    .where(and(eq(lessons.id, lessonId), eq(courses.instructorId, req.user!.id), courseScope(req))).limit(1);
  return row;
}

async function getOwnedUpload(lessonId: string, uploadId: string, req: Request) {
  const [session] = await db.select().from(videoUploadSessions).where(and(
    eq(videoUploadSessions.id, uploadId), eq(videoUploadSessions.lessonId, lessonId),
    eq(videoUploadSessions.instructorId, req.user!.id), gt(videoUploadSessions.expiresAt, new Date())
  )).limit(1);
  return session;
}

router.post('/lessons/:lessonId/video-uploads', async (req: Request, res: Response) => {
  const parsed = z.object({
    fileName: z.string().trim().min(1).max(255),
    fileSize: z.number().int().positive().max(MAX_VIDEO_SIZE),
    contentType: z.string().trim().max(120).optional(),
  }).strict().safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Choose a supported video file up to 2 GiB.' });
  const lessonId = req.params.lessonId;
  const lesson = await getOwnedLesson(lessonId, req);
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' });

  const [activeUploadCount] = await db.select({ count: count() }).from(videoUploadSessions).where(and(
    eq(videoUploadSessions.instructorId, req.user!.id),
    eq(videoUploadSessions.status, 'uploading'),
    gt(videoUploadSessions.expiresAt, new Date()),
  ));
  if (Number(activeUploadCount?.count || 0) >= 2) {
    return res.status(429).json({ message: 'You already have two active video uploads. Finish or cancel one before starting another.' });
  }

  const safeName = parsed.data.fileName.split(/[\\/]/).pop() || '';
  const extension = safeName.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_VIDEO_EXT.includes(extension)) {
    return res.status(400).json({ message: 'Only MP4, MOV, MKV, WebM, and AVI videos are supported.' });
  }
  const contentType = parsed.data.contentType || 'application/octet-stream';
  if (!contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
    return res.status(400).json({ message: 'The selected file must be a video.' });
  }

  const storageKey = `lessons/raw/${lessonId}/${randomUUID()}.${extension}`;
  let multipartUploadId: string | undefined;
  try {
    const created = await minioClient.send(new CreateMultipartUploadCommand({
      Bucket: RAW_VIDEO_BUCKET, Key: storageKey, ContentType: contentType,
    }));
    multipartUploadId = created.UploadId;
    if (!multipartUploadId) throw new Error('Object storage did not return a multipart upload id.');
    const [session] = await db.insert(videoUploadSessions).values({
      lessonId, instructorId: req.user!.id, storageKey, multipartUploadId,
      fileName: safeName, contentType, fileSize: parsed.data.fileSize,
      partSize: VIDEO_PART_SIZE, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }).returning();
    return res.status(201).json({
      uploadId: session.id, partSize: VIDEO_PART_SIZE,
      totalParts: Math.ceil(session.fileSize / VIDEO_PART_SIZE), expiresAt: session.expiresAt,
    });
  } catch (err) {
    if (multipartUploadId) await minioClient.send(new AbortMultipartUploadCommand({
      Bucket: RAW_VIDEO_BUCKET, Key: storageKey, UploadId: multipartUploadId,
    })).catch(() => {});
    console.error('video multipart initialization failed', err);
    return res.status(503).json({ message: 'Could not start the video upload. Please try again.' });
  }
});

router.put(
  '/lessons/:lessonId/video-uploads/:uploadId/parts/:partNumber',
  express.raw({ type: 'application/octet-stream', limit: VIDEO_PART_SIZE, inflate: false }),
  async (req: Request, res: Response) => {
    const lessonId = req.params.lessonId;
    const session = await getOwnedUpload(lessonId, req.params.uploadId, req);
    if (!session || session.status !== 'uploading') return res.status(404).json({ message: 'Upload session not found or expired.' });
    if (!(await getOwnedLesson(lessonId, req))) return res.status(404).json({ message: 'Lesson not found.' });
    const partNumber = Number(req.params.partNumber);
    const totalParts = Math.ceil(session.fileSize / session.partSize);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > totalParts) {
      return res.status(400).json({ message: 'Invalid video part number.' });
    }
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ message: 'Send this part as application/octet-stream.' });
    const expectedSize = partNumber === totalParts
      ? session.fileSize - session.partSize * (totalParts - 1)
      : session.partSize;
    if (req.body.length !== expectedSize) return res.status(400).json({ message: 'Video part size does not match the upload session.' });
    try {
      const uploaded = await minioClient.send(new UploadPartCommand({
        Bucket: RAW_VIDEO_BUCKET, Key: session.storageKey,
        UploadId: session.multipartUploadId, PartNumber: partNumber, Body: req.body,
      }));
      if (!uploaded.ETag) throw new Error('Object storage did not return the part checksum.');
      return res.json({ partNumber, etag: uploaded.ETag });
    } catch (err) {
      console.error('video multipart part failed', { lessonId, partNumber, err });
      return res.status(502).json({ message: 'This video part could not be saved. Retry this part.' });
    }
  }
);

router.post('/lessons/:lessonId/video-uploads/:uploadId/complete', async (req: Request, res: Response) => {
  const lessonId = req.params.lessonId;
  const session = await getOwnedUpload(lessonId, req.params.uploadId, req);
    if (!session) return res.status(404).json({ message: 'Upload session not found or expired.' });
    if (!(await getOwnedLesson(lessonId, req))) return res.status(404).json({ message: 'Lesson not found.' });
    try {
    if (session.status === 'uploading') {
      let objectAlreadyCompleted = false;
      let listed: ListPartsCommandOutput | undefined;
      try {
        listed = await minioClient.send(new ListPartsCommand({
          Bucket: RAW_VIDEO_BUCKET, Key: session.storageKey, UploadId: session.multipartUploadId,
        }));
      } catch (error) {
        // The object may have completed on a previous attempt whose response
        // or following database write failed. Only treat it as complete when
        // MinIO confirms that the final object exists.
        objectAlreadyCompleted = await minioClient.send(new HeadObjectCommand({
          Bucket: RAW_VIDEO_BUCKET, Key: session.storageKey,
        })).then(() => true).catch(() => false);
        if (!objectAlreadyCompleted) throw error;
      }
      if (!objectAlreadyCompleted && listed) {
        const parts = (listed.Parts ?? []).filter((part) => part.PartNumber && part.ETag)
          .sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0));
        const totalParts = Math.ceil(session.fileSize / session.partSize);
        if (parts.length !== totalParts || parts.some((part, index) => {
          const expectedSize = index === totalParts - 1
            ? session.fileSize - session.partSize * index
            : session.partSize;
          return part.PartNumber !== index + 1 || part.Size !== expectedSize;
        })) return res.status(409).json({ message: 'Some video parts are missing. Retry them before completing the upload.' });
        await minioClient.send(new CompleteMultipartUploadCommand({
          Bucket: RAW_VIDEO_BUCKET, Key: session.storageKey, UploadId: session.multipartUploadId,
          MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.PartNumber, ETag: part.ETag })) },
        })).catch(async (error: unknown) => {
          // Handle an ambiguous completion response safely and idempotently.
          if (await minioClient.send(new HeadObjectCommand({ Bucket: RAW_VIDEO_BUCKET, Key: session.storageKey })).then(() => true).catch(() => false)) return;
          throw error;
        });
      }
      await db.update(videoUploadSessions).set({ status: 'completed' }).where(eq(videoUploadSessions.id, session.id));
    }

    const [existing] = await db.select({ id: videoJobs.id }).from(videoJobs).where(eq(videoJobs.lessonId, lessonId)).limit(1);
    if (existing) {
      await db.update(videoJobs).set({ status: 'pending', errorMsg: null, updatedAt: new Date() }).where(eq(videoJobs.lessonId, lessonId));
    } else {
      await db.insert(videoJobs).values({ lessonId, status: 'pending' });
    }
    const job = await videoQueue.add('transcode', { lessonId, minioKey: session.storageKey }, { jobId: session.id });
    await db.delete(videoUploadSessions).where(eq(videoUploadSessions.id, session.id));
    return res.status(202).json({ message: 'Video upload received, transcoding started.', jobId: job.id });
  } catch (err) {
    console.error('video multipart completion failed', { lessonId, uploadId: session.id, err });
    return res.status(502).json({ message: 'The upload is saved, but processing could not be queued. Retry completing this upload.' });
  }
});

router.delete('/lessons/:lessonId/video-uploads/:uploadId', async (req: Request, res: Response) => {
  const lessonId = req.params.lessonId;
  const session = await getOwnedUpload(lessonId, req.params.uploadId, req);
  if (!session) return res.status(404).json({ message: 'Upload session not found or expired.' });
  if (!(await getOwnedLesson(lessonId, req))) return res.status(404).json({ message: 'Lesson not found.' });
  if (session.status === 'uploading') {
    await minioClient.send(new AbortMultipartUploadCommand({
      Bucket: RAW_VIDEO_BUCKET, Key: session.storageKey, UploadId: session.multipartUploadId,
    })).catch((err) => console.warn('could not abort incomplete video upload', err));
  }
  await db.delete(videoUploadSessions).where(eq(videoUploadSessions.id, session.id));
  return res.status(204).end();
});

router.get('/lessons/:lessonId/video-status', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;
    const { lessonId } = req.params;

    const lessonRows = await db
      .select({ lesson: lessons, course: courses })
      .from(lessons)
      .innerJoin(courses, eq(lessons.courseId, courses.id))
      .where(eq(lessons.id, lessonId))
      .limit(1);

    if (lessonRows.length === 0) {
      return res.status(404).json({ message: 'Lesson not found' });
    }
    if (lessonRows[0].course.instructorId !== instructorId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const rows = await db.select().from(videoJobs).where(eq(videoJobs.lessonId, lessonId)).limit(1);
    if (rows.length === 0) {
      return res.json({ status: 'not_uploaded' });
    }

    const job = rows[0];
    return res.json({
      status: job.status,
      hls_url: job.hlsUrl ? `/api/videos/${lessonId}/playlist.m3u8` : null,
      error_msg: job.errorMsg,
      updated_at: job.updatedAt,
    });
  } catch (err) {
    console.error('video status error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Re-run only the transcript step (Whisper + embeddings) for an already
// transcoded video whose transcript failed. Uses the kept raw upload.
router.post('/lessons/:lessonId/retry-transcript', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;
    const lessonId = z.string().uuid().safeParse(req.params.lessonId);
    if (!lessonId.success) return res.status(400).json({ message: 'Invalid lesson id' });

    const lessonRows = await db
      .select({ course: courses })
      .from(lessons)
      .innerJoin(courses, eq(lessons.courseId, courses.id))
      .where(eq(lessons.id, lessonId.data))
      .limit(1);
    if (lessonRows.length === 0) return res.status(404).json({ message: 'Lesson not found' });
    if (lessonRows[0].course.instructorId !== instructorId) return res.status(403).json({ message: 'Forbidden' });

    const jobRows = await db.select().from(videoJobs).where(eq(videoJobs.lessonId, lessonId.data)).limit(1);
    if (jobRows.length === 0 || jobRows[0].status !== 'transcript_failed') {
      return res.status(409).json({ message: 'Only a failed transcript can be retried' });
    }

    const [rawKey] = await listRawVideoKeys(lessonId.data);
    if (!rawKey) {
      return res.status(409).json({ message: 'The original video file is no longer available. Please re-upload the video.' });
    }

    await db
      .update(videoJobs)
      .set({ status: 'transcribed', errorMsg: null, updatedAt: new Date() })
      .where(eq(videoJobs.lessonId, lessonId.data));
    await videoQueue.add('transcribe', { lessonId: lessonId.data, minioKey: rawKey, transcriptOnly: true });

    return res.status(202).json({ status: 'transcribed', message: 'Transcript retry started' });
  } catch (err) {
    console.error('retry transcript error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const quizQuestionSchema = z.object({
  questionText: z.string().min(1),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().min(1),
  optionD: z.string().min(1),
  correctOption: z.enum(['a', 'b', 'c', 'd']),
  explanation: z.string().optional().nullable(),
  position: z.number().int().min(0).optional(),
});

const quizBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  questions: z.array(quizQuestionSchema).min(2).max(20),
});

async function verifyLessonOwnership(lessonId: string, instructorId: string) {
  const rows = await db
    .select({ lesson: lessons, course: courses })
    .from(lessons)
    .innerJoin(courses, eq(lessons.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (rows.length === 0) return { ok: false as const, status: 404, message: 'Lesson not found' };
  if (rows[0].course.instructorId !== instructorId) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }
  return { ok: true as const, lesson: rows[0].lesson };
}

router.post('/lessons/:lessonId/quiz', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;
    const { lessonId } = req.params;

    const ownership = await verifyLessonOwnership(lessonId, instructorId);
    if (!ownership.ok) {
      return res.status(ownership.status).json({ message: ownership.message });
    }

    const parsed = quizBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid quiz data', errors: parsed.error.flatten() });
    }

    const { title, questions } = parsed.data;

    const created = await db.transaction(async (tx) => {
      await tx.delete(quizzes).where(eq(quizzes.lessonId, lessonId));

      const quizRows = await tx
        .insert(quizzes)
        .values({
          lessonId,
          courseId: ownership.lesson.courseId,
          title: title ?? 'Lesson Quiz',
          createdBy: instructorId,
        })
        .returning();
      const quiz = quizRows[0];

      const insertedQuestions = await tx
        .insert(quizQuestions)
        .values(
          questions.map((q, idx) => ({
            quizId: quiz.id,
            questionText: q.questionText,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            correctOption: q.correctOption,
            explanation: q.explanation ?? null,
            position: q.position ?? idx + 1,
          }))
        )
        .returning();

      return { quiz, questions: insertedQuestions };
    });

    return res.status(201).json({
      quiz: {
        id: created.quiz.id,
        title: created.quiz.title,
        lessonId: created.quiz.lessonId,
        courseId: created.quiz.courseId,
        questions: created.questions,
      },
    });
  } catch (err) {
    console.error('save quiz error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/lessons/:lessonId/quiz/generate', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;
    const { lessonId } = req.params;

    const ownership = await verifyLessonOwnership(lessonId, instructorId);
    if (!ownership.ok) {
      return res.status(ownership.status).json({ message: ownership.message });
    }

    const chunks = await db
      .select({ content: lessonChunks.content })
      .from(lessonChunks)
      .where(eq(lessonChunks.lessonId, lessonId))
      .orderBy(lessonChunks.chunkIndex);

    if (chunks.length === 0) {
      return res.status(422).json({ message: 'Lesson transcript not ready' });
    }

    const NL = String.fromCharCode(10);
    const content = chunks.map((c) => c.content).join(NL + NL).slice(0, 4000);

    const prompt = `You are an expert quiz generator for an educational platform. Generate exactly 5 multiple choice questions based on this lesson content. Each question must have 4 options (A, B, C, D) with exactly one correct answer. Include a brief explanation for the correct answer. Return ONLY a valid JSON array with no markdown, no backticks, no explanation outside the JSON. Format:
[{
  "questionText": "...",
  "optionA": "...",
  "optionB": "...",
  "optionC": "...",
  "optionD": "...",
  "correctOption": "a",
  "explanation": "..."
}]

Lesson content:
${content}`;

    let raw: string;
    try {
      raw = await chatCompletion([{ role: 'user', content: prompt }]);
    } catch (err) {
      console.error('quiz generation error', err);
      return res.status(500).json({ message: 'Failed to generate quiz questions' });
    }

    let parsedQuestions: unknown;
    try {
      parsedQuestions = JSON.parse(raw);
    } catch {
      const retryPrompt = `${prompt}

CRITICAL: Return ONLY a valid JSON array. Do not include markdown code fences or any other text.`;
      raw = await chatCompletion([{ role: 'user', content: retryPrompt }]);
      parsedQuestions = JSON.parse(raw);
    }

    const validated = z.array(quizQuestionSchema).parse(parsedQuestions);

    return res.json({ questions: validated });
  } catch (err) {
    console.error('generate quiz error', err);
    if (err instanceof z.ZodError) {
      return res.status(422).json({ message: 'Invalid quiz format from AI' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/lessons/:lessonId/quiz', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;
    const { lessonId } = req.params;

    const ownership = await verifyLessonOwnership(lessonId, instructorId);
    if (!ownership.ok) {
      return res.status(ownership.status).json({ message: ownership.message });
    }

    const quizRows = await db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).limit(1);
    if (quizRows.length === 0) {
      return res.json({ quiz: null });
    }

    const quiz = quizRows[0];
    const questions = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quiz.id))
      .orderBy(quizQuestions.position);

    return res.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        lessonId: quiz.lessonId,
        courseId: quiz.courseId,
        questions,
      },
    });
  } catch (err) {
    console.error('get instructor quiz error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/courses/:courseId/quiz-analytics', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;
    const { courseId } = req.params;

    const courseRows = await db.select().from(courses).where(courseById(req, courseId)).limit(1);
    if (courseRows.length === 0) return res.status(404).json({ message: 'Course not found' });
    if (courseRows[0].instructorId !== instructorId) return res.status(403).json({ message: 'Forbidden' });

    const lessonRows = await db.select().from(lessons).where(eq(lessons.courseId, courseId));

    const quizRows = await db
      .select({ quiz: quizzes, lesson: lessons })
      .from(quizzes)
      .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
      .where(eq(quizzes.courseId, courseId));

    const result = [];
    for (const row of quizRows) {
      const attempts = await db
        .select()
        .from(quizAttempts)
        .where(eq(quizAttempts.quizId, row.quiz.id));

      const totalAttempts = attempts.length;
      const avgScore =
        totalAttempts > 0
          ? Math.round(attempts.reduce((acc, a) => acc + a.percentage, 0) / totalAttempts)
          : 0;

      const questions = await db
        .select()
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, row.quiz.id))
        .orderBy(quizQuestions.position);

      const questionStats = questions.map((q) => {
        let correct = 0;
        let answered = 0;
        for (const attempt of attempts) {
          try {
            const parsed = JSON.parse(attempt.answers) as Record<string, string>;
            if (parsed[q.id] !== undefined) {
              answered++;
              if (parsed[q.id] === q.correctOption) correct++;
            }
          } catch {
            // ignore
          }
        }
        const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
        return {
          questionText: q.questionText,
          accuracy,
          isDifficult: accuracy < 50,
        };
      });

      result.push({
        lessonId: row.lesson.id,
        lessonTitle: row.lesson.title,
        totalAttempts,
        avgScore,
        questions: questionStats,
      });
    }

    return res.json({ analytics: result });
  } catch (err) {
    console.error('quiz analytics error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/students', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;

    const rows = await db
      .select({
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        studentAvatar: users.avatarUrl,
        courseId: courses.id,
        courseTitle: courses.title,
        progress: enrollments.progress,
        enrolledAt: enrollments.enrolledAt,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .where(instructorCourses(req, instructorId))
      .orderBy(desc(enrollments.enrolledAt));

    return res.json({ students: rows });
  } catch (err) {
    console.error('instructor students error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/earnings', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;

    const courseRows = await db.select().from(courses).where(instructorCourses(req, instructorId));
    const courseIds = courseRows.map((c) => c.id);
    // Prices are numeric(10,2); keep the cents (`| 0` used to truncate 49.99 to 49).
    const toMoney = (n: number) => Math.round(n * 100) / 100;

    let allEnrollments: { courseId: string; enrolledAt: Date }[] = [];
    // Revenue counts only paid orders, at the amount actually charged and in the
    // month it was paid (not list price x enrolled students).
    let paidOrders: { courseId: string; amount: number; paidAt: Date }[] = [];
    if (courseIds.length > 0) {
      allEnrollments = await db
        .select({ courseId: enrollments.courseId, enrolledAt: enrollments.enrolledAt })
        .from(enrollments)
        .where(inArray(enrollments.courseId, courseIds));
      paidOrders = (
        await db
          .select({ courseId: orders.courseId, amount: orders.amount, paidAt: orders.paidAt })
          .from(orders)
          .where(and(inArray(orders.courseId, courseIds), eq(orders.status, 'paid')))
      ).map((o) => ({ courseId: o.courseId, amount: Number(o.amount) || 0, paidAt: o.paidAt ?? new Date(0) }));
    }

    const now = new Date();
    const monthly: { month: string; year: number; revenue: number }[] = [];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let thisMonthRevenue = 0;
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthIdx = d.getMonth();

      let revenue = 0;
      for (const o of paidOrders) {
        const pd = new Date(o.paidAt);
        if (pd.getFullYear() === year && pd.getMonth() === monthIdx) {
          revenue += o.amount;
        }
      }

      if (i === 0) thisMonthRevenue = toMoney(revenue);
      monthly.push({ month: MONTHS[monthIdx], year, revenue: toMoney(revenue) });
    }

    const courseEarnings = courseRows.map((c) => {
      const cnt = allEnrollments.filter((e) => e.courseId === c.id).length;
      const price = Number(c.price) || 0;
      const revenue = paidOrders.filter((o) => o.courseId === c.id).reduce((acc, o) => acc + o.amount, 0);
      return { courseId: c.id, title: c.title, students: cnt, price, revenue: toMoney(revenue) };
    });

    const totalRevenue = toMoney(courseEarnings.reduce((acc, c) => acc + c.revenue, 0));

    return res.json({
      monthly,
      summary: {
        totalRevenue,
        thisMonthRevenue,
        totalStudents: allEnrollments.length,
        courseCount: courseRows.length,
      },
      courses: courseEarnings,
    });
  } catch (err) {
    console.error('instructor earnings error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;

    const courseRows = await db.select().from(courses).where(instructorCourses(req, instructorId));
    const courseIds = courseRows.map((c) => c.id);

    let enrollmentRows: { courseId: string; progress: number }[] = [];
    if (courseIds.length > 0) {
      enrollmentRows = await db
        .select({ courseId: enrollments.courseId, progress: enrollments.progress })
        .from(enrollments)
        .where(inArray(enrollments.courseId, courseIds));
    }

    const funnel = courseRows.map((c) => {
      const forCourse = enrollmentRows.filter((e) => e.courseId === c.id);
      return {
        courseId: c.id,
        courseTitle: c.title,
        enrolledCount: forCourse.length,
        startedCount: forCourse.filter((e) => e.progress > 0).length,
        completedCount: forCourse.filter((e) => e.progress === 100).length,
      };
    });

    return res.json({ funnel });
  } catch (err) {
    console.error('instructor analytics error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/community-questions', async (req: Request, res: Response) => {
  try {
    const instructorId = req.user!.id;

    const courseRows = await db.select().from(courses).where(instructorCourses(req, instructorId));
    const courseIds = courseRows.map((c) => c.id);
    const courseTitleMap = new Map(courseRows.map((c) => [c.id, c.title]));

    if (courseIds.length === 0) return res.json({ questions: [] });

    const posts = await db
      .select()
      .from(communityPosts)
      .where(inArray(communityPosts.courseId, courseIds))
      .orderBy(desc(communityPosts.createdAt));

    const postIds = posts.map((p) => p.id);
    const replies = postIds.length
      ? await db.select().from(communityReplies).where(inArray(communityReplies.postId, postIds))
      : [];

    const questions = posts
      .filter((p) => {
        const postReplies = replies.filter((r) => r.postId === p.id);
        return !postReplies.some((r) => r.authorId === instructorId);
      })
      .slice(0, 5)
      .map((p) => ({
        postId: p.id,
        courseId: p.courseId,
        content: p.content,
        courseTitle: p.courseId ? courseTitleMap.get(p.courseId) ?? '' : '',
        createdAt: p.createdAt,
        replyCount: replies.filter((r) => r.postId === p.id).length,
      }));

    return res.json({ questions });
  } catch (err) {
    console.error('instructor community questions error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
