import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { encodeBase32, encryptMfaSecret } from '../lib/totp';

async function main(){
 const email=process.argv[2]?.trim().toLowerCase();if(!email)throw new Error('Usage: node dist/scripts/admin-mfa.js admin@example.com');
 const secret=encodeBase32(randomBytes(20));
 await db.transaction(async tx=>{
  const result=await tx.execute(sql`SELECT id FROM users WHERE email=${email} AND role='admin' AND organization_id IS NULL FOR UPDATE`);
  const user=result.rows[0];if(!user)throw new Error('Global administrator account not found');
  await tx.execute(sql`INSERT INTO admin_mfa(user_id,encrypted_secret) VALUES(${user.id},${encryptMfaSecret(secret)}) ON CONFLICT(user_id) DO UPDATE SET encrypted_secret=excluded.encrypted_secret,last_counter=-1`);
  await tx.execute(sql`DELETE FROM sessions WHERE user_id=${user.id}`);
 });
 console.log('Provision this secret in the administrator authenticator; keep it private: '+secret);
 console.log('otpauth://totp/'+encodeURIComponent('Nudra:'+email)+'?secret='+secret+'&issuer=Nudra&algorithm=SHA1&digits=6&period=30');
}
void main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
