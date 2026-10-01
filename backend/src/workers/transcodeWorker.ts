import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { Worker } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import axios from 'axios';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { videoJobs, lessons, lessonChunks } from '../db/schema';
import { minioClient, RAW_VIDEO_BUCKET, HLS_BUCKET, getHlsPlaylistKey, listRawVideoKeys } from '../lib/minio';
import { embedText } from '../lib/embeddings';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const TARGET_CHUNK_SIZE = 1200; // ~300 tokens at ~4 chars/token
const CHUNK_OVERLAP = 200; // ~50 tokens
const MIN_CHUNK_SIZE = 100;

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + TARGET_CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length >= MIN_CHUNK_SIZE) {
      chunks.push(chunk);
    }
    if (end === text.length) break;
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

const WHISPER_URL = process.env.WHISPER_URL || 'http://localhost:5001';

async function setJobStatus(
  lessonId: string,
  values: Partial<{
    status: string;
    hlsUrl: string | null;
    transcriptText: string | null;
    transcriptSegments: string | null;
    errorMsg: string | null;
  }>
) {
  await db
    .update(videoJobs)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(videoJobs.lessonId, lessonId));
}

function runFfmpeg(inputPath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-profile:v baseline',
        '-level 3.0',
        '-start_number 0',
        '-hls_time 6',
        '-hls_list_size 0',
        '-hls_playlist_type vod',
        '-hls_segment_filename',
        path.join(outputDir, 'segment_%03d.ts'),
        '-c:v libx264',
        '-crf 23',
        '-c:a aac',
        '-f hls',
      ])
      .output(path.join(outputDir, 'index.m3u8'))
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

async function removeRawVideos(lessonId: string) {
  for (const key of await listRawVideoKeys(lessonId)) {
    try {
      await minioClient.removeObject(RAW_VIDEO_BUCKET, key);
    } catch (err) {
      console.warn(`failed to remove raw video ${key}`, err);
    }
  }
}

/**
 * Whisper transcript + embeddings for the AI features (summary, flashcards, quiz
 * generation, tutor context). Throws with a readable message on failure so the
 * job can be marked `transcript_failed` instead of silently reporting success.
 */
async function transcribeAndEmbed(lessonId: string, minioKey: string) {
  let transcriptText: string;
  let transcriptSegments: string | null;
  try {
    const { data } = await axios.post(
      `${WHISPER_URL}/transcribe`,
      { minio_key: minioKey },
      {
        headers: { 'X-API-Key': process.env.WHISPER_API_KEY || process.env.SESSION_SECRET || '' },
        timeout: 30 * 60 * 1000,
      }
    );
    transcriptText = (data.transcript ?? '').trim();
    transcriptSegments = data.segments ? JSON.stringify(data.segments) : null;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (!err.response) throw new Error(`Transcription service unreachable at ${WHISPER_URL}`);
      if (err.response.status === 401) throw new Error('Transcription service rejected the API key (check WHISPER_API_KEY)');
      throw new Error(`Transcription failed (HTTP ${err.response.status})`);
    }
    throw err;
  }

  if (!transcriptText) throw new Error('No speech was detected in this video');

  // Short transcripts fall below the chunk minimum; keep them as a single chunk.
  const chunks = chunkText(transcriptText);
  if (chunks.length === 0) chunks.push(transcriptText);

  let embeddings: number[][];
  try {
    embeddings = [];
    for (const chunk of chunks) embeddings.push(await embedText(chunk));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Transcript created but embedding failed: ${message}`);
  }

  // Replace any chunks from an earlier attempt so retries don't duplicate them.
  await db.transaction(async (tx) => {
    await tx.delete(lessonChunks).where(eq(lessonChunks.lessonId, lessonId));
    for (let i = 0; i < chunks.length; i++) {
      await tx.insert(lessonChunks).values({
        lessonId,
        chunkIndex: i,
        content: chunks[i],
        embedding: sql`${JSON.stringify(embeddings[i])}::vector(768)`,
      });
    }
  });
  console.log(`embedded ${chunks.length} chunks for lesson ${lessonId}`);

  return { transcriptText, transcriptSegments };
}

const worker = new Worker(
  'video-transcoding',
  async (job) => {
    const { lessonId, minioKey, transcriptOnly } = job.data as {
      lessonId: string;
      minioKey: string;
      transcriptOnly?: boolean;
    };

    // Retry path: the video is already transcoded; only redo the transcript.
    if (transcriptOnly) {
      try {
        await setJobStatus(lessonId, { status: 'transcribed', errorMsg: null });
        const result = await transcribeAndEmbed(lessonId, minioKey);
        await removeRawVideos(lessonId);
        await setJobStatus(lessonId, { status: 'done', ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`transcript retry failed for lesson ${lessonId}: ${message}`);
        await setJobStatus(lessonId, { status: 'transcript_failed', errorMsg: message }).catch(() => {});
      }
      return;
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nudra-transcode-'));
    const rawPath = path.join(tmpDir, path.basename(minioKey));
    const hlsDir = path.join(tmpDir, 'hls');

    try {
      await setJobStatus(lessonId, { status: 'transcoding', errorMsg: null });

      await fs.mkdir(hlsDir, { recursive: true });

      await minioClient.fGetObject(RAW_VIDEO_BUCKET, minioKey, rawPath);

      await runFfmpeg(rawPath, hlsDir);

      const files = await fs.readdir(hlsDir);
      for (const file of files) {
        const filePath = path.join(hlsDir, file);
        const stat = await fs.stat(filePath);
        const contentType = file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T';
        await minioClient.putObject(HLS_BUCKET, `lessons/${lessonId}/${file}`, createReadStream(filePath), stat.size, {
          'Content-Type': contentType,
        });
      }

      const hlsPath = getHlsPlaylistKey(lessonId);

      await db.update(lessons).set({ videoUrl: hlsPath }).where(eq(lessons.id, lessonId));

      // Video is playable from here on; the transcript step runs next.
      await setJobStatus(lessonId, { status: 'transcribed', hlsUrl: hlsPath });

      try {
        const result = await transcribeAndEmbed(lessonId, minioKey);
        // Only delete the raw upload once everything succeeded: Whisper reads the
        // raw file, so keeping it on failure is what makes "Retry transcript" possible.
        await removeRawVideos(lessonId);
        await setJobStatus(lessonId, { status: 'done', ...result });
      } catch (transcriptErr) {
        const message = transcriptErr instanceof Error ? transcriptErr.message : String(transcriptErr);
        console.error(`transcript failed for lesson ${lessonId}: ${message}`);
        await setJobStatus(lessonId, { status: 'transcript_failed', errorMsg: message });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('transcode worker error', err);
      try {
        await setJobStatus(lessonId, { status: 'error', errorMsg: message });
      } catch (updateErr) {
        console.error('failed to record job error', updateErr);
      }
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error('temp cleanup error', cleanupErr);
      }
    }
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error(`video-transcoding job ${job?.id} failed`, err);
});

export default worker;