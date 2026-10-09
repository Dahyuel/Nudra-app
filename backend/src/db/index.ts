import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Math.max(1, Math.min(50, Number(process.env.DB_POOL_MAX) || 10)),
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
  idle_in_transaction_session_timeout: 15000,
});
pool.on('error', (error) => console.error('database pool error', { code: (error as { code?: string }).code }));

export const db = drizzle(pool, { schema });
export { schema };
