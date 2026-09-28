import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

const REDIS_URL: string = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: false,
});

redis.on('error', (err) => {
  console.warn('rate limit redis error', err);
});

interface RateLimiterOptions {
  keyPrefix: string;
  maxRequests: number;
  windowSeconds: number;
  errorMessage: string;
}

export function createRateLimiter({
  keyPrefix,
  maxRequests,
  windowSeconds,
  errorMessage,
}: RateLimiterOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next();
      }

      const key = `${keyPrefix}:${userId}`;
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (count > maxRequests) {
        return res.status(429).json({ error: errorMessage, retryAfter: windowSeconds });
      }

      return next();
    } catch (err) {
      console.warn('rate limiter error', err);
      return next();
    }
  };
}
