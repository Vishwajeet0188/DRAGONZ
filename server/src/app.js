import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { env, isProd, allowedOrigins } from './config/env.js';
import { logger } from './lib/logger.js';
import { loadSession } from './middleware/session.js';
import { apiLimiter, csrfProtection } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { membersRouter } from './modules/members/members.routes.js';
import { homeRouter } from './modules/home/home.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { liveRouter, videosRouter } from './modules/media/media.routes.js';
import { followRouter, meRouter } from './modules/follows/follows.routes.js';
import { createKickWebhookRouter } from './modules/webhooks/kick.routes.js';
import compression from 'compression';
import { eventsRouter } from './modules/events/events.routes.js';
import { newsRouter } from './modules/news/news.routes.js';
import { communityRouter } from './modules/community/community.routes.js';
import { hallOfFameRouter } from './modules/achievements/achievements.routes.js';
import { crewRouter } from './modules/crew/crew.routes.js';
import { pollsRouter } from './modules/fanzone/polls.js';
import { socialRouter } from './modules/fanzone/social.js';
import { quotesRouter } from './modules/fanzone/quotes.js';
import { clipsRouter } from './modules/fanzone/clips.js';
import { fansRouter, meFanRouter } from './modules/fanzone/fans.js';
import { myApplicationRouter } from './modules/fanzone/recruitment.js';
import { searchRouter } from './modules/search/search.routes.js';
import { memberSupportersRouter, meSupportersRouter } from './modules/supporters/supporters.routes.js';
import { meAvatarRouter } from './modules/uploads/uploads.routes.js';
import { cronRouter, analyticsRouter, settingsRouter } from './modules/system/system.routes.js';
import { LOCAL_DIR } from './services/storage.js';
import { pool } from './db/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY); // correct client IPs behind Cloudflare / load balancer

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'frame-src': ['https://www.youtube-nocookie.com', 'https://player.twitch.tv', 'https://player.kick.com'],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        ...(isProd ? {} : { 'upgrade-insecure-requests': null }),
      },
    },
    hsts: isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  app.use(compression());

  app.use(pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/api/health' },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }), // no query strings (may hold tokens)
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }));

  app.use('/api', cors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    maxAge: 600,
  }));
  app.use(express.json({
    limit: '100kb',
    // Webhook signatures are computed over the exact raw bytes, so keep them for /api/webhooks/*.
    verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buf; },
  }));
  app.use(cookieParser());

  // Locally stored media (dev / persistent-disk hosts). Files are re-encoded images with random names.
  if (env.STORAGE_DRIVER === 'local') {
    app.use('/media', express.static(LOCAL_DIR, {
      immutable: true, maxAge: '365d', index: false, dotfiles: 'deny', fallthrough: false,
      setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'"),
    }));
  }

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('select 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded' });
    }
  });

  const api = express.Router();
  // Default: never cache API responses (auth state, dashboards). Public list routes opt in to caching explicitly.
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(apiLimiter);
  api.use(loadSession);
  api.use(csrfProtection);
  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/home', homeRouter);
  api.use('/cron', cronRouter);
  api.use('/analytics', analyticsRouter);
  api.use('/settings', settingsRouter);
  api.use('/webhooks/kick', createKickWebhookRouter());
  api.use('/events', eventsRouter);
  api.use('/news', newsRouter);
  api.use('/community', communityRouter);
  api.use('/hall-of-fame', hallOfFameRouter);
  api.use('/search', searchRouter);
  api.use('/me/supporters', meSupportersRouter);
  api.use('/me/avatar', meAvatarRouter);
  api.use('/me/application', myApplicationRouter);
  api.use('/polls', pollsRouter);
  api.use('/social', socialRouter);
  api.use('/quotes', quotesRouter);
  api.use('/clips', clipsRouter);
  api.use('/fans', fansRouter);
  api.use('/crew', crewRouter);
  api.use('/members/:slug/supporters', memberSupportersRouter);
  api.use('/live', liveRouter);
  api.use('/videos', videosRouter);
  api.use('/me', meFanRouter); // /me/progress, /me/checkin
  api.use('/me', meRouter);
  api.use('/members/:slug/follow', followRouter);
  api.use('/members', membersRouter);
  api.use('/admin', adminRouter);
  api.use(notFoundHandler);
  app.use('/api', api);

  // Single-origin production deployment: serve the built SPA from the same server.
  const dist = path.resolve(import.meta.dirname, '../../client/dist');
  if (isProd && existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1y', immutable: true, setHeaders: (res, file) => {
      if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
    } }));
    // no-store: the Back button after sign-out can't restore a signed-in page from cache
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html'), { headers: { 'Cache-Control': 'no-store' } }));
  }

  app.use(errorHandler);
  return app;
}
