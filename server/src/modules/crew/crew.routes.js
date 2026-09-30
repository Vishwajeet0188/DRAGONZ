// Crew activity: public weekly ranking + admin rules for "Featured crew".
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/session.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../services/audit.js';
import { CREW_BADGES, crewReport, getCrewRules, invalidateCrew, saveCrewRules, weekLeaderboard } from '../../services/crew.js';

const { members } = schema;

export const crewRouter = Router();
crewRouter.get('/week', validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(30).default(10) }) }), async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ data: await weekLeaderboard(req.validatedQuery.limit) });
});

// ── Admin (/api/admin/crew) ─────────────────────────────────────────────
export const crewAdminRouter = Router();
crewAdminRouter.use(requirePermission(P.MEMBERS_MANAGE));

crewAdminRouter.get('/', async (_req, res) => {
  invalidateCrew();
  const r = await crewReport();
  res.json({
    data: {
      rules: r.rules, week: r.week, lastWeekKey: r.lastWeekKey, badges: CREW_BADGES, streamerOfWeekId: r.streamerOfWeekId,
      members: r.rows
        .map((x) => ({ ...x, badges: x.badgeKeys.map((k) => ({ key: k, ...CREW_BADGES[k] })) }))
        .sort((a, b) => b.score - a.score || a.member.rankOrder - b.member.rankOrder),
    },
  });
});

const rulesBody = z.object({
  mode: z.enum(['AUTO', 'MANUAL']).optional(),
  minStreams: z.coerce.number().int().min(0).max(50).optional(),
  minHours: z.coerce.number().min(0).max(168).optional(),
  minDays: z.coerce.number().int().min(0).max(7).optional(),
  minUploads: z.coerce.number().int().min(0).max(50).optional(),
  minSessionMinutes: z.coerce.number().int().min(0).max(240).optional(),
  maxFeatured: z.coerce.number().int().min(1).max(24).optional(),
  showProgress: z.boolean().optional(),
}).strict();

crewAdminRouter.put('/rules', validate({ body: rulesBody }), async (req, res) => {
  const rules = await saveCrewRules(req.body);
  await audit(req.user.id, 'crew.rules', 'settings', null, req.body);
  res.json({ data: rules });
});

// Pin (always featured) or exclude (never auto-featured) one member.
crewAdminRouter.patch('/members/:id', validate({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ pinned: z.boolean().optional(), excluded: z.boolean().optional() }).strict(),
}), async (req, res) => {
  const [m] = await db.select({ id: members.id }).from(members).where(and(eq(members.id, req.params.id), isNull(members.deletedAt))).limit(1);
  if (!m) throw notFound('Member not found');
  if (req.body.pinned !== undefined) await db.update(members).set({ isFeatured: req.body.pinned }).where(eq(members.id, m.id));
  if (req.body.excluded !== undefined) {
    const rules = await getCrewRules();
    const set = new Set(rules.excluded ?? []);
    if (req.body.excluded) set.add(m.id); else set.delete(m.id);
    await saveCrewRules({ excluded: [...set] });
  }
  invalidateCrew();
  await audit(req.user.id, 'crew.member', 'member', m.id, req.body);
  res.json({ data: { id: m.id, ...req.body } });
});
