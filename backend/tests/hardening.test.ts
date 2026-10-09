import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { encryptMfaSecret, totp } from '../src/lib/totp';

const pool = new Pool({connectionString:process.env.DATABASE_URL});
const API = process.env.API_URL || 'http://localhost:3001';
const run=randomUUID();
const userIds:string[]=[], courseIds:string[]=[];
async function q(text:string,values:unknown[]=[]) {return (await pool.query(text,values)).rows;}
async function api(path:string,method='GET',cookie='',body?:unknown) {
 const response=await fetch(API+path,{method,headers:{Origin:process.env.TEST_ORIGIN||'http://localhost:3000',...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,body:await response.json()};
}
async function user(role='student') {
 const [u]=await q("INSERT INTO users(name,email,password_hash,role) VALUES('Hardening QA',$1,'unused',$2) RETURNING id",[`${randomUUID()}.${run}@hardening.test`,role]);userIds.push(u.id);
 const [s]=await q("INSERT INTO sessions(user_id,expires_at) VALUES($1,now()+interval '1 hour') RETURNING id",[u.id]);return {id:u.id,cookie:'session_id='+s.id};
}
async function course(teacher:string,offline=false,price=0) {
 const [c]=await q("INSERT INTO courses(instructor_id,title,description,category,level,price,delivery_mode,is_published,approval_status,capacity,location,schedule_text) VALUES($1,'Hardening QA','QA','QA','QA',$2,$3,true,'approved',1,'QA','QA') RETURNING id",[teacher,price,offline?'offline':'online']);courseIds.push(c.id);
 const [section]=await q("INSERT INTO course_sections(course_id,title,position) VALUES($1,'QA',1) RETURNING id",[c.id]);
 const [lesson]=await q("INSERT INTO lessons(course_id,section_id,title,position,duration_seconds) VALUES($1,$2,'QA',1,100) RETURNING id",[c.id,section.id]);return {id:c.id,lessonId:lesson.id};
}
after(async()=>{try{for(const id of courseIds){await q('DELETE FROM course_bookings WHERE course_id=$1',[id]);await q('DELETE FROM courses WHERE id=$1',[id]);}for(const id of userIds)await q('DELETE FROM users WHERE id=$1',[id]);}finally{await pool.end();}});

test('canceled enrollment loses notes, quizzes, media and AI access; draft preview is private',async()=>{
 const t=await user('instructor'),s=await user(),c=await course(t.id);
 await q("INSERT INTO enrollments(student_id,course_id,status) VALUES($1,$2,'cancelled')",[s.id,c.id]);
 for(const path of [`/api/notes/lesson/${c.lessonId}`,`/api/quizzes/lesson/${c.lessonId}`,`/api/videos/${c.lessonId}/playlist.m3u8`])assert.ok([403,404].includes((await api(path,'GET',s.cookie)).status),path);
 assert.ok([403,404].includes((await api('/api/ai/conversations','POST',s.cookie,{courseId:c.id})).status));
 await q('UPDATE lessons SET is_free=true WHERE id=$1',[c.lessonId]);await q('UPDATE courses SET is_published=false WHERE id=$1',[c.id]);
 assert.ok([403,404].includes((await api(`/api/notes/lesson/${c.lessonId}`,'GET',s.cookie)).status));
});
test('anonymous search excludes all course-restricted posts',async()=>{
 const t=await user('instructor'),c=await course(t.id);
 const [p]=await q("INSERT INTO community_posts(course_id,author_id,anon_token,content,title) VALUES($1,$2,gen_random_uuid(),$3::text,$3::text) RETURNING id",[c.id,t.id,run]);
 const r=await api('/api/search?q='+run);assert.equal(r.status,200);assert.ok(!r.body.posts.some((post:{id:string})=>post.id===p.id));
});
test('reset token is consumed exactly once under concurrent requests',async()=>{
 const s=await user(),token=randomUUID();await q("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[s.id,createHash('sha256').update(token).digest('hex')]);
 const results=await Promise.all(['ResetPass123x','OtherPass123x'].map(password=>api('/api/auth/reset-password','POST','',{token,password})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal((await api('/api/auth/me','GET',s.cookie)).status,401);
});
test('progress requires enrollment and cannot mint time or a certificate by replay',async()=>{
 const t=await user('instructor'),s=await user(),c=await course(t.id);
 const path=`/api/progress/lesson/${c.lessonId}`;
 assert.equal((await api(path,'POST',s.cookie,{watchedSeconds:100,completed:true})).status,403);
 await q('INSERT INTO enrollments(student_id,course_id) VALUES($1,$2)',[s.id,c.id]);
 for(let i=0;i<3;i++){const r=await api(path,'POST',s.cookie,{watchedSeconds:100,completed:true});assert.equal(r.status,200);assert.equal(r.body.lessonProgress.completed,false);assert.equal(r.body.certificateEarned,null);}
 assert.equal(Number((await q('SELECT coalesce(sum(minutes_studied),0) AS minutes FROM study_sessions WHERE student_id=$1',[s.id]))[0].minutes),0);
 await q("UPDATE lesson_progress SET watched_seconds=85,last_activity_at=now()-interval '10 seconds' WHERE student_id=$1 AND lesson_id=$2",[s.id,c.lessonId]);
 const completed=await api(path,'POST',s.cookie,{watchedSeconds:95,completed:true});assert.equal(completed.status,200);assert.equal(completed.body.lessonProgress.completed,true);assert.ok(completed.body.certificateEarned);
 assert.equal((await api(path,'POST',s.cookie,{watchedSeconds:95,completed:true})).body.certificateEarned,null);
});
test('capacity-one semester enrollment and session fan-out commit atomically',async()=>{
 const t=await user('instructor'),c=await course(t.id,true),students=await Promise.all(Array.from({length:6},()=>user()));
 const [session]=await q("INSERT INTO course_sessions(course_id,starts_at,ends_at,location,capacity,created_by) VALUES($1,now()+interval '2 days',now()+interval '2 days 1 hour','QA',1,$2) RETURNING id",[c.id,t.id]);
 const results=await Promise.all(students.map(s=>api(`/api/courses/${c.id}/enroll`,'POST',s.cookie,{})));
 assert.equal(results.filter(r=>r.status===201).length,1,JSON.stringify(results));assert.equal(results.filter(r=>r.status===409).length,5);
 assert.equal((await q("SELECT count(*)::int AS n FROM enrollments WHERE course_id=$1 AND status='active'",[c.id]))[0].n,1);
 assert.equal((await q("SELECT count(*)::int AS n FROM course_bookings WHERE session_id=$1 AND status='confirmed'",[session.id]))[0].n,1);
});
test('mock success is owner-bound and idempotent; terminal failures grant no access',async()=>{
 const t=await user('instructor'),s=await user(),outsider=await user(),c=await course(t.id,false,100);
 const checkout=await api('/api/payments/checkout','POST',s.cookie,{courseId:c.id,amount:1});assert.equal(checkout.status,201);assert.equal(checkout.body.order.amount,100);assert.equal(checkout.body.order.provider,'paymob_mock');
 const id=checkout.body.order.id;
 assert.equal((await api(`/api/payments/mock/${id}/complete`,'POST',outsider.cookie,{outcome:'paid'})).status,404);
 const results=await Promise.all(Array.from({length:4},()=>api(`/api/payments/mock/${id}/complete`,'POST',s.cookie,{outcome:'paid'})));assert.ok(results.every(r=>r.status===200&&r.body.order.status==='paid'));
 assert.equal((await q('SELECT count(*)::int AS n FROM enrollments WHERE course_id=$1',[c.id]))[0].n,1);assert.equal((await q('SELECT count(*)::int AS n FROM mock_payment_events WHERE order_id=$1',[id]))[0].n,1);
 assert.equal((await api(`/api/payments/mock/${id}/complete`,'POST',s.cookie,{outcome:'failed'})).body.order.status,'paid');
 for(const outcome of ['failed','cancelled','expired']){const other=await user(),order=await api('/api/payments/checkout','POST',other.cookie,{courseId:c.id});assert.equal(order.status,201);const r=await api(`/api/payments/mock/${order.body.order.id}/complete`,'POST',other.cookie,{outcome});assert.equal(r.body.order.status,outcome);assert.equal((await q('SELECT count(*)::int AS n FROM enrollments WHERE student_id=$1 AND course_id=$2',[other.id,c.id]))[0].n,0);}
});
test('malformed UUIDs and registration shapes return client errors without killing API',async()=>{
 const s=await user();assert.equal((await api('/api/notes/lesson/invalid','GET',s.cookie)).status,400);
 assert.equal((await api('/api/auth/register','POST','',{name:33,email:'invalid@hardening.test',password:'StrongPass123',phone:'01012345678'})).status,400);
 assert.equal((await api('/api/health/live')).status,200);
});
test('administrator MFA verifies fresh codes and rejects missing or replayed codes',async()=>{
 const admin=await user('admin'),secret='JBSWY3DPEHPK3PXP';
 const password='MfaTestPass123';await q('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(password,10),admin.id]);
 await q('INSERT INTO admin_mfa(user_id,encrypted_secret) VALUES($1,$2)',[admin.id,encryptMfaSecret(secret)]);
 const [person]=await q('SELECT email FROM users WHERE id=$1',[admin.id]);
 assert.equal((await api('/api/auth/login','POST','',{email:person.email,password})).status,401);
 const otp=totp(secret,Math.floor(Date.now()/30000));
 assert.equal((await api('/api/auth/login','POST','',{email:person.email,password,otp})).status,200);
 assert.equal((await api('/api/auth/login','POST','',{email:person.email,password,otp})).status,401);
});
test('email verification is realm-bound, one-time, and its outbox payload is encrypted',async()=>{
 const s=await user(),token=Buffer.from(randomUUID()+randomUUID()).subarray(0,32).toString('base64url');
 assert.equal((await api('/api/auth/verify-email/request','POST',s.cookie,{})).status,202);
 const [person]=await q('SELECT email FROM users WHERE id=$1',[s.id]);
 const [outbox]=await q('SELECT payload FROM email_outbox ORDER BY created_at DESC LIMIT 1');assert.ok(!outbox.payload.includes(person.email));assert.ok(!outbox.payload.includes('Verify email'));
 await q("DELETE FROM email_verification_tokens WHERE user_id=$1",[s.id]);await q("INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[s.id,createHash('sha256').update(token).digest('hex')]);
 const results=await Promise.all([api('/api/auth/verify-email?token='+token),api('/api/auth/verify-email?token='+token)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 assert.ok((await q('SELECT email_verified_at FROM users WHERE id=$1',[s.id]))[0].email_verified_at);
});
test('exam assignment owns the full question set, scoring and replay result',async()=>{
 const t=await user('instructor'),s=await user(),c=await course(t.id);await q('INSERT INTO enrollments(student_id,course_id) VALUES($1,$2)',[s.id,c.id]);
 const [quiz]=await q("INSERT INTO quizzes(lesson_id,course_id,title) VALUES($1,$2,'Exam QA') RETURNING id",[c.lessonId,c.id]);
 for(let position=1;position<=10;position++)await q("INSERT INTO quiz_questions(quiz_id,question_text,option_a,option_b,option_c,option_d,correct_option,position) VALUES($1,'QA','a','b','c','d','a',$2)",[quiz.id,position]);
 const generated=await api('/api/quizzes/exam/generate','POST',s.cookie,{courseId:c.id,questionCount:10,timeLimitMinutes:15});assert.equal(generated.status,200);assert.equal(generated.body.questions.length,10);assert.ok(!('correctOption' in generated.body.questions[0]));
 const submission={examId:generated.body.examId,courseId:c.id,timeTakenSeconds:999,answers:{[generated.body.questions[0].id]:'a'}};
 const replacement={questions:Array.from({length:2},()=>({questionText:'Replacement QA',optionA:'a',optionB:'b',optionC:'c',optionD:'d',correctOption:'a'}))};
 assert.equal((await api(`/api/instructor/lessons/${c.lessonId}/quiz`,'POST',t.cookie,replacement)).status,409);
 const result=await api('/api/quizzes/exam/submit','POST',s.cookie,submission);assert.equal(result.status,200);assert.equal(result.body.total,10);assert.equal(result.body.percentage,10);assert.ok(result.body.timeTakenSeconds<60);
 assert.deepEqual((await api('/api/quizzes/exam/submit','POST',s.cookie,{...submission,answers:{}})).body,result.body);
 assert.equal((await q('SELECT count(*)::int AS n FROM quiz_attempts WHERE student_id=$1',[s.id]))[0].n,1);
});
test('enrollment rolls back when its durable email cannot be queued',{skip:process.env.NUDRA_DISPOSABLE_TESTS!=='true'},async()=>{
 const t=await user('instructor'),s=await user(),c=await course(t.id);
 let renamed=false;
 try {
  await q('ALTER TABLE email_outbox RENAME TO email_outbox_failure_probe');renamed=true;
  const response=await api(`/api/courses/${c.id}/enroll`,'POST',s.cookie,{});
  assert.equal(response.status,500);
  assert.equal((await q('SELECT count(*)::int AS n FROM enrollments WHERE student_id=$1 AND course_id=$2',[s.id,c.id]))[0].n,0);
 } finally {if(renamed)await q('ALTER TABLE email_outbox_failure_probe RENAME TO email_outbox');}
 assert.equal((await api(`/api/courses/${c.id}/enroll`,'POST',s.cookie,{})).status,201);
});
test('concurrent distinct reset links serialize without leaving a second valid credential change',async()=>{
 const s=await user(),tokens=[randomUUID(),randomUUID()];
 for(const token of tokens)await q("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[s.id,createHash('sha256').update(token).digest('hex')]);
 const responses=await Promise.all(tokens.map((token,index)=>api('/api/auth/reset-password','POST','',{token,password:'DistinctReset'+index+'Pass123'})));
 assert.deepEqual(responses.map(response=>response.status).sort(),[200,400]);
});
test('login cannot create a session from a password verified before concurrent reset',async()=>{
 const s=await user(),oldPassword='StaleLoginPass123',newHash=await bcrypt.hash('ReplacementPass123',10);
 await q('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(oldPassword,10),s.id]);
 const [person]=await q('SELECT email FROM users WHERE id=$1',[s.id]);const client=await pool.connect();
 try {
  await client.query('BEGIN');await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[s.id]);
  const login=api('/api/auth/login','POST','',{email:person.email,password:oldPassword});
  await new Promise(resolve=>setTimeout(resolve,250));
  await client.query('UPDATE users SET password_hash=$1 WHERE id=$2',[newHash,s.id]);await client.query('DELETE FROM sessions WHERE user_id=$1',[s.id]);await client.query('COMMIT');
  assert.equal((await login).status,401);
  assert.equal((await q('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1',[s.id]))[0].n,0);
 } finally {await client.query('ROLLBACK');client.release();}
});
