import { Queue } from 'bullmq';
import { getRedisUrl } from './redisConnection';

const connection = {
  url: getRedisUrl(),
};

export const videoQueue = new Queue('video-transcoding', { connection, defaultJobOptions: {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10000 },
  removeOnComplete: { age: 86400, count: 500 },
  removeOnFail: { age: 604800, count: 1000 },
} });
