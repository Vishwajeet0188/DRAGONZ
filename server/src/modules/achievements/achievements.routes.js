// Hall of Fame (public), achievements + creator milestones (admin).
import { Router } from 'express';
import { z } from 'zod';
import { desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/session.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { notFound } from '../../lib/errors.js';
import { compact } from '../../lib/util.js';
import { optionalMediaUrl, optionalText } from '../../lib/validators.js';
import { audit } from '../../services/audit.js';

const { achievements, milestones, members } = schema;
const memberMini = { id: members.id, slug: members.slug, displayName: members.displayName, avatarUrl: members.avatarUrl, accentColor: members.accentColor };
const idParam = z.object({ id: z.string().uuid() });
const withMember = (rows, key) => rows.map((r) => ({ ...r[key], member: r.member?.id ? r.member : null }));

export const hallOfFameRouter = Router();
hallOfFameRouter.get('/', async (_req, res) => {
  const [ach, ms] = await Promise.all([
    db.select({ achievement: achievements, member: memberMini }).from(achievements).leftJoin(members, eq(members.id, achievements.memberId))
      .where(eq(achievements.inHallOfFame, true)).orderBy(desc(achievements.achievedAt)).limit(200),
    db.select({ milestone: milestones, member: memberMini }).from(milestones).innerJoin(members, eq(members.id, milestones.memberId))
      .where(isNull(members.deletedAt)).orderBy(desc(milestones.isFeatured), desc(milestones.achievedAt)).limit(24),
  ]);
  res.set('Cache-Control', 'public, max-age=120');
  res.json({ data: { achievements: withMember(ach, 'achievement'), milestones: withMember(ms, 'milestone') } });
});

// ── Admin ────────────────────────────────────────────────────────────────
const memberId = z.string().uuid().nullable().optional().or(z.literal('').transform(() => null));
const achievementBody = z.object({
  title: z.string().trim().min(3).max(160),
  description: optionalText(3000),
  category: z.enum(['TOURNAMENT', 'EVENT', 'MILESTONE', 'MOMENT', 'HISTORY']),
  achievedAt: z.coerce.date(),
  imageUrl: optionalMediaUrl,
  memberId,
  isFeatured: z.boolean().default(false),
  inHallOfFame: z.boolean().default(true),
}).strict();
const milestoneBody = z.object({
  memberId: z.string().uuid(),
  platform: z.enum(['YOUTUBE', 'KICK', 'TWITCH', 'INSTAGRAM', 'TIKTOK', 'X', 'DISCORD']).nullable().optional().or(z.literal('').transform(() => null)),
  type: z.enum(['SUBSCRIBERS', 'FOLLOWERS', 'VIEWS', 'RP_ACHIEVEMENT', 'CUSTOM']),
  value: z.coerce.number().int().min(0).max(1e12).nullable().optional(),
  title: z.string().trim().min(3).max(120),
  achievedAt: z.coerce.date(),
  isFeatured: z.boolean().default(false),
}).strict();

function crud(router, table, body, name, perm) {
  router.get(`/${name}`, requirePermission(perm), async (_req, res) => {
    const rows = await db.select({ item: table, member: memberMini }).from(table).leftJoin(members, eq(members.id, table.memberId))
      .orderBy(desc(table.achievedAt)).limit(500);
    res.json({ data: withMember(rows, 'item') });
  });
  router.post(`/${name}`, requirePermission(perm), validate({ body }), async (req, res) => {
    const [row] = await db.insert(table).values(req.body).returning();
    await audit(req.user.id, `${name}.create`, name, row.id, { title: row.title });
    res.status(201).json({ data: row });
  });
  router.patch(`/${name}/:id`, requirePermission(perm), validate({ params: idParam, body }), async (req, res) => {
    const [row] = await db.update(table).set({ ...compact(req.body), updatedAt: new Date() }).where(eq(table.id, req.params.id)).returning();
    if (!row) throw notFound();
    await audit(req.user.id, `${name}.update`, name, row.id);
    res.json({ data: row });
  });
  router.delete(`/${name}/:id`, requirePermission(perm), validate({ params: idParam }), async (req, res) => {
    const [row] = await db.delete(table).where(eq(table.id, req.params.id)).returning({ id: table.id });
    if (!row) throw notFound();
    await audit(req.user.id, `${name}.delete`, name, row.id);
    res.status(204).end();
  });
}

export const achievementsAdminRouter = Router();
crud(achievementsAdminRouter, achievements, achievementBody, 'achievements', P.ACHIEVEMENTS_MANAGE);
crud(achievementsAdminRouter, milestones, milestoneBody, 'milestones', P.ACHIEVEMENTS_MANAGE);

