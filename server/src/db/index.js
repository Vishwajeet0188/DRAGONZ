import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import * as schema from './schema.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === 'test' ? 5 : env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => logger.error({ err }, 'postgres pool error'));

export const db = drizzle(pool, { schema });
export { schema };
