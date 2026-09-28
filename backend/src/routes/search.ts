import { Router, Request, Response } from 'express';
import { eq, and, ilike, or, desc } from 'drizzle-orm';
import { db } from '../db';
import { courses, users, lessons, communityPosts } from '../db/schema';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (q.length < 2) {
      return res.json({ courses: [], lessons: [], posts: [] });
    }

    const like = `%${q}%`;

    const [courseRows, lessonRows, postRows] = await Promise.all([
      db
        .select({
          id: courses.id,
          title: courses.title,
          thumbnailUrl: courses.thumbnailUrl,
          instructorName: users.name,
          category: courses.category,
          level: courses.level,
          price: courses.price,
        })
        .from(courses)
        .innerJoin(users, eq(courses.instructorId, users.id))
        .where(
          and(
            eq(courses.isPublished, true),
            or(
              ilike(courses.title, like),
              ilike(courses.subtitle, like),
              ilike(courses.description, like)
            )
          )
        )
        .limit(5),

      db
        .select({
          id: lessons.id,
          title: lessons.title,
          courseId: lessons.courseId,
          courseTitle: courses.title,
        })
        .from(lessons)
        .innerJoin(courses, eq(lessons.courseId, courses.id))
        .where(and(eq(courses.isPublished, true), ilike(lessons.title, like)))
        .limit(5),

      db
        .select({
          id: communityPosts.id,
          title: communityPosts.title,
          content: communityPosts.content,
          courseId: communityPosts.courseId,
          createdAt: communityPosts.createdAt,
        })
        .from(communityPosts)
        .where(
          and(
            eq(communityPosts.isAnonymous, false),
            or(ilike(communityPosts.title, like), ilike(communityPosts.content, like))
          )
        )
        .orderBy(desc(communityPosts.createdAt))
        .limit(5),
    ]);

    return res.json({
      courses: courseRows,
      lessons: lessonRows,
      posts: postRows.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content.slice(0, 100),
        courseId: p.courseId,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    console.error('search error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
