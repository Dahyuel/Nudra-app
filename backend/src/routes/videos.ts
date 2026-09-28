import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { lessons, courses, enrollments } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';
import { minioClient, HLS_BUCKET, getHlsPlaylistKey, getHlsObjectPrefix } from '../lib/minio';

const router = Router();

const SEGMENT_RE = /^segment_\d+\.ts$/i;
const PLAYLIST_RE = /^index\.m3u8$/i;

const videoRateLimiter = rateLimit({
  windowMs: Number(process.env.VIDEO_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  max: Number(process.env.VIDEO_RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many video requests, please try again later' },
});

router.use(videoRateLimiter);

async function verifyLessonAccess(
  lessonId: string,
  userId: string,
  role: string
): Promise<{ allowed: boolean; status?: number; message?: string }> {
  const lessonRows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (lessonRows.length === 0) {
    return { allowed: false, status: 404, message: 'Lesson not found' };
  }

  const lesson = lessonRows[0];

  if (role === 'instructor' && lesson.courseId) {
    const courseRows = await db.select().from(courses).where(eq(courses.id, lesson.courseId)).limit(1);
    if (courseRows.length > 0 && courseRows[0].instructorId === userId) {
      return { allowed: true };
    }
  }

  if (lesson.isFree) {
    return { allowed: true };
  }

  if (lesson.courseId) {
    const enr = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, userId), eq(enrollments.courseId, lesson.courseId)))
      .limit(1);
    if (enr.length > 0) {
      return { allowed: true };
    }
  }

  return { allowed: false, status: 403, message: 'Access denied' };
}

router.get('/:lessonId/:filename', requireAuth, async (req: Request, res: Response) => {
  try {
    const { lessonId, filename } = req.params;
    const userId = req.user!.id;
    const role = req.user!.role;

    if (!SEGMENT_RE.test(filename) && !PLAYLIST_RE.test(filename)) {
      return res.status(400).json({ message: 'Invalid file name' });
    }

    const access = await verifyLessonAccess(lessonId, userId, role);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
    }

    const objectName = `${getHlsObjectPrefix(lessonId)}${filename}`;

    const stream = await minioClient.getObject(HLS_BUCKET, objectName);
    const contentType = filename.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('segment stream error', err);
      if (!res.headersSent) {
        return res.status(500).json({ message: 'Internal server error' });
      }
    });
  } catch (err) {
    console.error('video stream error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:lessonId/playlist.m3u8', requireAuth, async (req: Request, res: Response) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user!.id;
    const role = req.user!.role;

    const access = await verifyLessonAccess(lessonId, userId, role);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
    }

    const playlistKey = getHlsPlaylistKey(lessonId);
    const stream = await minioClient.getObject(HLS_BUCKET, playlistKey);

    let body = '';
    stream.on('data', (chunk) => {
      body += chunk;
    });

    stream.on('end', () => {
      const baseUrl = `/api/videos/${lessonId}/`;
      const rewritten = body
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (SEGMENT_RE.test(trimmed)) {
            return baseUrl + trimmed;
          }
          return line;
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/x-mpegURL');
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.send(rewritten);
    });

    stream.on('error', (err) => {
      console.error('playlist fetch error', err);
      if (!res.headersSent) {
        return res.status(500).json({ message: 'Internal server error' });
      }
    });
  } catch (err) {
    console.error('playlist error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
