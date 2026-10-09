import { operationalSnapshot } from '../lib/operationalSnapshot';
import { pool } from '../db';
import { videoQueue } from '../lib/queue';
async function main(){const snapshot=await operationalSnapshot();console.log(JSON.stringify(snapshot));if(['failed_mail','delayed_mail','failed_cleanup','failed_video','stalled_video'].some(key=>Number(snapshot.database[key])>0)||snapshot.pool.waiting>0||snapshot.queue.waiting>20)process.exitCode=1;}
void main().catch(()=>{console.error('Operational dependency check failed');process.exitCode=1;}).finally(async()=>{await videoQueue.close();await pool.end();});
