import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db';

type Mail = {to:string;subject:string;html:string;from:string};
function key() {
  const configured=process.env.EMAIL_OUTBOX_KEY;
  if (process.env.NODE_ENV==='production' && !/^[0-9a-f]{64}$/i.test(configured??'')) throw new Error('EMAIL_OUTBOX_KEY must be a 32-byte hex key');
  return configured && /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured,'hex') : createHash('sha256').update('local-development-outbox-only').digest();
}
function encrypt(mail:Mail) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(mail)),cipher.final()]);
  return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64')).join('.');
}
function decrypt(payload:string):Mail {
  const [iv,tag,body]=payload.split('.').map(v=>Buffer.from(v,'base64'));
  const decipher=createDecipheriv('aes-256-gcm',key(),iv);decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString());
}
export async function queueEmail(mail:Mail, executor: Pick<typeof db, 'execute'> = db) {
  await executor.execute(sql`INSERT INTO email_outbox(payload) VALUES(${encrypt(mail)})`);
}
let draining=false;
export async function drainEmailOutbox() {
  if(draining || !process.env.RESEND_API_KEY || (process.env.NODE_ENV!=='production' && process.env.ENABLE_EMAIL_DELIVERY!=='true')) return;
  draining=true;
  try {
    const claimed=await db.execute(sql`WITH chosen AS (SELECT id FROM email_outbox WHERE delivered_at IS NULL AND attempts<8 AND available_at<=now() ORDER BY available_at LIMIT 10 FOR UPDATE SKIP LOCKED)
      UPDATE email_outbox e SET attempts=attempts+1,available_at=now()+interval '5 minutes' FROM chosen c WHERE e.id=c.id RETURNING e.id,e.payload`);
    for(const row of claimed.rows as {id:string;payload:string}[]) {
      try {
        const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'nudra-email-'+row.id},body:JSON.stringify(decrypt(row.payload)),signal:AbortSignal.timeout(15000)});
        if(!result.ok) throw new Error('Provider rejected email');
        await db.execute(sql`UPDATE email_outbox SET delivered_at=now(),last_error=NULL WHERE id=${row.id}`);
      } catch {await db.execute(sql`UPDATE email_outbox SET last_error='Email delivery failed',available_at=now()+least(3600,power(2,attempts)::int*30)*interval '1 second' WHERE id=${row.id}`);}
    }
  } finally {draining=false;}
}
