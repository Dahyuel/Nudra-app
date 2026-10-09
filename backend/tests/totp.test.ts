import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase32, totp, verifyTotp } from '../src/lib/totp';

test('TOTP matches RFC 6238 SHA-1 vectors and rejects replay',()=>{
 const secret=encodeBase32(Buffer.from('12345678901234567890'));
 for(const [seconds,code] of [[59,'287082'],[1111111109,'081804'],[1111111111,'050471'],[1234567890,'005924'],[2000000000,'279037'],[20000000000,'353130']] as const){const counter=Math.floor(seconds/30);assert.equal(totp(secret,counter),code);assert.equal(verifyTotp(secret,code,-1,seconds*1000),counter);assert.equal(verifyTotp(secret,code,counter,seconds*1000),null);}
 assert.equal(verifyTotp(secret,'invalid',-1),null);
});
