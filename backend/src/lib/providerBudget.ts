import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestHandler, Request } from 'express';
import { rateLimitRedis } from '../middleware/rateLimit';

const context = new AsyncLocalStorage<{ request: Request; signal: AbortSignal }>();
export const providerContext: RequestHandler = (req, res, next) => {
  const controller = new AbortController();
  res.once('close', () => { if (!res.writableEnded) controller.abort(); });
  context.run({ request: req, signal: controller.signal }, next);
};

const RESERVE = `
local now=tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now)
if redis.call('ZCARD',KEYS[1])>=tonumber(ARGV[3]) then return 0 end
local global=tonumber(redis.call('GET',KEYS[2]) or '0')
local user=tonumber(redis.call('GET',KEYS[3]) or '0')
local tenant=tonumber(redis.call('GET',KEYS[4]) or '0')
if global>=tonumber(ARGV[4]) or user>=tonumber(ARGV[5]) or tenant>=tonumber(ARGV[7]) then return 0 end
redis.call('INCR',KEYS[2]);redis.call('EXPIRE',KEYS[2],86400)
redis.call('INCR',KEYS[3]);redis.call('EXPIRE',KEYS[3],86400)
redis.call('INCR',KEYS[4]);redis.call('EXPIRE',KEYS[4],86400)
redis.call('ZADD',KEYS[1],now+tonumber(ARGV[6]),ARGV[2]);redis.call('EXPIRE',KEYS[1],300)
return 1`;

/** Shared by every provider-calling route and worker; fails closed. */
export async function withProviderBudget<T>(kind: 'chat' | 'embedding' | 'transcription', run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const current = context.getStore();
  const actor = current?.request.user?.id ?? 'worker';
  const day = new Date().toISOString().slice(0, 10);
  const token = randomUUID();
  const lease = `nudra:ai:inflight:${kind}`;
  const timeout = kind === 'embedding' ? 30000 : 90000;
  const limit = kind === 'chat' ? Number(process.env.AI_DAILY_CALL_LIMIT) || 1000 : kind === 'embedding' ? Number(process.env.EMBEDDING_DAILY_CALL_LIMIT) || 10000 : Number(process.env.TRANSCRIPTION_DAILY_CALL_LIMIT) || 500;
  const tenant=current?.request.organization?.id ?? 'platform';
  const reserved = await rateLimitRedis.eval(RESERVE, 4, lease, `nudra:ai:day:${kind}:${day}`, `nudra:ai:user:${kind}:${day}:${actor}`, `nudra:ai:tenant:${kind}:${day}:${tenant}`,
    Date.now(), token, Number(process.env.AI_MAX_INFLIGHT) || 4, limit, actor === 'worker' ? limit : 100, timeout + 5000, tenant==='platform'?limit:Math.ceil(limit/2));
  if (Number(reserved) !== 1) throw Object.assign(new Error('AI request budget exhausted'), { status: 429 });
  const signal = current ? AbortSignal.any([current.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
  try { return await run(signal); } finally { await rateLimitRedis.zrem(lease, token).catch(() => {}); }
}
