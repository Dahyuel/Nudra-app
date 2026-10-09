import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { rateLimitRedis } from './rateLimit';

export function resourceLock(scope: string, perUser = false): RequestHandler {
  return async (req,res,next) => {
    const key=`nudra:generation:${scope}:${perUser ? req.user?.id+':' : ''}${req.params.lessonId}`;
    const token=randomUUID();
    try {
      if (!(await rateLimitRedis.set(key,token,'PX',200000,'NX'))) return res.status(409).json({message:'Generation is already in progress. Try again shortly.'});
      const release=()=>void rateLimitRedis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,key,token).catch(()=>{});
      res.once('finish',release);res.once('close',release);
      next();
    } catch {res.status(503).json({message:'Generation could not be scheduled.'});}
  };
}
