import { Router } from 'express';
import { z } from 'zod';
import { and, eq, ne, count, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, destroySession, publicUser } from '../../middleware/session.js';
import { sensitiveLimiter } from '../../middleware/security.js';
import { verifyPassword, hashPassword, randomToken } from '../../lib/crypto.js';
import { AppError, badRequest } from '../../lib/errors.js';
import { compact } from '../../lib/util.js';
import { mediaUrl } from '../../lib/validators.js';
import { audit } from '../../services/audit.js';
import { displayName } from '../auth/auth.validators.js';

const { users, sessions, authTokens, follows, notificationPreferences, members } = schema;

export const usersRouter = Router();
usersRouter.use(requireAuth);


const updateMeSchema = z.object({
  displayName: displayName.optional(),
  avatarUrl: mediaUrl.nullable().optional(),
}).strict();

// All /me routes act on req.user.id only — there is no user id parameter to tamper with (IDOR-safe).
usersRouter.patch('/me', validate({ body: updateMeSchema }), async (req, res) => {
  const [user] = await db.update(users).set(compact(req.body)).where(eq(users.id, req.user.id)).returning();
  res.json({ data: { user: publicUser(user) } });
});

usersRouter.get('/me/sessions', async (req, res) => {
  const [{ active }] = await db.select({ active: count() }).from(sessions).where(eq(sessions.userId, req.user.id));
  res.json({ data: { active } });
});

usersRouter.post('/me/sessions/revoke-others', sensitiveLimiter, async (req, res) => {
  await db.delete(sessions).where(and(eq(sessions.userId, req.user.id), ne(sessions.id, req.sessionId)));
  res.json({ data: { ok: true } });
});

/**
 * Account deletion: requires password. The row is anonymised + soft-deleted (keeps audit/FK integrity),
 * and every piece of personal data we hold (sessions, tokens, follows, preferences) is removed.
 */
usersRouter.delete('/me', sensitiveLimiter, validate({ body: z.object({ password: z.string().min(1).max(128) }) }), async (req, res) => {
  const user = req.user;
  if (user.role === 'SUPER_ADMIN') {
    const [{ n }] = await db.select({ n: count() }).from(users).where(and(eq(users.role, 'SUPER_ADMIN'), isNull(users.deletedAt)));
    if (n <= 1) throw badRequest('Transfer super-admin rights before deleting the last super-admin account.');
  }
  if (!(await verifyPassword(user.passwordHash, req.body.password))) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Password is incorrect', [{ field: 'password', message: 'Incorrect password' }]);
  }
  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(authTokens).where(eq(authTokens.userId, user.id));
    await tx.delete(follows).where(eq(follows.userId, user.id));
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, user.id));
    await tx.update(members).set({ userId: null }).where(eq(members.userId, user.id));
    await tx.update(users).set({
      email: `deleted+${user.id}@invalid.local`,
      displayName: 'Deleted user',
      avatarUrl: null,
      passwordHash: await hashPassword(randomToken(32)),
      role: 'USER',
      emailVerifiedAt: null,
      deletedAt: new Date(),
    }).where(eq(users.id, user.id));
  });
  await audit(user.id, 'user.self_delete', 'user', user.id);
  await destroySession(req, res);
  res.json({ data: { ok: true } });
});
