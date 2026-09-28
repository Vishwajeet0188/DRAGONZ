// Applies generated SQL migrations in ./drizzle. Safe to run on every deploy.
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const HINTS = {
  '28P01': 'Wrong password in DATABASE_URL (password authentication failed).',
  '3D000': 'Database name in DATABASE_URL does not exist — check the spelling (dragonz_central).',
  '28000': 'That PostgreSQL user does not exist — check the username in DATABASE_URL.',
  '42501': 'The user has no permission to create objects in this database.',
  ECONNREFUSED: 'Nothing is listening on that host/port — check the port (pgAdmin → Properties → Connection).',
  ENOTFOUND: 'Host name in DATABASE_URL is wrong (use localhost).',
};

if (!process.env.DATABASE_URL) {
  console.error('✖ DATABASE_URL is missing — is server/.env saved?');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  // fileURLToPath (not URL.pathname) so Windows paths work.
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  console.log('✔ migrations applied');
} catch (err) {
  const root = err.cause ?? err;
  console.error('✖ migration failed:', root.message);
  if (HINTS[root.code]) console.error('  → ' + HINTS[root.code]);
  process.exitCode = 1;
} finally {
  await pool.end();
}
