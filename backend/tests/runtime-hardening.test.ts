import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io } from 'socket.io-client';

const API=process.env.API_URL||'http://localhost:3001';
const isolated=process.env.NUDRA_DISPOSABLE_TESTS==='true';
test('existing realtime connection is disconnected immediately on logout',async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});let socket:ReturnType<typeof io>|undefined;let userId:string|undefined;
 try{
  const {rows:[user]}=await pool.query("INSERT INTO users(name,email,password_hash) VALUES('Socket QA',$1,'unused') RETURNING id",[randomUUID()+'@socket.test']);userId=user.id;
  const {rows:[session]}=await pool.query("INSERT INTO sessions(user_id,expires_at) VALUES($1,now()+interval '1 hour') RETURNING id",[user.id]);
  const cookie='session_id='+session.id;
  socket=io(API,{transports:['websocket'],reconnection:false,extraHeaders:{Origin:process.env.TEST_ORIGIN||'http://localhost:3000',Cookie:cookie}});
  await new Promise<void>((resolve,reject)=>{socket!.once('connect',resolve);socket!.once('connect_error',reject);setTimeout(()=>reject(new Error('Socket handshake timed out')),5000).unref();});
  const disconnected=new Promise<void>((resolve,reject)=>{socket!.once('disconnect',()=>resolve());setTimeout(()=>reject(new Error('Logout did not revoke realtime access')),2000).unref();});
  const response=await fetch(API+'/api/auth/logout',{method:'POST',headers:{Origin:process.env.TEST_ORIGIN||'http://localhost:3000',Cookie:cookie}});assert.equal(response.status,200);await disconnected;
 }finally{socket?.disconnect();if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);await pool.end();}
});
test('async booking database failure returns 500 and API stays alive',{skip:!isolated},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});let renamed=false,userId:string|undefined;
 try{
  const {rows:[user]}=await pool.query("INSERT INTO users(name,email,password_hash) VALUES('Failure QA',$1,'unused') RETURNING id",[randomUUID()+'@failure.test']);userId=user.id;
  const {rows:[session]}=await pool.query("INSERT INTO sessions(user_id,expires_at) VALUES($1,now()+interval '1 hour') RETURNING id",[user.id]);
  await pool.query('ALTER TABLE course_sessions RENAME TO course_sessions_failure_probe');renamed=true;
  const response=await fetch(API+'/api/bookings/sessions/'+randomUUID()+'/roster',{headers:{Origin:process.env.TEST_ORIGIN||'http://localhost:3000',Cookie:'session_id='+session.id}});assert.equal(response.status,500);
  assert.equal((await fetch(API+'/api/health/live')).status,200);
 }finally{if(renamed)await pool.query('ALTER TABLE course_sessions_failure_probe RENAME TO course_sessions');if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);await pool.end();}
});
test('database permission changes revoke a connected socket without waiting for polling',async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});let socket:ReturnType<typeof io>|undefined,userId:string|undefined;
 try{
  const {rows:[user]}=await pool.query("INSERT INTO users(name,email,password_hash) VALUES('Revocation QA',$1,'unused') RETURNING id",[randomUUID()+'@socket.test']);userId=user.id;
  const {rows:[session]}=await pool.query("INSERT INTO sessions(user_id,expires_at) VALUES($1,now()+interval '1 hour') RETURNING id",[user.id]);
  socket=io(API,{transports:['websocket'],reconnection:false,extraHeaders:{Origin:process.env.TEST_ORIGIN||'http://localhost:3000',Cookie:'session_id='+session.id}});
  await new Promise<void>((resolve,reject)=>{socket!.once('connect',resolve);socket!.once('connect_error',reject);setTimeout(()=>reject(new Error('Handshake timeout')),5000).unref();});
  const disconnected=new Promise<void>((resolve,reject)=>{socket!.once('disconnect',()=>resolve());setTimeout(()=>reject(new Error('Permission notification did not revoke socket')),2000).unref();});
  await pool.query('UPDATE users SET must_change_password=true WHERE id=$1',[user.id]);await disconnected;
 }finally{socket?.disconnect();if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);await pool.end();}
});
