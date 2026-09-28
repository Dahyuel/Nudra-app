import { eq, and, count, gte, lte, desc } from 'drizzle-orm';
import { db } from '../db';
import { lessonProgress, enrollments, communityReplies, studentBadges, studySessions } from '../db/schema';
import { createNotification } from './notifications';

export interface BadgeDefinition {
  key: string;
  title: string;
  subtitle: string;
  icon: 'BookOpen' | 'Flame' | 'Award' | 'Sparkles' | 'CheckCircle2' | 'Trophy';
  badgeColorClass: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    key: 'first_lesson',
    title: 'First Lesson',
    subtitle: 'Completed your first video lesson',
    icon: 'BookOpen',
    badgeColorClass: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  },
  {
    key: 'first_completion',
    title: 'Course Graduate',
    subtitle: 'Completed your first full course',
    icon: 'Trophy',
    badgeColorClass: 'bg-amber-50 text-amber-600 border-amber-200',
  },
  {
    key: 'streak_7',
    title: '7-Day Streak',
    subtitle: 'Studied 7 consecutive days',
    icon: 'Flame',
    badgeColorClass: 'bg-orange-50 text-orange-600 border-orange-200',
  },
  {
    key: 'streak_30',
    title: '30-Day Master',
    subtitle: 'Maintained a 30-day continuous streak',
    icon: 'Award',
    badgeColorClass: 'bg-purple-50 text-purple-600 border-purple-200',
  },
  {
    key: 'speed_learner',
    title: 'Speed Learner',
    subtitle: 'Completed 5 lessons in a single day',
    icon: 'Sparkles',
    badgeColorClass: 'bg-blue-50 text-blue-600 border-blue-200',
  },
  {
    key: 'community_mentor',
    title: 'Community Mentor',
    subtitle: 'Posted 10 replies in the community',
    icon: 'CheckCircle2',
    badgeColorClass: 'bg-pink-50 text-pink-600 border-pink-200',
  },
];

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function calculateStreak(studentId: string): Promise<number> {
  const rows = await db
    .select({ date: studySessions.date })
    .from(studySessions)
    .where(eq(studySessions.studentId, studentId))
    .orderBy(desc(studySessions.date));

  if (rows.length === 0) return 0;

  const dateSet = new Set(rows.map((r) => String(r.date)));
  let streak = 0;
  const cursor = new Date();

  if (!dateSet.has(toDateString(cursor))) {
    return 0;
  }

  while (dateSet.has(toDateString(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export async function checkAndAwardBadges(studentId: string): Promise<string[]> {
  const awarded: string[] = [];

  const existing = await db
    .select({ badgeKey: studentBadges.badgeKey })
    .from(studentBadges)
    .where(eq(studentBadges.studentId, studentId));
  const existingKeys = new Set(existing.map((e) => e.badgeKey));

  const streak = await calculateStreak(studentId);

  const completedLessons = await db
    .select({ value: count() })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.studentId, studentId), eq(lessonProgress.completed, true)));
  const completedLessonCount = Number(completedLessons[0]?.value | 0);

  const completedCourses = await db
    .select({ value: count() })
    .from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.progress, 100)));
  const completedCourseCount = Number(completedCourses[0]?.value | 0);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const lessonsToday = await db
    .select({ value: count() })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.studentId, studentId),
        eq(lessonProgress.completed, true),
        gte(lessonProgress.completedAt, startOfDay)
      )
    );
  const lessonsTodayCount = Number(lessonsToday[0]?.value | 0);

  const replies = await db
    .select({ value: count() })
    .from(communityReplies)
    .where(eq(communityReplies.authorId, studentId));
  const replyCount = Number(replies[0]?.value | 0);

  const conditions: Record<string, boolean> = {
    first_lesson: completedLessonCount >= 1,
    first_completion: completedCourseCount >= 1,
    streak_7: streak >= 7,
    streak_30: streak >= 30,
    speed_learner: lessonsTodayCount >= 5,
    community_mentor: replyCount >= 10,
  };

  for (const badge of BADGE_DEFINITIONS) {
    if (!conditions[badge.key]) continue;
    if (existingKeys.has(badge.key)) continue;

    await db
      .insert(studentBadges)
      .values({ studentId, badgeKey: badge.key })
      .onConflictDoNothing();
    createNotification(
      studentId,
      'badge_earned',
      'حصلت على وسام جديد',
      badge.title,
      '/progress'
    ).catch(console.warn);
    awarded.push(badge.key);
  }

  return awarded;
}
