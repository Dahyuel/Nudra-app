import { Router, Request, Response } from 'express';
import { eq, and, desc, count, gte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db';
import {
  studySessions,
  studentBadges,
  certificates,
  enrollments,
  courses,
  users,
  lessonProgress,
  communityReplies,
} from '../db/schema';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import { BADGE_DEFINITIONS, calculateStreak } from '../lib/badges';
import { generateCertificatePdf } from '../lib/certificatePdf';

const router = Router();

const SUBJECT_COLORS = ['#2D6A4F', '#52B788', '#74C69D', '#B7E4C7', '#D8F3DC'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

router.get('/overview', requireAuth, requireRole('student'), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;

    const streak = await calculateStreak(studentId);

    const weeklyHours: { day: string; date: string; hours: number }[] = [];
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const sessionRows = await db
      .select()
      .from(studySessions)
      .where(eq(studySessions.studentId, studentId));
    const minutesByDate = new Map<string, number>();
    for (const row of sessionRows) {
      minutesByDate.set(String(row.date), row.minutesStudied);
    }

    let totalHoursThisWeek = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      const minutes = minutesByDate.get(dateStr) ?? 0;
      const hours = Math.round((minutes / 60) * 10) / 10;
      totalHoursThisWeek += hours;
      weeklyHours.push({ day: DAY_NAMES[d.getDay()], date: dateStr, hours });
    }
    totalHoursThisWeek = Math.round(totalHoursThisWeek * 10) / 10;

    const enrolledRows = await db
      .select({ category: courses.category })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.studentId, studentId));

    const categoryCounts = new Map<string, number>();
    for (const row of enrolledRows) {
      categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
    }

    const subjectBreakdown: { name: string; value: number; color: string }[] = [];
    const totalEnrolled = enrolledRows.length;
    if (totalEnrolled > 0) {
      let idx = 0;
      for (const [name, cnt] of categoryCounts.entries()) {
        subjectBreakdown.push({
          name,
          value: Math.round((cnt / totalEnrolled) * 100),
          color: SUBJECT_COLORS[idx % SUBJECT_COLORS.length],
        });
        idx++;
      }
    }

    const unlockedRows = await db
      .select()
      .from(studentBadges)
      .where(eq(studentBadges.studentId, studentId));
    const unlockedMap = new Map<string, Date>();
    for (const row of unlockedRows) {
      unlockedMap.set(row.badgeKey, row.unlockedAt);
    }

    const lessonsTodayRows = await db
      .select({ value: count() })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.studentId, studentId),
          eq(lessonProgress.completed, true),
          gte(lessonProgress.completedAt, startOfToday)
        )
      );
    const lessonsTodayCount = Number(lessonsTodayRows[0]?.value | 0);

    const replyRows = await db
      .select({ value: count() })
      .from(communityReplies)
      .where(eq(communityReplies.authorId, studentId));
    const replyCount = Number(replyRows[0]?.value | 0);

    const badges = BADGE_DEFINITIONS.map((badge) => {
      const unlockedAt = unlockedMap.get(badge.key);
      const isUnlocked = !!unlockedAt;
      let progressText: string | null = null;
      if (!isUnlocked) {
        if (badge.key === 'streak_30') progressText = `${streak}/30 days`;
        else if (badge.key === 'community_mentor') progressText = `${replyCount}/10 replies`;
        else if (badge.key === 'speed_learner') progressText = `${lessonsTodayCount}/5 lessons today`;
      }
      return {
        key: badge.key,
        title: badge.title,
        subtitle: badge.subtitle,
        icon: badge.icon,
        badgeColorClass: badge.badgeColorClass,
        isUnlocked,
        unlockedAt: unlockedAt ?? null,
        progressText,
      };
    });

    const unlockedBadgeCount = badges.filter((b) => b.isUnlocked).length;

    return res.json({
      streak,
      weeklyHours,
      subjectBreakdown,
      totalHoursThisWeek,
      badges,
      unlockedBadgeCount,
      totalBadgeCount: BADGE_DEFINITIONS.length,
    });
  } catch (err) {
    console.error('stats overview error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/certificates', requireAuth, requireRole('student'), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;

    const rows = await db
      .select({
        id: certificates.id,
        certCode: certificates.certCode,
        courseId: certificates.courseId,
        issuedAt: certificates.issuedAt,
        courseTitle: courses.title,
        courseDurationText: courses.durationText,
        instructorName: users.name,
      })
      .from(certificates)
      .innerJoin(courses, eq(certificates.courseId, courses.id))
      .leftJoin(users, eq(courses.instructorId, users.id))
      .where(eq(certificates.studentId, studentId))
      .orderBy(desc(certificates.issuedAt));

    return res.json({ certificates: rows });
  } catch (err) {
    console.error('certificates error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/certificates/:certCode/pdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { certCode } = req.params;

    const instructorUsers = alias(users, 'instructor');

    const rows = await db
      .select({
        certCode: certificates.certCode,
        issuedAt: certificates.issuedAt,
        studentName: users.name,
        courseTitle: courses.title,
        instructorName: instructorUsers.name,
      })
      .from(certificates)
      .innerJoin(courses, eq(certificates.courseId, courses.id))
      .innerJoin(users, eq(certificates.studentId, users.id))
      .leftJoin(instructorUsers, eq(courses.instructorId, instructorUsers.id))
      .where(and(eq(certificates.certCode, certCode), eq(certificates.studentId, userId)))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    const cert = rows[0];

    const pdfBuffer = await generateCertificatePdf({
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      instructorName: cert.instructorName ?? 'Nudra Instructor',
      certCode: cert.certCode,
      issuedAt: cert.issuedAt,
      grade: 'Completed',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="nudra-certificate-${certCode}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('certificate pdf error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
