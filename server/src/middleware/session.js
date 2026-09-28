import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { env, isProd } from '../config/env.js';
import { sha256, randomToken } from '../lib/crypto.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { can, permissionsFor } from '../auth/permissions.js';

// "__Host-" prefix in production: cookie must be Secure, host-only, Path=/ — blocks subdomain cookie injection.
export const SESSION_COOKIE = isProd ? '__Host-dz_session' : 'dz_session';
const TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000; // extend sliding expiry at most hourly

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: TTL_MS,
});

export async function createSession(res, userId, userAgent) {
  const token = randomToken(32);
  await db.insert(schema.sessions).values({
    tokenHash: sha256(token),
    userId,
    userAgent: userAgent?.slice(0, 255) ?? null,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
}

/** Public-safe projection of a user. Never include hashes, lockout state etc. */
export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
  role: u.role,
  emailVerified: Boolean(u.emailVerifiedAt),
  permissions: permissionsFor(u.role),
  createdAt: u.createdAt,
});

/** Loads req.user from the session cookie (role always comes from the DB, never the client). */
export async function loadSession(req, res, next) {
  req.user = null;
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== 'string' || token.length > 100) return next();

  const [row] = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(
      eq(schema.sessions.tokenHash, sha256(token)),
      gt(schema.sessions.expiresAt, new Date()),
      isNull(schema.users.deletedAt),
    ))
    .limit(1);

  if (!row) {
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
    return next();
  }

  req.user = row.user;
  req.sessionId = row.session.id;

  if (Date.now() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(schema.sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + TTL_MS) })
      .where(eq(schema.sessions.id, row.session.id));
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requirePermission(...permissions) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!permissions.every((p) => can(req.user.role, p))) return next(forbidden());
    next();
  };
}

export function requireAnyPermission(...permissions) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!permissions.some((p) => can(req.user.role, p))) return next(forbidden());
    next();
  };
}
