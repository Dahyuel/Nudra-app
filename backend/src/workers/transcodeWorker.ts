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
import { minioClient, RAW_VIDEO_BUCKET, HLS_BUCKET, getHlsPlaylistKey } from '../lib/minio';
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

const worker = new Worker(
  'video-transcoding',
  async (job) => {
    const { lessonId, minioKey } = job.data as { lessonId: string; minioKey: string };

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

      await setJobStatus(lessonId, { status: 'transcribed', hlsUrl: hlsPath });

      let transcriptText: string | null = null;
      let transcriptSegments: string | null = null;

      try {
        const { data } = await axios.post(
          `${WHISPER_URL}/transcribe`,
          { minio_key: minioKey },
          { headers: { 'X-API-Key': process.env.WHISPER_API_KEY || process.env.SESSION_SECRET || '' } }
        );
        transcriptText = data.transcript ?? null;
        transcriptSegments = data.segments ? JSON.stringify(data.segments) : null;
      } catch (whisperErr) {
        console.error('whisper transcription error', whisperErr);
      }

      // Step I — Chunk and embed transcript
      if (transcriptText && transcriptText.length >= MIN_CHUNK_SIZE) {
        try {
          const chunks = chunkText(transcriptText);

          for (let i = 0; i < chunks.length; i++) {
            const embedding = await embedText(chunks[i]);
            await db.insert(lessonChunks).values({
              lessonId,
              chunkIndex: i,
              content: chunks[i],
              embedding: sql`${JSON.stringify(embedding)}::vector(768)`,
            });
          }

          console.log(`embedded ${chunks.length} chunks for lesson ${lessonId}`);
        } catch (embedErr) {
          const message = embedErr instanceof Error ? embedErr.message : String(embedErr);
          console.warn(`embedding failed for lesson ${lessonId}: ${message}`);
        }
      }

      // Remove raw source video from private storage after successful transcoding
      try {
        await minioClient.removeObject(RAW_VIDEO_BUCKET, minioKey);
        console.log(`removed raw video for lesson ${lessonId}`);
      } catch (removeErr) {
        console.warn(`failed to remove raw video for lesson ${lessonId}`, removeErr);
      }

      await setJobStatus(lessonId, {
        status: 'done',
        transcriptText,
        transcriptSegments,
      });
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