import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, createSession, destroySession, publicUser } from '../../middleware/session.js';
import { issueCsrf, loginLimiter, registerLimiter, emailLimiter, sensitiveLimiter } from '../../middleware/security.js';
import * as v from './auth.validators.js';
import * as auth from './auth.service.js';

export const authRouter = Router();

authRouter.get('/csrf', issueCsrf);

authRouter.get('/me', (req, res) => {
  res.json({ data: { user: req.user ? publicUser(req.user) : null } });
});

authRouter.post('/register', registerLimiter, validate({ body: v.registerSchema }), async (req, res) => {
  const user = await auth.register(req.body);
  await createSession(res, user.id, req.get('user-agent'));
  res.status(201).json({ data: { user: publicUser(user) } });
});

authRouter.post('/login', loginLimiter, validate({ body: v.loginSchema }), async (req, res) => {
  if (req.user) await destroySession(req, res); // rotate session on login (prevents fixation)
  const user = await auth.login(req.body);
  await createSession(res, user.id, req.get('user-agent'));
  res.json({ data: { user: publicUser(user) } });
});

authRouter.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ data: { ok: true } });
});

authRouter.post('/verify-email', sensitiveLimiter, validate({ body: v.tokenSchema }), async (req, res) => {
  await auth.verifyEmail(req.body.token);
  res.json({ data: { ok: true } });
});

authRouter.post('/resend-verification', requireAuth, emailLimiter, async (req, res) => {
  if (req.user.emailVerifiedAt) return res.json({ data: { ok: true, alreadyVerified: true } });
  await auth.resendVerification(req.user);
  res.json({ data: { ok: true } });
});

authRouter.post('/forgot-password', emailLimiter, validate({ body: v.emailOnlySchema }), async (req, res) => {
  await auth.forgotPassword(req.body.email);
  res.json({ data: { ok: true, message: 'If an account exists for that email, a reset link is on its way.' } });
});

authRouter.post('/reset-password', sensitiveLimiter, validate({ body: v.resetSchema }), async (req, res) => {
  await auth.resetPassword(req.body);
  res.json({ data: { ok: true } });
});

authRouter.post('/change-password', requireAuth, sensitiveLimiter, validate({ body: v.changePasswordSchema }), async (req, res) => {
  await auth.changePassword(req.user, req.body, req.sessionId);
  res.json({ data: { ok: true } });
});
