import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import fsSync, { createReadStream } from 'fs';
import { Worker } from 'bullmq';
import { spawn, type ChildProcess } from 'node:child_process';
import OpenAI from 'openai';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { withProviderBudget } from '../lib/providerBudget';
import { eq, sql, and } from 'drizzle-orm';
import { db } from '../db';
import { videoJobs, lessons, lessonChunks, lessonSummaries, flashcards } from '../db/schema';
import { r2Client, storage, downloadObject, removeObject, RAW_VIDEO_BUCKET, HLS_BUCKET, getHlsPlaylistKey, listRawVideoKeys } from '../lib/minio';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { embedText, getEmbeddingProvider } from '../lib/embeddings';
import { getRedisUrl } from '../lib/redisConnection';

const activeCommands = new Set<ChildProcess>();
function runMediaCommand(args:string[]):Promise<void> {
 return new Promise((resolve,reject)=>{
  // Uploaded files must not become network-fetching HLS/concat manifests.
  const command=spawn(process.env.FFMPEG_PATH||'ffmpeg',['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,avi,mpeg,mpegts','-max_alloc','268435456','-filter_threads','1',...args],{stdio:['ignore','ignore','pipe']});
  activeCommands.add(command);let stderr='';
  command.stderr?.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4096);});
  const timer=setTimeout(()=>command.kill('SIGKILL'),Number(process.env.FFMPEG_TIMEOUT_MS)||20*60*1000);
  const finish=()=>{clearTimeout(timer);activeCommands.delete(command);};
  command.once('error',error=>{finish();reject(error);});
  command.once('close',(code,signal)=>{finish();if(code===0)resolve();else reject(new Error('FFmpeg failed: '+(signal||code)+' '+stderr));});
 });
}

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

function getWorkerConcurrency(): number {
  const configured = Number(process.env.TRANSCODE_CONCURRENCY ?? 1);
  if (!Number.isSafeInteger(configured) || configured < 1 || configured > 32) {
    throw new Error('TRANSCODE_CONCURRENCY must be an integer between 1 and 32');
  }
  return configured;
}


async function setJobStatus(
  lessonId: string,
  values: Partial<{
    status: string;
    hlsUrl: string | null;
    transcriptText: string | null;
    transcriptSegments: string | null;
    errorMsg: string | null;
  }>,
  generationId?: string
) {
  await db
    .update(videoJobs)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(videoJobs.lessonId, lessonId), generationId ? eq(videoJobs.generationId,generationId) : undefined));
}

function runFfmpeg(inputPath:string,outputDir:string):Promise<void> {
 return runMediaCommand(['-nostdin','-y','-threads','1','-i',inputPath,'-profile:v','baseline','-level','3.1','-threads','1','-t','7200','-vf','scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30','-start_number','0','-hls_time','6','-hls_list_size','0','-hls_playlist_type','vod','-hls_segment_filename',path.join(outputDir,'segment_%03d.ts'),'-c:v','libx264','-crf','23','-maxrate','2M','-bufsize','4M','-c:a','aac','-b:a','128k','-f','hls',path.join(outputDir,'index.m3u8')]);
}
function extractGroqAudioChunks(inputPath:string,outputPattern:string):Promise<void> {
 return runMediaCommand(['-nostdin','-y','-threads','1','-i',inputPath,'-vn','-c:a','libmp3lame','-ac','1','-ar','16000','-b:a','24k','-t','7200','-f','segment','-segment_time','600','-reset_timestamps','1',outputPattern]);
}

/**
 * Whisper transcript + embeddings for the AI features (summary, flashcards, quiz
 * generation, tutor context). Throws with a readable message on failure so the
 * job can be marked `transcript_failed` instead of silently reporting success.
 */
async function transcribeAndEmbed(lessonId: string, localRawPath: string, minioKey: string, generationId?: string) {
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
        timeout: 90000, maxRetries: 0,
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
          const transcription = await withProviderBudget('transcription',signal=>client.audio.transcriptions.create({
            file: fsSync.createReadStream(path.join(audioDir, audioFiles[i])),
            model: process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo',
            response_format: 'verbose_json',
          },{signal}));
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
      const { data } = await withProviderBudget('transcription',signal=>axios.post(`${whisperUrl}/transcribe`, { minio_key: minioKey }, {
        headers: { 'X-API-Key': process.env.WHISPER_API_KEY || process.env.SESSION_SECRET || '' },
        timeout: 90000, signal, maxContentLength: 1048576,
      }));
      transcriptText = (data.transcript ?? '').trim();
      transcriptSegments = data.segments ? JSON.stringify(data.segments) : null;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Transcription failed: ${message}`);
  }

  if (!transcriptText) throw new Error('No speech was detected in this video');
  if (Buffer.byteLength(transcriptText)>300000) throw new Error('Transcript exceeds the processing budget');

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
    const [current] = await tx.select().from(videoJobs).where(eq(videoJobs.lessonId, lessonId)).for('update');
    if (!current || (generationId && current.generationId !== generationId)) throw new Error('Obsolete video generation');
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
    const { lessonId, minioKey, transcriptOnly, generationId } = job.data as {
      lessonId: string;
      minioKey: string;
      transcriptOnly?: boolean;
      generationId?: string;
    };

    const [current] = await db.select().from(videoJobs).where(eq(videoJobs.lessonId,lessonId)).limit(1);
    if (!current || (generationId && current.generationId !== generationId)) return;
    if (current.status === 'done') return;
    const disk = await fs.statfs(os.tmpdir());
    if (disk.bavail * disk.bsize < 8 * 1024 ** 3) {
      await setJobStatus(lessonId,{status:'error',errorMsg:'Worker disk reserve is below 8 GiB'},generationId);
      throw new Error('Worker disk reserve is below 8 GiB');
    }
    const generation = generationId || current.generationId || randomUUID();
    if (!current.generationId) await db.update(videoJobs).set({generationId:generation,rawKey:minioKey}).where(eq(videoJobs.id,current.id));
    const status = (values: Parameters<typeof setJobStatus>[1]) => setJobStatus(lessonId,values,generation);
    const hlsPrefix = 'lessons/' + lessonId + '/' + generation + '/';
        // Retry path: the video is already transcoded; only redo the transcript.
    if (transcriptOnly) {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nudra-transcript-'));
      try {
        await status({ status: 'transcribed', errorMsg: null });
        const rawPath = path.join(tmpDir, path.basename(minioKey));
        await downloadObject(RAW_VIDEO_BUCKET, minioKey, rawPath);
        const result = await transcribeAndEmbed(lessonId, rawPath, minioKey, generationId);
        await removeObject(RAW_VIDEO_BUCKET,minioKey);
        const rawSize = (await fs.stat(rawPath)).size;
        await db.execute(sql`UPDATE media_storage_usage SET bytes=greatest(0,bytes-${rawSize}) WHERE generation_id=${generation}::uuid`);
        await status({ status: 'done', ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`transcript retry failed for lesson ${lessonId}: ${message}`);
        await status({ status: 'transcript_failed', errorMsg: message }).catch(() => {});
        throw err;
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch((cleanupErr) => {
          console.error('transcript retry temp cleanup error', cleanupErr);
        });
      }
      return;
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nudra-transcode-'));
    const rawPath = path.join(tmpDir, path.basename(minioKey));
    const hlsDir = path.join(tmpDir, 'hls');

    try {
      await status({ status: 'transcoding', errorMsg: null });

      await fs.mkdir(hlsDir, { recursive: true });

      await downloadObject(RAW_VIDEO_BUCKET, minioKey, rawPath);

      await runFfmpeg(rawPath, hlsDir);

      const files = await fs.readdir(hlsDir);
      let outputBytes=0;
      for (const file of files) {
        const filePath = path.join(hlsDir, file);
        const stat = await fs.stat(filePath);
        outputBytes+=stat.size;
        if(outputBytes>2*1024**3)throw new Error('Transcoded output exceeds the 2 GiB storage reservation');
        const contentType = file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T';
        await storage.putObject(HLS_BUCKET, `${hlsPrefix}${file}`, createReadStream(filePath), stat.size, {
          'Content-Type': contentType,
        });
      }

      const hlsPath = hlsPrefix + 'index.m3u8';
      const playlist = await fs.readFile(path.join(hlsDir,'index.m3u8'),'utf8');
      const durationSeconds = Math.ceil([...playlist.matchAll(/#EXTINF:([\d.]+)/g)].reduce((sum,m) => sum + Number(m[1]),0));

      await db.transaction(async tx => {
        const [latest] = await tx.select().from(videoJobs).where(eq(videoJobs.lessonId,lessonId)).for('update');
        if (!latest || (generationId && latest.generationId !== generationId)) throw new Error('Obsolete video generation');
        await tx.update(lessons).set({videoUrl:hlsPath,durationSeconds}).where(eq(lessons.id,lessonId));
        const owner=await tx.execute(sql`SELECT c.instructor_id,c.organization_id FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=${lessonId}`);
        const rawSize=(await fs.stat(rawPath)).size;
        await tx.execute(sql`INSERT INTO media_storage_usage(generation_id,lesson_id,instructor_id,organization_id,bytes,hls_prefix) VALUES(${generation},${lessonId},${owner.rows[0].instructor_id},${owner.rows[0].organization_id},${outputBytes+rawSize},${hlsPrefix}) ON CONFLICT(generation_id) DO UPDATE SET bytes=excluded.bytes`);
        if (latest.hlsUrl && latest.hlsUrl !== hlsPath) await tx.execute(sql`INSERT INTO object_cleanup_tasks(bucket,prefix,available_at) VALUES(${HLS_BUCKET},${latest.hlsUrl.slice(0,latest.hlsUrl.lastIndexOf('/')+1)},now()+interval '1 hour')`);
        await tx.delete(lessonSummaries).where(eq(lessonSummaries.lessonId,lessonId));
        await tx.delete(flashcards).where(eq(flashcards.lessonId,lessonId));
      });

      // Video is playable from here on; the transcript step runs next.
      await status({ status: 'transcribed', hlsUrl: hlsPath });

      try {
        const result = await transcribeAndEmbed(lessonId, rawPath, minioKey, generationId);
        // Only delete the raw upload once everything succeeded: Whisper reads the
        // raw file, so keeping it on failure is what makes "Retry transcript" possible.
        await removeObject(RAW_VIDEO_BUCKET, minioKey);
        await db.execute(sql`UPDATE media_storage_usage SET bytes=${outputBytes} WHERE generation_id=${generation}::uuid`);
        await status({ status: 'done', ...result });
      } catch (transcriptErr) {
        const message = transcriptErr instanceof Error ? transcriptErr.message : String(transcriptErr);
        console.error(`transcript failed for lesson ${lessonId}: ${message}`);
        await status({ status: 'transcript_failed', errorMsg: message });
        throw transcriptErr;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('transcode worker error', err);
      try {
        const [latest] = await db.select().from(videoJobs).where(eq(videoJobs.lessonId,lessonId)).limit(1);
        await status({ status: latest?.hlsUrl?.includes(`/${generation}/`) ? 'transcript_failed' : 'error', errorMsg: message });
      } catch (updateErr) {
        console.error('failed to record job error', updateErr);
      }
      throw err;
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error('temp cleanup error', cleanupErr);
      }
    }
  },
  { connection, concurrency: getWorkerConcurrency() }
);

worker.on('failed', (job, err) => {
  console.error(`video-transcoding job ${job?.id} failed`, err);
});

const heartbeatPath = process.env.WORKER_HEARTBEAT_PATH || '/tmp/nudra-worker-heartbeat';
const heartbeat = setInterval(() => {
  if (worker.isRunning()) void fs.writeFile(heartbeatPath, String(Date.now())).catch(() => {});
}, 10000);
heartbeat.unref();

let closing = false;
async function closeWorker(signal: NodeJS.Signals) {
  if (closing) return;
  closing = true;
  clearInterval(heartbeat);
  console.log(`Received ${signal}; waiting for active video jobs to finish`);
  try {
    const force = setTimeout(() => {for (const command of activeCommands) command.kill('SIGKILL');},45000);force.unref();
    await worker.close();
    clearTimeout(force);
    process.exit(0);
  } catch (err) {
    console.error('Failed to close video worker cleanly', err);
    process.exit(1);
  }
}

process.once('SIGTERM', () => void closeWorker('SIGTERM'));
process.once('SIGINT', () => void closeWorker('SIGINT'));

export default worker;
