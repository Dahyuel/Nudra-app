import { Client } from 'pg';
import { disconnectUser, getIO } from './socket';
let client:Client|undefined, retry:NodeJS.Timeout|undefined, stopped=false, ready=false;
export const socketRevocationReady=()=>ready;
export async function startSocketRevocation(){
 if(stopped)return;
 const connection=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});client=connection;
 let failed=false;
 const reconnect=()=>{if(stopped||failed)return;failed=true;ready=false;getIO().disconnectSockets(true);void connection.end().catch(()=>{});if(!retry){retry=setTimeout(()=>{retry=undefined;void startSocketRevocation();},1000);retry.unref();}};
 connection.on('error',reconnect);
 connection.on('end',reconnect);
 connection.on('notification',message=>{if(message.channel==='nudra_access_revoked'&&/^[0-9a-f-]{36}$/i.test(message.payload??''))disconnectUser(message.payload!);});
 try{await connection.connect();await connection.query('LISTEN nudra_access_revoked');ready=true;}catch{reconnect();}
}
export async function stopSocketRevocation(){stopped=true;ready=false;if(retry)clearTimeout(retry);await client?.end().catch(()=>{});}
