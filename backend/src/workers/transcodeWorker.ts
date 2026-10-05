import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import fsSync, { createReadStream } from 'fs';
import { Worker } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import OpenAI from 'openai';
import axios from 'axios';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { videoJobs, lessons, lessonChunks } from '../db/schema';
import { r2Client, storage, downloadObject, removeObject, RAW_VIDEO_BUCKET, HLS_BUCKET, getHlsPlaylistKey, listRawVideoKeys } from '../lib/minio';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { embedText, getEmbeddingProvider } from '../lib/embeddings';
import { getRedisUrl } from '../lib/redisConnection';

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
  url: getRedisUrl(),
};


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

function extractGroqAudioChunks(inputPath: string, outputPattern: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate('24k')
      .outputOptions(['-f', 'segment', '-segment_time', '600', '-reset_timestamps', '1'])
      .output(outputPattern)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

async function removeRawVideos(lessonId: string) {
  for (const key of await listRawVideoKeys(lessonId)) {
    try {
      await removeObject(RAW_VIDEO_BUCKET, key);
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
async function transcribeAndEmbed(lessonId: string, localRawPath: string, minioKey: string) {
  let transcriptText: string;
  let transcriptSegments: string | null;
  try {
    const transcriptionProvider = process.env.TRANSCRIPTION_PROVIDER || 'auto';
    const useGroq = transcriptionProvider === 'groq' ||
      (transcriptionProvider === 'auto' && process.env.AI_ENVIRONMENT === 'production');
    if (useGroq) {
      if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is required when TRANSCRIPTION_PROVIDER=groq');
      const client = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: (process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
      });
      const audioDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nudra-groq-audio-'));
      try {
        const chunkPattern = path.join(audioDir, 'audio-%03d.mp3');
        await extractGroqAudioChunks(localRawPath, chunkPattern);
        const audioFiles = (await fs.readdir(audioDir)).filter((file) => file.endsWith('.mp3')).sort();
        if (audioFiles.length === 0) throw new Error('No audio track was found in this video');
        const texts: string[] = [];
        const segments: Record<string, unknown>[] = [];
        for (let i = 0; i < audioFiles.length; i++) {
          const transcription = await client.audio.transcriptions.create({
            file: fsSync.createReadStream(path.join(audioDir, audioFiles[i])),
            model: process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo',
            response_format: 'verbose_json',
          });
          if (transcription.text?.trim()) texts.push(transcription.text.trim());
          const chunkSegments = (transcription as { segments?: Record<string, unknown>[] }).segments ?? [];
          segments.push(...chunkSegments.map((segment) => ({
            ...segment,
            start: Number(segment.start || 0) + i * 600,
            end: Number(segment.end || 0) + i * 600,
          })));
        }
        transcriptText = texts.join(' ').trim();
        transcriptSegments = segments.length ? JSON.stringify(segments) : null;
      } finally {
        await fs.rm(audioDir, { recursive: true, force: true });
      }
    } else {
      const whisperUrl = (process.env.WHISPER_URL || 'http://localhost:5001').replace(/\/$/, '');
      const { data } = await axios.post(`${whisperUrl}/transcribe`, { minio_key: minioKey }, {
        headers: { 'X-API-Key': process.env.WHISPER_API_KEY || process.env.SESSION_SECRET || '' },
        timeout: 30 * 60 * 1000,
      });
      transcriptText = (data.transcript ?? '').trim();
      transcriptSegments = data.segments ? JSON.stringify(data.segments) : null;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Transcription failed: ${message}`);
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
        embeddingProvider: getEmbeddingProvider(),
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
        const rawPath = path.join(os.tmpdir(), path.basename(minioKey));
        await downloadObject(RAW_VIDEO_BUCKET, minioKey, rawPath);
        const result = await transcribeAndEmbed(lessonId, rawPath, minioKey);
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

      await downloadObject(RAW_VIDEO_BUCKET, minioKey, rawPath);

      await runFfmpeg(rawPath, hlsDir);

      const files = await fs.readdir(hlsDir);
      for (const file of files) {
        const filePath = path.join(hlsDir, file);
        const stat = await fs.stat(filePath);
        const contentType = file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T';
        await storage.putObject(HLS_BUCKET, `lessons/${lessonId}/${file}`, createReadStream(filePath), stat.size, {
          'Content-Type': contentType,
        });
      }

      const hlsPath = getHlsPlaylistKey(lessonId);

      await db.update(lessons).set({ videoUrl: hlsPath }).where(eq(lessons.id, lessonId));

      // Video is playable from here on; the transcript step runs next.
      await setJobStatus(lessonId, { status: 'transcribed', hlsUrl: hlsPath });

      try {
        const retryRawPath = path.join(os.tmpdir(), path.basename(minioKey));
        await downloadObject(RAW_VIDEO_BUCKET, minioKey, retryRawPath);
        const result = await transcribeAndEmbed(lessonId, retryRawPath, minioKey);
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
