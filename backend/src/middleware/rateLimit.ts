import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import type { Options, Store, ClientRateLimitInfo } from 'express-rate-limit';
import { getRedisUrl } from '../lib/redisConnection';

export const rateLimitRedis = new Redis(getRedisUrl(), {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: true,
  connectTimeout: 2500,
  retryStrategy: () => 1000,
});
const redis = rateLimitRedis;

redis.on('error', (err) => {
  console.warn('rate limit redis error', err);
});

const INCREMENT_SCRIPT = `
local total = redis.call('INCR', KEYS[1])
if total == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { total, ttl }
`;

const DECREMENT_SCRIPT = `
local total = tonumber(redis.call('GET', KEYS[1]) or '0')
if total <= 1 then return redis.call('DEL', KEYS[1]) end
return redis.call('DECR', KEYS[1])
`;

/** Fixed-window store backed by the VPS's private Redis instance. */
export function createRedisRateLimitStore(prefix: string): Store {
  let windowMs = 60_000;
  const keyFor = (key: string) => `${prefix}:${key}`;

  return {
    prefix,
    localKeys: false,
    init(options: Options) {
      windowMs = options.windowMs;
    },
    async increment(key: string): Promise<ClientRateLimitInfo> {
      const result = await redis.eval(INCREMENT_SCRIPT, 1, keyFor(key), String(windowMs)) as [number | string, number | string];
      const totalHits = Number(result[0]);
      const ttl = Number(result[1]);
      return { totalHits, resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
    },
    async decrement(key: string): Promise<void> {
      await redis.eval(DECREMENT_SCRIPT, 1, keyFor(key));
    },
    async resetKey(key: string): Promise<void> {
      await redis.del(keyFor(key));
    },
  };
}

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
      const result = await redis.eval(INCREMENT_SCRIPT, 1, key, String(windowSeconds * 1000)) as [number, number];
      const count = Number(result[0]);

      if (count > maxRequests) {
        return res.status(429).json({ error: errorMessage, retryAfter: windowSeconds });
      }

      return next();
    } catch (err) {
      console.warn('rate limiter error', err);
      return res.status(503).json({ message: 'Request limits could not be verified. Try again shortly.' });
    }
  };
}
