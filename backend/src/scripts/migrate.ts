import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL must be set to the migration-owner connection string.');
  const pool = new Pool({ connectionString, max: 1 });
  const migrationsDirectory = path.resolve(__dirname, '../../drizzle');

  try {
    await pool.query('CREATE TABLE IF NOT EXISTS public.nudra_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await fs.readdir(migrationsDirectory))
      .filter((name) => /^000[1-9]_[a-z0-9_-]+\.sql$/i.test(name))
      .sort();

    for (const name of files) {
      const { rows } = await pool.query('SELECT 1 FROM public.nudra_schema_migrations WHERE name = $1', [name]);
      if (rows.length) continue;
      const sql = await fs.readFile(path.join(migrationsDirectory, name), 'utf8');
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO public.nudra_schema_migrations(name) VALUES ($1)', [name]);
        await pool.query('COMMIT');
        console.log(`Applied ${name}`);
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    }
    console.log('Database migrations complete.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Database migration failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
