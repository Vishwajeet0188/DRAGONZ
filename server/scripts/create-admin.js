// Production-safe: creates ONLY the first SUPER_ADMIN (no demo content). Idempotent — does nothing if that email exists.
// Reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from the environment. Remove SEED_ADMIN_PASSWORD from your host after first login.
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/index.js';
import { hashPassword, randomToken } from '../src/lib/crypto.js';

const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
try {
  if (!email || !password) {
    console.log('ℹ SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set — skipping admin bootstrap');
  } else if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
  } else {
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (existing) console.log('ℹ admin already exists — nothing to do');
    else {
      const [u] = await db.insert(schema.users).values({ email, passwordHash: await hashPassword(password), displayName: 'Dragonz Admin', role: 'SUPER_ADMIN', emailVerifiedAt: new Date() }).returning();
      await db.insert(schema.notificationPreferences).values({ userId: u.id, unsubscribeToken: randomToken(24) });
      console.log(`✔ super-admin created: ${email}`);
    }
  }
} catch (err) {
  console.error('✖ admin bootstrap failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
