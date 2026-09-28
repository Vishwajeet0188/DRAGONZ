import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { hashPassword, verifyPassword, burnPasswordCheck, randomToken, sha256 } from '../../lib/crypto.js';
import { AppError, badRequest, conflict, tooMany, unauthorized } from '../../lib/errors.js';
import { queueEmail } from '../../services/email/index.js';
import { audit } from '../../services/audit.js';
import { logger } from '../../lib/logger.js';

const { users, authTokens, sessions, notificationPreferences } = schema;

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;
const VERIFY_TTL = 24 * 60 * 60_000;
const RESET_TTL = 60 * 60_000;
const GENERIC_LOGIN_ERROR = 'Invalid email or password';

async function issueToken(userId, type, ttlMs, tx = db) {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  // Invalidate earlier unused tokens of the same type.
  await tx.update(authTokens).set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.usedAt)));
  await tx.insert(authTokens).values({ userId, type, tokenHash, expiresAt: new Date(Date.now() + ttlMs) });
  return { token, tokenHash };
}

/** Atomically consume a single-use token. Returns the userId or throws. */
async function consumeToken(token, type) {
  const [row] = await db.update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(authTokens.tokenHash, sha256(token)),
      eq(authTokens.type, type),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, new Date()),
    ))
    .returning({ userId: authTokens.userId });
  if (!row) throw badRequest('This link is invalid or has expired. Please request a new one.');
  return row.userId;
}

export async function sendVerification(user) {
  const { token, tokenHash } = await issueToken(user.id, 'EMAIL_VERIFY', VERIFY_TTL);
  await queueEmail({ to: user.email, template: 'verifyEmail', data: { displayName: user.displayName, token }, dedupeKey: `verify:${tokenHash}` });
}

/** Per-user throttle (DB-backed, works across instances): max one verification email per minute. */
export async function resendVerification(user) {
  const [recent] = await db.select({ id: authTokens.id }).from(authTokens)
    .where(and(eq(authTokens.userId, user.id), eq(authTokens.type, 'EMAIL_VERIFY'), gt(authTokens.createdAt, new Date(Date.now() - 60_000))))
    .limit(1);
  if (recent) throw tooMany('Please wait a minute before requesting another email.');
  await sendVerification(user);
}

export async function register({ email, password, displayName }) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw conflict('An account with this email already exists', [{ field: 'email', message: 'Already registered' }]);

  const passwordHash = await hashPassword(password);
  const user = await db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ email, passwordHash, displayName }).returning();
    await tx.insert(notificationPreferences).values({ userId: u.id, unsubscribeToken: randomToken(24) });
    return u;
  });
  await sendVerification(user);
  logger.info({ userId: user.id }, 'user registered');
  return user;
}

export async function login({ email, password }) {
  const [user] = await db.select().from(users).where(and(eq(users.email, email), isNull(users.deletedAt))).limit(1);
  if (!user) {
    await burnPasswordCheck(password); // equalise timing → no user enumeration
    throw unauthorized(GENERIC_LOGIN_ERROR);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes or reset your password.');
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED;
    await db.update(users)
      .set({ failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : null })
      .where(eq(users.id, user.id));
    logger.warn({ userId: user.id, failed, locked: lock }, 'failed login');
    if (lock) await audit(user.id, 'auth.locked', 'user', user.id);
    throw unauthorized(GENERIC_LOGIN_ERROR);
  }

  const [updated] = await db.update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  return updated;
}

export async function verifyEmail(token) {
  const userId = await consumeToken(token, 'EMAIL_VERIFY');
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
}

export async function forgotPassword(email) {
  const [user] = await db.select().from(users).where(and(eq(users.email, email), isNull(users.deletedAt))).limit(1);
  if (!user) return; // same response either way
  const { token, tokenHash } = await issueToken(user.id, 'PASSWORD_RESET', RESET_TTL);
  await queueEmail({ to: user.email, template: 'passwordReset', data: { displayName: user.displayName, token }, dedupeKey: `reset:${tokenHash}` });
}

export async function resetPassword({ token, password }) {
  const userId = await consumeToken(token, 'PASSWORD_RESET');
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    // Reset proves inbox ownership, so it also verifies the email.
    await tx.update(users).set({ passwordHash, failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId)); // sign out everywhere
  });
  await audit(userId, 'auth.password_reset', 'user', userId);
}

export async function changePassword(user, { currentPassword, newPassword }, currentSessionId) {
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Current password is incorrect', [{ field: 'currentPassword', message: 'Incorrect password' }]);
  }
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, currentSessionId)));
  });
  await queueEmail({ to: user.email, template: 'passwordChanged', data: { displayName: user.displayName }, dedupeKey: `pwchanged:${user.id}:${Date.now()}` });
  await audit(user.id, 'auth.password_changed', 'user', user.id);
}
