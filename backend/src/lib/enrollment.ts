import { eq } from 'drizzle-orm';
import { db } from '../db';
import { enrollments, lessons, courseSections, users } from '../db/schema';
import { sendEnrollmentEmail } from './mailer';
import { createNotification } from './notifications';

/**
 * Enrol a student (free enrollment, or after a confirmed payment). Idempotent:
 * returns { created: false } if they are already enrolled, so a payment
 * confirmation that arrives twice can't double-enrol or double-notify.
 */
export async function enrollStudent(studentId: string, course: { id: string; title: string }) {
  const [firstLesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(courseSections, eq(lessons.sectionId, courseSections.id))
    .where(eq(lessons.courseId, course.id))
    .orderBy(courseSections.position, lessons.position)
    .limit(1);

  const inserted = await db
    .insert(enrollments)
    .values({ studentId, courseId: course.id, progress: 0, lastLessonId: firstLesson?.id ?? null })
    .onConflictDoNothing({ target: [enrollments.studentId, enrollments.courseId] })
    .returning();

  if (inserted.length === 0) return { created: false as const, enrollment: null };

  const [student] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);
  if (student) sendEnrollmentEmail(student, { title: course.title }).catch(console.warn);
  createNotification(
    studentId,
    'enrollment_confirmed',
    'تم التسجيل بنجاح',
    `تم تسجيلك في ${course.title}`,
    `/course/${course.id}`
  ).catch(console.warn);

  return { created: true as const, enrollment: inserted[0] };
}
