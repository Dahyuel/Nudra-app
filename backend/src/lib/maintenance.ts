import { sql } from 'drizzle-orm';
import { db } from '../db';
import { drainEmailOutbox } from './emailOutbox';
import { storage, HLS_BUCKET, RAW_VIDEO_BUCKET } from './minio';
import { videoQueue } from './queue';
let running=false;
export async function maintenance() {
 if(running)return;running=true;
 try {
  await drainEmailOutbox();
  const pending=await db.execute(sql`SELECT lesson_id,generation_id,raw_key FROM video_jobs WHERE status='pending' AND generation_id IS NOT NULL AND raw_key IS NOT NULL LIMIT 20`);
  for(const job of pending.rows as {lesson_id:string;generation_id:string;raw_key:string}[]) {
   if(!(await videoQueue.getJob(job.generation_id)))await videoQueue.add('transcode',{lessonId:job.lesson_id,generationId:job.generation_id,minioKey:job.raw_key},{jobId:job.generation_id});
   await db.execute(sql`DELETE FROM video_upload_sessions WHERE id=${job.generation_id}::uuid AND status='completed'`);
  }
  await db.execute(sql`DELETE FROM sessions WHERE expires_at<now(); DELETE FROM password_reset_tokens WHERE expires_at<now(); DELETE FROM email_verification_tokens WHERE expires_at<now(); DELETE FROM exam_assignments WHERE started_at<now()-interval '90 days'; DELETE FROM email_outbox WHERE delivered_at<now()-interval '30 days'; DELETE FROM security_audit_events WHERE created_at<now()-interval '365 days'`);
  const tasks=await db.execute(sql`WITH chosen AS(SELECT id FROM object_cleanup_tasks WHERE finished_at IS NULL AND available_at<=now() AND attempts<10 ORDER BY available_at LIMIT 5 FOR UPDATE SKIP LOCKED)
    UPDATE object_cleanup_tasks t SET attempts=attempts+1,available_at=now()+interval '10 minutes' FROM chosen c WHERE t.id=c.id RETURNING t.*`);
  for(const task of tasks.rows as {id:string;bucket:string;prefix:string}[]) {
   if(![HLS_BUCKET,RAW_VIDEO_BUCKET].includes(task.bucket)||!/^lessons\//.test(task.prefix))continue;
   try {
    for await(const object of storage.listObjectsV2(task.bucket,task.prefix))if(object.name)await storage.removeObject(task.bucket,object.name);
    await db.execute(sql`UPDATE object_cleanup_tasks SET finished_at=now() WHERE id=${task.id}`);
    if(task.bucket===HLS_BUCKET)await db.execute(sql`DELETE FROM media_storage_usage WHERE hls_prefix LIKE ${task.prefix+'%'}`);
   } catch {console.warn(JSON.stringify({type:'object_cleanup_failed',taskId:task.id}));}
  }
 } finally {running=false;}
}
