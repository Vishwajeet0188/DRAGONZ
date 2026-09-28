// Public Live Hub + Video Hub endpoints.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, gte, ilike, isNull, inArray } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { escapeLike, pageMeta, paginate } from '../../lib/util.js';
import { PLATFORMS } from '../../db/schema.js';
import { loadStatus } from '../../integrations/sync.service.js';
import { env } from '../../config/env.js';

import { requirePermission } from '../../middleware/session.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { isPlatformUrl } from '../../lib/platforms.js';
import { notFound } from '../../lib/errors.js';
import { optionalMediaUrl } from '../../lib/validators.js';
import { audit } from '../../services/audit.js';
import { compact } from '../../lib/util.js';
const { liveStreams, videos, members } = schema;
const memberMini = { id: members.id, slug: members.slug, displayName: members.displayName, avatarUrl: members.avatarUrl, accentColor: members.accentColor, rank: members.rank };
const visibleMember = and(isNull(members.deletedAt), inArray(members.status, ['ACTIVE', 'ALUMNI']));

export const liveRouter = Router();

liveRouter.get('/', async (_req, res) => {
  const [live, recent, status] = await Promise.all([
    db.select({ stream: liveStreams, member: memberMini }).from(liveStreams)
      .innerJoin(members, eq(members.id, liveStreams.memberId))
      .where(and(eq(liveStreams.isLive, true), visibleMember))
      .orderBy(desc(liveStreams.viewerCount), desc(liveStreams.startedAt)).limit(50),
    db.select({ stream: liveStreams, member: memberMini }).from(liveStreams)
      .innerJoin(members, eq(members.id, liveStreams.memberId))
      .where(and(eq(liveStreams.isLive, false), gte(liveStreams.endedAt, new Date(Date.now() - 24 * 3600_000)), visibleMember))
      .orderBy(desc(liveStreams.endedAt)).limit(6),
    loadStatus(),
  ]);
  res.set('Cache-Control', 'public, max-age=20');
  res.json({
    data: {
      live: live.map(({ stream, member }) => ({ ...stream, member })),
      recentlyEnded: recent.map(({ stream, member }) => ({ ...stream, member })),
      sync: { mode: env.STREAMING_MODE, lastRunAt: status.lastRunAt ?? null, intervalSeconds: env.SYNC_INTERVAL_SECONDS },
    },
  });
});

export const videosRouter = Router();

const videosQuery = z.object({
  q: z.string().trim().max(80).optional(),
  member: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
  platform: z.enum(PLATFORMS).optional(),
  featured: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sort: z.enum(['latest', 'popular']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

videosRouter.get('/', validate({ query: videosQuery }), async (req, res) => {
  const { q, member, platform, featured, sort, page, pageSize } = req.validatedQuery;
  const pg = paginate({ page, pageSize });
  const filters = [visibleMember, eq(videos.isHidden, false), isNull(videos.deletedAt)];
  if (q) filters.push(ilike(videos.title, `%${escapeLike(q)}%`));
  if (member) filters.push(eq(members.slug, member));
  if (platform) filters.push(eq(videos.platform, platform));
  if (featured) filters.push(eq(videos.isFeatured, true));
  const where = and(...filters);
  // "Latest" (default): admin-starred videos first, then newest. "Most viewed" is purely by views.
  const order = sort === 'popular' ? [desc(videos.viewCount), desc(videos.publishedAt)] : [desc(videos.isFeatured), desc(videos.publishedAt)];

  const [rows, [{ total }]] = await Promise.all([
    db.select({ video: videos, member: memberMini }).from(videos).innerJoin(members, eq(members.id, videos.memberId))
      .where(where).orderBy(...order).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(videos).innerJoin(members, eq(members.id, videos.memberId)).where(where),
  ]);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ data: rows.map(({ video, member: m }) => ({ ...video, member: m })), meta: pageMeta(pg, total) });
});

/** Creators that have at least one video — for the filter dropdown. */
videosRouter.get('/creators', async (_req, res) => {
  const rows = await db.selectDistinct({ slug: members.slug, displayName: members.displayName })
    .from(videos).innerJoin(members, eq(members.id, videos.memberId)).where(and(visibleMember, eq(videos.isHidden, false), isNull(videos.deletedAt))).orderBy(members.displayName);
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ data: rows });
});

// ── Admin: videos ─────────────────────────────────────────────────────────
// Synced videos can be featured or hidden (the sync never un-hides them); manual videos cover
// platforms without a public video API (e.g. Kick VODs, Instagram reels).

const videoBody = z.object({
  memberId: z.string().uuid(),
  platform: z.enum(PLATFORMS),
  title: z.string().trim().min(2).max(200),
  url: z.string().trim().url().max(500),
  thumbnailUrl: optionalMediaUrl,
  publishedAt: z.coerce.date(),
  durationSec: z.coerce.number().int().min(0).max(86400 * 2).nullable().optional(),
  isFeatured: z.boolean().default(false),
  isHidden: z.boolean().default(false),
}).strict().refine((v) => isPlatformUrl(v.platform, v.url), { message: 'URL must be an https link on the platform’s official domain', path: ['url'] });
const flagsBody = z.object({ isFeatured: z.boolean().optional(), isHidden: z.boolean().optional() }).strict();
const idParam = z.object({ id: z.string().uuid() });

export const videosAdminRouter = Router();
videosAdminRouter.use(requirePermission(P.VIDEOS_MANAGE));
videosAdminRouter.get('/', validate({ query: z.object({
  q: z.string().trim().max(80).optional(),
  source: z.enum(['MANUAL', 'SYNC', 'MOCK']).optional(),
  page: z.coerce.number().int().min(1).default(1),
}) }), async (req, res) => {
  const { q, source, page } = req.validatedQuery;
  const pg = paginate({ page, pageSize: 20 });
  const filters = [isNull(members.deletedAt), isNull(videos.deletedAt)];
  if (q) filters.push(ilike(videos.title, `%${escapeLike(q)}%`));
  if (source) filters.push(eq(videos.source, source));
  const where = and(...filters);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ video: videos, member: memberMini }).from(videos).innerJoin(members, eq(members.id, videos.memberId))
      .where(where).orderBy(desc(videos.publishedAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(videos).innerJoin(members, eq(members.id, videos.memberId)).where(where),
  ]);
  res.json({ data: rows.map(({ video, member: m }) => ({ ...video, member: m })), meta: pageMeta(pg, total) });
});
videosAdminRouter.post('/', validate({ body: videoBody }), async (req, res) => {
  const body = { ...req.body };
  if (!body.thumbnailUrl && body.platform === 'YOUTUBE') {
    const yt = /(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([A-Za-z0-9_-]{11})/.exec(body.url)?.[1];
    if (yt) body.thumbnailUrl = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`; // YouTube's public thumbnail
  }
  const [row] = await db.insert(videos).values({ ...body, source: 'MANUAL' }).returning();
  await audit(req.user.id, 'video.create', 'video', row.id, { title: row.title });
  res.status(201).json({ data: row });
});
videosAdminRouter.patch('/:id', validate({ params: idParam, body: flagsBody }), async (req, res) => {
  const [row] = await db.update(videos).set({ ...compact(req.body), updatedAt: new Date() }).where(and(eq(videos.id, req.params.id), isNull(videos.deletedAt))).returning();
  if (!row) throw notFound('Video not found');
  await audit(req.user.id, 'video.update', 'video', row.id, compact(req.body));
  res.json({ data: row });
});
videosAdminRouter.delete('/:id', validate({ params: idParam }), async (req, res) => {
  const [v] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
  if (!v || v.deletedAt) throw notFound('Video not found');
  // Synced videos keep a tombstone row so the next sync doesn't re-import them; manual ones are removed outright.
  if (v.source === 'SYNC') await db.update(videos).set({ deletedAt: new Date(), isHidden: true, isFeatured: false }).where(eq(videos.id, v.id));
  else await db.delete(videos).where(eq(videos.id, v.id));
  await audit(req.user.id, 'video.delete', 'video', v.id, { source: v.source });
  res.status(204).end();
});
