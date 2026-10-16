// Shooters — dedicated gang fighters shown on their own page with combat stats and POV clips.
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/session.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { optionalMediaUrl } from '../../lib/validators.js';
import { isAllowedLink, youtubeId } from '../community/community.service.js';
import { audit } from '../../services/audit.js';

const { members, platformAccounts, shooterPovs } = schema;

const shooterCols = {
  id: members.id, slug: members.slug, displayName: members.displayName, rank: members.rank,
  rpCharacter: members.rpCharacter, tagline: members.tagline, bio: members.bio,
  avatarUrl: members.avatarUrl, bannerUrl: members.bannerUrl, accentColor: members.accentColor,
  shooterStats: members.shooterStats, rankOrder: members.rankOrder,
};
const activeShooter = and(isNull(members.deletedAt), inArray(members.status, ['ACTIVE', 'ALUMNI']), eq(members.isShooter, true));

// ── Public ─────────────────────────────────────────────────────────────────
export const shootersRouter = Router();
shootersRouter.get('/', async (_req, res) => {
  const rows = await db.select(shooterCols).from(members).where(activeShooter)
    .orderBy(asc(members.rankOrder), asc(members.displayName)).limit(100);
  if (!rows.length) { res.set('Cache-Control', 'public, max-age=60'); return res.json({ data: [] }); }
  const ids = rows.map((r) => r.id);
  const [plats, povs] = await Promise.all([
    db.select({ memberId: platformAccounts.memberId, platform: platformAccounts.platform, url: platformAccounts.url, isPrimary: platformAccounts.isPrimary })
      .from(platformAccounts).where(inArray(platformAccounts.memberId, ids)).orderBy(desc(platformAccounts.isPrimary)),
    db.select().from(shooterPovs).where(inArray(shooterPovs.memberId, ids)).orderBy(asc(shooterPovs.sortOrder), desc(shooterPovs.createdAt)),
  ]);
  const platBy = Map.groupBy(plats, (p) => p.memberId);
  const povBy = Map.groupBy(povs, (p) => p.memberId);
  const data = rows.map((m) => ({
    ...m,
    stats: Array.isArray(m.shooterStats) ? m.shooterStats : [],
    platforms: (platBy.get(m.id) ?? []).map((p) => ({ platform: p.platform, url: p.url })),
    povs: (povBy.get(m.id) ?? []).map((p) => {
      const yt = youtubeId(p.url);
      return { id: p.id, title: p.title, url: p.url, thumbnailUrl: p.thumbnailUrl || (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null) };
    }),
  }));
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ data });
});

// ── Admin: POV management ────────────────────────────────────────────────────
const idParam = z.object({ id: z.string().uuid() });
const memberParam = z.object({ memberId: z.string().uuid() });
const povBody = z.object({
  title: z.string().trim().min(2).max(140),
  url: z.string().trim().url().max(500).refine(isAllowedLink, 'Links must be https and from YouTube, Kick, Twitch, Instagram, TikTok, X, Streamable, Medal or Imgur'),
  thumbnailUrl: optionalMediaUrl,
}).strict();

export const shootersAdminRouter = Router();
shootersAdminRouter.use(requirePermission(P.MEMBERS_MANAGE));

shootersAdminRouter.get('/:memberId/povs', validate({ params: memberParam }), async (req, res) => {
  const rows = await db.select().from(shooterPovs).where(eq(shooterPovs.memberId, req.params.memberId))
    .orderBy(asc(shooterPovs.sortOrder), desc(shooterPovs.createdAt));
  res.json({ data: rows });
});

shootersAdminRouter.post('/:memberId/povs', validate({ params: memberParam, body: povBody }), async (req, res) => {
  const [m] = await db.select({ id: members.id }).from(members).where(and(eq(members.id, req.params.memberId), isNull(members.deletedAt))).limit(1);
  if (!m) throw badRequest('Unknown member');
  const next = Number((await db.select({ max: sql`coalesce(max(${shooterPovs.sortOrder}), 0)` }).from(shooterPovs).where(eq(shooterPovs.memberId, m.id)))[0].max) + 1;
  const [row] = await db.insert(shooterPovs).values({ ...req.body, memberId: m.id, sortOrder: next }).returning();
  await audit(req.user.id, 'shooter.pov.create', 'shooter_pov', row.id, { memberId: m.id, title: row.title });
  res.status(201).json({ data: row });
});

shootersAdminRouter.patch('/povs/:id', validate({ params: idParam, body: povBody.partial().extend({ sortOrder: z.coerce.number().int().min(0).max(9999).optional() }) }), async (req, res) => {
  const [row] = await db.update(shooterPovs).set({ ...req.body, updatedAt: new Date() }).where(eq(shooterPovs.id, req.params.id)).returning();
  if (!row) throw notFound('POV not found');
  res.json({ data: row });
});

shootersAdminRouter.delete('/povs/:id', validate({ params: idParam }), async (req, res) => {
  const [row] = await db.delete(shooterPovs).where(eq(shooterPovs.id, req.params.id)).returning({ id: shooterPovs.id });
  if (!row) throw notFound('POV not found');
  await audit(req.user.id, 'shooter.pov.delete', 'shooter_pov', row.id);
  res.status(204).end();
});
