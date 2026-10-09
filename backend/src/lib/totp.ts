import { createHmac, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encodeBase32(bytes:Buffer) {
 let bits=0,value=0,result='';
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
 if(bits)result+=alphabet[(value<<(5-bits))&31];return result;
}
function decodeBase32(secret:string) {
 if(!/^[A-Z2-7]{16,128}$/.test(secret))throw new Error('Invalid authenticator secret');
 let bits=0,value=0;const bytes:number[]=[];
 for(const char of secret){value=(value<<5)|alphabet.indexOf(char);bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
 return Buffer.from(bytes);
}
export function totp(secret:string,counter:number) {
 const bytes=Buffer.alloc(8);bytes.writeBigUInt64BE(BigInt(counter));const digest=createHmac('sha1',decodeBase32(secret)).update(bytes).digest(),offset=digest[19]&15;
 return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
export function verifyTotp(secret:string,code:unknown,lastCounter:number,now=Date.now()) {
 if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
 const current=Math.floor(now/30000);
 for(const counter of [current,current-1,current+1])if(counter>lastCounter&&timingSafeEqual(Buffer.from(totp(secret,counter)),Buffer.from(code)))return counter;
 return null;
}
function encryptionKey(){const key=process.env.EMAIL_OUTBOX_KEY;if(!/^[0-9a-f]{64}$/i.test(key??''))throw new Error('EMAIL_OUTBOX_KEY must be configured before MFA provisioning');return Buffer.from(key!,'hex');}
export function encryptMfaSecret(secret:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv),body=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64')).join('.');}
export function decryptMfaSecret(payload:string){const [iv,tag,body]=payload.split('.').map(b=>Buffer.from(b,'base64'));const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8');}
