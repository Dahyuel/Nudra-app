import { sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { videoQueue } from './queue';

export async function operationalSnapshot() {
 const result=await db.execute(sql`SELECT
  (SELECT count(*)::int FROM email_outbox WHERE delivered_at IS NULL AND attempts>=8) AS failed_mail,
  (SELECT count(*)::int FROM email_outbox WHERE delivered_at IS NULL AND created_at<now()-interval '10 minutes') AS delayed_mail,
  (SELECT count(*)::int FROM object_cleanup_tasks WHERE finished_at IS NULL AND attempts>=10) AS failed_cleanup,
  (SELECT count(*)::int FROM video_jobs WHERE status IN('error','transcript_failed')) AS failed_video,
  (SELECT count(*)::int FROM video_jobs WHERE status IN('pending','transcoding','transcribed') AND updated_at<now()-interval '30 minutes') AS stalled_video,
  (SELECT coalesce(sum(bytes),0)::text FROM media_storage_usage) AS media_bytes`);
 const counts=await videoQueue.getJobCounts('waiting','active','delayed','failed');
 return {database:result.rows[0],queue:counts,pool:{total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount},memory:process.memoryUsage()};
}
