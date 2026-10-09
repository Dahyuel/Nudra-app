import { lessonAccess } from '../lib/access';
import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { lessons, courses, enrollments, orgMemberships } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';
import { createRedisRateLimitStore } from '../middleware/rateLimit';
import { r2Client, HLS_BUCKET, getHlsPlaylistKey, getHlsObjectPrefix, storage } from '../lib/minio';

const router = Router();

const SEGMENT_RE = /^segment_\d+\.ts$/i;
const PLAYLIST_RE = /^index\.m3u8$/i;

const videoRateLimiter = rateLimit({
  windowMs: Number(process.env.VIDEO_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  max: Number(process.env.VIDEO_RATE_LIMIT_MAX || 300),
  keyGenerator: req => req.user!.id,
  store: createRedisRateLimitStore('nudra:media:user'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many video requests, please try again later' },
});

router.use(requireAuth, videoRateLimiter);

async function verifyLessonAccess(lessonId: string, userId: string, role: string, organizationId?: string) {
  return lessonAccess(lessonId, userId, role, organizationId ?? null);
}

router.get('/:lessonId/playlist.m3u8', async (req: Request, res: Response) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user!.id;
    const role = req.user!.role;

    const access = await verifyLessonAccess(lessonId, userId, role, req.organization?.id);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
    }

    const playlistKey = access.lesson?.videoUrl ?? getHlsPlaylistKey(lessonId);
    const stream = await storage.getObject(HLS_BUCKET, playlistKey);

    let body = '';
    res.once('close',() => {if (!res.writableEnded) stream.destroy();});
    stream.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1048576) stream.destroy(new Error('Playlist too large'));
    });

    stream.on('end', () => {
      const generation = playlistKey.split('/').length === 4 ? playlistKey.split('/')[2] : '';
      const baseUrl = `/api/videos/${lessonId}/${generation ? generation + '/' : ''}`;
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
      } else {res.destroy(err);}
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'NoSuchKey') {
      return res.status(404).json({ message: 'Video not found' });
    }
    console.error('playlist error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Must stay below the playlist route: this pattern also matches "playlist.m3u8".

router.get(['/:lessonId/:filename','/:lessonId/:generation/:filename'], async (req: Request, res: Response) => {
  try {
    const { lessonId, filename } = req.params;
    const userId = req.user!.id;
    const role = req.user!.role;

    if (!SEGMENT_RE.test(filename) && !PLAYLIST_RE.test(filename)) {
      return res.status(400).json({ message: 'Invalid file name' });
    }

    const access = await verifyLessonAccess(lessonId, userId, role, req.organization?.id);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
    }

    const playlistKey = access.lesson?.videoUrl ?? getHlsPlaylistKey(lessonId);
    const prefix = playlistKey.slice(0,playlistKey.lastIndexOf('/')+1);
    const generation = playlistKey.split('/').length === 4 ? playlistKey.split('/')[2] : undefined;
    if (req.params.generation !== generation) return res.status(404).json({message:'Video generation not found'});
    const objectName = `${prefix}${filename}`;

    const stream = await storage.getObject(HLS_BUCKET, objectName);
    const contentType = filename.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.once('close',() => {if (!res.writableEnded) stream.destroy();});
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('segment stream error', err);
      if (!res.headersSent) {
        return res.status(500).json({ message: 'Internal server error' });
      } else res.destroy(err);
    });
  } catch (err) {
    console.error('video stream error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
