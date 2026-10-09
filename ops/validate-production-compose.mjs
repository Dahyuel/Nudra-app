import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const directory=mkdtempSync(join(tmpdir(),'nudra-compose-check-'));
try {
  copyFileSync(resolve('compose.production.yml'),join(directory,'compose.production.yml'));
  for(const name of ['.env.production.api','.env.production.worker']) writeFileSync(join(directory,name),'');
  const env={...process.env,POSTGRES_DB:'qa',POSTGRES_SUPERUSER:'postgres',POSTGRES_SUPERUSER_PASSWORD:'qa-disposable',POSTGRES_APP_USER:'qa_app',POSTGRES_APP_PASSWORD:'qa-disposable',POSTGRES_MIGRATION_USER:'qa_migrate',POSTGRES_MIGRATION_PASSWORD:'qa-disposable',DATABASE_URL:'postgresql://qa_app:qa-disposable@postgres/qa',REDIS_PASSWORD:'qa-disposable',MINIO_ROOT_USER:'qa-root',MINIO_ROOT_PASSWORD:'qa-disposable',MINIO_APP_USER:'qa-app',MINIO_APP_PASSWORD:'qa-disposable',BASE_DOMAIN:'nudra.example',ASSETS_HOST:'assets.nudra.example',PUBLIC_IPV4:'192.0.2.1',DOMAIN_AUTH_SHARED_SECRET:'qa-disposable-only-123456789012',ACME_EMAIL:'qa@example.test'};
  const config=JSON.parse(execFileSync('docker',['compose','-f',join(directory,'compose.production.yml'),'config','--format','json'],{env,encoding:'utf8'}));
  assert.equal(Object.keys(config.services).length,9);
  assert.deepEqual(Object.entries(config.services).filter(([,service])=>service.ports?.length).map(([name])=>name),['caddy']);
  for(const [name,service] of Object.entries(config.services)) {
    assert.ok(service.mem_limit>0,`${name} requires a memory limit`);
    assert.equal(service.logging.driver,'local');
    assert.equal(service.logging.options['max-size'],'10m');
    assert.equal(service.logging.options['max-file'],'3');
  }
  assert.equal(config.networks.data.internal,true);
  assert.equal(config.networks.storage.internal,true);
  assert.ok(config.services['video-worker'].healthcheck.test.includes('dist/scripts/worker-health.js'));
  assert.ok(config.services.redis.command.join(' ').includes('noeviction'));
  assert.equal(config.services.api.read_only,true);
  assert.equal(config.services['video-worker'].read_only,true);
  console.log('Production Compose checks passed: 9 services, private data/storage networks, bounded resources/logs and worker health.');
} finally {rmSync(directory,{recursive:true,force:true});}
