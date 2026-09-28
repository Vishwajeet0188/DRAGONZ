// Cron tick, privacy-friendly analytics beacons, and public site settings.
import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { env } from '../../config/env.js';
import { safeEqual } from '../../lib/crypto.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { beaconLimiter } from '../../middleware/security.js';
import { tick } from '../../services/jobs.js';

// ── Cron ────────────────────────────────────────────────────────────────
export const cronRouter = Router();
cronRouter.get('/tick', async (req, res) => {
  if (!env.CRON_SECRET) throw notFound();
  const provided = req.get('authorization')?.replace(/^Bearer\s+/i, '') || String(req.query.key ?? '');
  if (!safeEqual(provided, env.CRON_SECRET)) throw forbidden('Invalid cron key');
  res.set('Cache-Control', 'no-store');
  res.json({ data: await tick() });
});

// ── Analytics (aggregated counters only — no IPs, no user ids, no cookies) ──
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python|axios/i;
const TRACKED = [
  [/^\/$/, null],
  [/^\/(members|live|videos|news|events|community|hall-of-fame|about|search)$/, null],
  [/^\/members\/([a-z0-9-]{1,80})$/, 'member'],
  [/^\/news\/([a-z0-9-]{1,120})$/, 'news'],
  [/^\/events\/([a-z0-9-]{1,120})$/, 'event'],
];

async function bump(path, entityType = null, entityId = null) {
  const day = new Date().toISOString().slice(0, 10);
  await db.insert(schema.pageViewsDaily).values({ day, path, entityType, entityId, count: 1 })
    .onConflictDoUpdate({ target: [schema.pageViewsDaily.day, schema.pageViewsDaily.path], set: { count: sql`${schema.pageViewsDaily.count} + 1` } });
}

export const analyticsRouter = Router();
analyticsRouter.use(beaconLimiter);
analyticsRouter.post('/pv', validate({ body: z.object({ path: z.string().max(200) }) }), async (req, res) => {
  if (!BOT_RE.test(req.get('user-agent') ?? '') && req.get('dnt') !== '1') {
    const path = req.body.path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    for (const [re, type] of TRACKED) {
      const m = re.exec(path);
      if (m) { await bump(path, type, type ? m[1] : null); break; }
    }
  }
  res.status(204).end();
});
analyticsRouter.post('/click', validate({ body: z.object({ type: z.enum(['video', 'stream']), id: z.string().uuid() }) }), async (req, res) => {
  if (!BOT_RE.test(req.get('user-agent') ?? '')) await bump(`/_click/${req.body.type}/${req.body.id}`, req.body.type, req.body.id);
  res.status(204).end();
});

// ── Site settings ───────────────────────────────────────────────────────
export const SETTINGS_KEY = 'site.public';
export const DEFAULT_SETTINGS = {
  discordUrl: 'https://discord.gg/XFGb4eZxYF',
  heroTagline: 'The official home of DRZ — every member, creator and live stream from the city, in one place.',
  bannerText: '',
  bannerUrl: '',
  recruitmentOpen: false,
};

export async function getPublicSettings() {
  const [row] = await db.select().from(schema.siteSettings).where(eq(schema.siteSettings.key, SETTINGS_KEY)).limit(1);
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export const settingsRouter = Router();
settingsRouter.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ data: await getPublicSettings() });
});
