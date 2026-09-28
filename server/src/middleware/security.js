import rateLimit from 'express-rate-limit';
import { allowedOrigins, env, isProd } from '../config/env.js';
import { randomToken, safeEqual } from '../lib/crypto.js';
import { forbidden, tooMany } from '../lib/errors.js';

// ── CSRF: double-submit token + Origin check ──────────────────────────────
export const CSRF_COOKIE = isProd ? '__Host-dz_csrf' : 'dz_csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** GET /api/auth/csrf — issues (or re-uses) a CSRF token. */
export function issueCsrf(req, res) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || token.length !== 43) {
    token = randomToken(32);
    res.cookie(CSRF_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
  }
  res.json({ data: { csrfToken: token } });
}

export function csrfProtection(req, _res, next) {
  if (SAFE.has(req.method)) return next();
  // Webhooks from platforms are authenticated by signatures instead (Phase 3).
  if (req.path.startsWith('/webhooks/')) return next();

  const origin = req.get('origin');
  if (origin && !allowedOrigins.includes(origin)) return next(forbidden('Cross-origin request blocked'));

  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) {
    return next(forbidden('Security token missing or expired. Please refresh and try again.'));
  }
  next();
}

// ── Rate limiting ─────────────────────────────────────────────────────────
// In-memory store is fine for a single instance. For multiple instances use a shared store
// (e.g. rate-limit-redis) and keep Cloudflare rate-limiting rules in front.
const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.DISABLE_RATE_LIMIT,
    handler: (_req, _res, next) => next(tooMany(message)),
  });

export const apiLimiter = make(60_000, 300);
export const loginLimiter = make(15 * 60_000, 20, 'Too many sign-in attempts. Try again in a few minutes.');
export const registerLimiter = make(60 * 60_000, 10, 'Too many accounts created from this network. Try again later.');
export const emailLimiter = make(60 * 60_000, 5, 'Too many email requests. Please wait before trying again.');
export const sensitiveLimiter = make(15 * 60_000, 10);
export const uploadLimiter = make(60 * 60_000, 30, 'Too many uploads. Please wait a while.');
export const submitLimiter = make(60 * 60_000, 10, 'Too many submissions. Please try again later.');
export const beaconLimiter = make(60_000, 120);
