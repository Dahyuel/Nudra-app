import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { courses, enrollments, lessons } from '../db/schema';

/** Server-only tenant boundary. Never infer the tenant from a submitted course ID. */
export async function courseAccess(courseId: string, userId: string, role: string, organizationId: string | null) {
  const [course] = await db.select().from(courses).where(and(eq(courses.id, courseId),
    organizationId ? eq(courses.organizationId, organizationId) : isNull(courses.organizationId))).limit(1);
  if (!course) return { allowed: false, status: 404, message: 'Course not found', course: null };
  const [enrollment] = await db.select().from(enrollments).where(and(eq(enrollments.courseId, courseId),
    eq(enrollments.studentId, userId), eq(enrollments.status, 'active'))).limit(1);
  const allowed = course.instructorId === userId || (role === 'admin' && organizationId === null) || Boolean(enrollment);
  return { allowed, status: allowed ? 200 : 403, message: 'Active enrollment is required', course, enrollment };
}

export async function lessonAccess(lessonId: string, userId: string, role: string, organizationId: string | null, preview = true) {
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) return { allowed: false, status: 404, message: 'Lesson not found', courseId: undefined, lesson: undefined };
  const access = await courseAccess(lesson.courseId, userId, role, organizationId);
  const publicPreview = preview && lesson.isFree && access.course?.isPublished && access.course.approvalStatus === 'approved';
  return { ...access, allowed: access.allowed || Boolean(publicPreview), lesson, courseId: lesson.courseId };
}
