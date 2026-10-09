import { readFile } from 'node:fs/promises';

async function main() {
  const timestamp = Number(await readFile(process.env.WORKER_HEARTBEAT_PATH || '/tmp/nudra-worker-heartbeat', 'utf8'));
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > 35000) process.exitCode = 1;
}
void main().catch(() => { process.exitCode = 1; });
