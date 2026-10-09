import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chatCompletion } from '../src/lib/deepseek';
import { withProviderBudget } from '../src/lib/providerBudget';
import { rateLimitRedis } from '../src/middleware/rateLimit';
import { isTestPaymentsEnabled, canSimulatePayment } from '../src/lib/payments';
import { pool } from '../src/db';
after(async()=>{await pool.end();});

test('production mock requires an isolated demo database, buckets and test-user allowlist', () => {
  const saved = {...process.env};
  try {
    Object.assign(process.env,{NODE_ENV:'production',PAYMENT_PROVIDER:'paymob_mock',APP_MODE:'live',DATABASE_URL:'postgresql://app:password@localhost/nudra',MINIO_BUCKET_PREFIX:'nudra'});
    assert.equal(isTestPaymentsEnabled(),false);
    process.env.APP_MODE='demo'; process.env.DATABASE_URL='postgresql://app:password@localhost/nudra_demo';
    assert.equal(isTestPaymentsEnabled(),false);
    process.env.MINIO_BUCKET_PREFIX='nudra-demo';
    process.env.MOCK_PAYMENT_ALLOWED_EMAILS='';
    assert.equal(canSimulatePayment('qa@example.test'),false);
    process.env.MOCK_PAYMENT_ALLOWED_EMAILS='qa@example.test';
    assert.equal(canSimulatePayment('qa@example.test'),true);
    assert.equal(canSimulatePayment('someone@example.test'),false);
  } finally { for(const key of Object.keys(process.env)) if(!(key in saved)) delete process.env[key]; Object.assign(process.env,saved); }
});

test('provider boundary limits concurrent calls and hides upstream response bodies', async () => {
  assert.equal(process.env.NUDRA_DISPOSABLE_TESTS,'true','Run only against disposable Redis');
  const saved={...process.env};
  const server=createServer((_req,res)=>{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"message":"secret-prompt-content"}');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address(); assert.ok(address && typeof address !== 'string');
  let release!:()=>void;
  try {
    process.env.AI_ENVIRONMENT='development'; process.env.DEEPSEEK_PROXY_URL=`http://127.0.0.1:${address.port}`;
    await assert.rejects(chatCompletion([{role:'user',content:'fixture'}]),error=>error instanceof Error && error.message.includes('503') && !error.message.includes('secret-prompt-content'));
    process.env.AI_MAX_INFLIGHT='1';
    let started!:()=>void; const active=new Promise<void>(resolve=>started=resolve);
    const first=withProviderBudget('chat',async()=>{started();await new Promise<void>(resolve=>release=resolve);});
    await active;
    await assert.rejects(withProviderBudget('chat',async()=>{}),error=>typeof error==='object' && error!==null && 'status' in error && error.status===429);
    release(); await first;
    await withProviderBudget('chat',async()=>{});
  } finally {
    release?.(); await new Promise<void>(resolve=>server.close(()=>resolve()));
    for(const key of Object.keys(process.env)) if(!(key in saved)) delete process.env[key]; Object.assign(process.env,saved);
    await rateLimitRedis.quit();
  }
});
