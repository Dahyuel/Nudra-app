import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

const BASELINE_MIGRATION = '0000_fantastic_skullbuster.sql';
const MIGRATION_FILE = /^(\d{4,})_[a-z0-9_-]+\.sql$/i;
const ADVISORY_LOCK_NAMESPACE = 1313160274;
const ADVISORY_LOCK_ID = 1;

type MigrationFile = { name: string; number: number };

async function discoverMigrations(migrationsDirectory: string): Promise<MigrationFile[]> {
  const files = (await fs.readdir(migrationsDirectory))
    .flatMap((name): MigrationFile[] => {
      const match = MIGRATION_FILE.exec(name);
      if (!match) return [];
      const number = Number(match[1]);
      if (!Number.isSafeInteger(number)) throw new Error(`Invalid migration number in ${name}`);
      return [{ name, number }];
    })
    .sort((left, right) => left.number - right.number || left.name.localeCompare(right.name));

  for (let index = 1; index < files.length; index += 1) {
    if (files[index - 1].number === files[index].number) {
      throw new Error(`Duplicate migration number ${files[index].number}: ${files[index - 1].name}, ${files[index].name}`);
    }
  }

  if (!files.some(({ name }) => name === BASELINE_MIGRATION)) {
    throw new Error(`Required baseline migration ${BASELINE_MIGRATION} is missing.`);
  }

  return files;
}

async function prepareBaseline(client: PoolClient, files: MigrationFile[]) {
  const baseline = files.find(({ name }) => name === BASELINE_MIGRATION);
  if (!baseline) throw new Error(`Required baseline migration ${BASELINE_MIGRATION} is missing.`);

  const { rows: tracked } = await client.query(
    'SELECT 1 FROM public.nudra_schema_migrations WHERE name = $1',
    [baseline.name],
  );
  if (tracked.length) return;

  const { rows } = await client.query(`
    SELECT
      to_regclass('public.users') IS NOT NULL AS users,
      to_regclass('public.organizations') IS NOT NULL AS organizations,
      to_regclass('public.courses') IS NOT NULL AS courses,
      to_regclass('public.lessons') IS NOT NULL AS lessons,
      to_regclass('public.lesson_chunks') IS NOT NULL AS lesson_chunks
  `);
  const existing = Object.values(rows[0] as Record<string, boolean>).filter(Boolean).length;

  if (existing === 5) {
    if (process.env.MIGRATION_ADOPT_BASELINE !== 'true') throw new Error('Untracked existing schema: validate its full schema against the baseline, then explicitly set MIGRATION_ADOPT_BASELINE=true.');
    // A restored pre-migration Nudra database already contains the baseline schema.
    await client.query('INSERT INTO public.nudra_schema_migrations(name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [baseline.name]);
    console.log(`Recorded existing schema baseline ${baseline.name}`);
  } else if (existing !== 0) {
    throw new Error('Database has a partial Nudra baseline schema. Restore a complete backup or repair it before migrating.');
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL must be set to the migration-owner connection string.');
  const pool = new Pool({ connectionString, max: 1 });
  const migrationsDirectory = path.resolve(__dirname, '../../drizzle');
  let client: PoolClient | undefined;
  let lockAcquired = false;

  try {
    const files = await discoverMigrations(migrationsDirectory);
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock($1, $2)', [ADVISORY_LOCK_NAMESPACE, ADVISORY_LOCK_ID]);
    lockAcquired = true;
    await client.query('CREATE TABLE IF NOT EXISTS public.nudra_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    await client.query('ALTER TABLE public.nudra_schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
    await prepareBaseline(client, files);

    for (const name of files) {
      const sql = await fs.readFile(path.join(migrationsDirectory, name.name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const { rows } = await client.query('SELECT checksum FROM public.nudra_schema_migrations WHERE name = $1', [name.name]);
      if (rows.length) {
        if (rows[0].checksum && rows[0].checksum !== checksum) throw new Error(`Applied migration content changed: ${name.name}`);
        if (!rows[0].checksum) {
          if (process.env.MIGRATION_ADOPT_CHECKSUMS !== 'true') throw new Error('Legacy migration history needs reviewed checksum adoption: set MIGRATION_ADOPT_CHECKSUMS=true once after comparing the deployed SQL history.');
          await client.query('UPDATE public.nudra_schema_migrations SET checksum=$2 WHERE name=$1', [name.name,checksum]);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.nudra_schema_migrations(name,checksum) VALUES ($1,$2)', [name.name,checksum]);
        await client.query('COMMIT');
        console.log(`Applied ${name.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    console.log('Database migrations complete.');
  } finally {
    if (client && lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1, $2)', [ADVISORY_LOCK_NAMESPACE, ADVISORY_LOCK_ID]);
      } finally {
        client.release();
      }
    } else {
      client?.release();
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Database migration failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
