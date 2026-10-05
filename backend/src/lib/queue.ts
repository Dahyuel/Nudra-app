import { Queue } from 'bullmq';
import { getRedisUrl } from './redisConnection';

const connection = {
  url: getRedisUrl(),
};

export const videoQueue = new Queue('video-transcoding', { connection });
