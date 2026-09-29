// Following creators, notification preferences and in-app notifications.
// Everything is scoped to req.user.id — no user id is ever taken from the request (IDOR-safe).
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, isNull, inArray } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/session.js';
import { notFound } from '../../lib/errors.js';
import { randomToken } from '../../lib/crypto.js';
import { hydrateMembers, memberCardColumns } from '../members/members.service.js';
import { awardXp } from '../../services/xp.js';

const { follows, members, notifications, notificationPreferences } = schema;
const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });

async function memberBySlug(slug) {
  const [m] = await db.select({ id: members.id }).from(members)
    .where(and(eq(members.slug, slug), isNull(members.deletedAt))).limit(1);
  if (!m) throw notFound('Member not found');
  return m;
}

// ── /api/members/:slug/follow ─────────────────────────────────────────────
export const followRouter = Router({ mergeParams: true });
followRouter.use(requireAuth);

followRouter.put('/', validate({ params: slugParam, body: z.object({ notifyLive: z.boolean().default(true) }).strict() }), async (req, res) => {
  const m = await memberBySlug(req.params.slug);
  await db.insert(follows).values({ userId: req.user.id, memberId: m.id, notifyLive: req.body.notifyLive })
    .onConflictDoUpdate({ target: [follows.userId, follows.memberId], set: { notifyLive: req.body.notifyLive } });
  await awardXp(req.user.id, 'FOLLOW', m.id); // once per creator, ever
  res.json({ data: { following: true, notifyLive: req.body.notifyLive } });
});

followRouter.delete('/', validate({ params: slugParam }), async (req, res) => {
  const m = await memberBySlug(req.params.slug);
  await db.delete(follows).where(and(eq(follows.userId, req.user.id), eq(follows.memberId, m.id)));
  res.json({ data: { following: false } });
});

// ── /api/me/... ───────────────────────────────────────────────────────────
export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get('/follows', async (req, res) => {
  const rows = await db.select({ ...memberCardColumns, notifyLive: follows.notifyLive })
    .from(follows).innerJoin(members, eq(members.id, follows.memberId))
    .where(and(eq(follows.userId, req.user.id), isNull(members.deletedAt)))
    .orderBy(desc(follows.createdAt));
  const hydrated = await hydrateMembers(rows);
  res.json({ data: hydrated });
});

async function getPrefs(userId) {
  const [p] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  if (p) return p;
  const [created] = await db.insert(notificationPreferences).values({ userId, unsubscribeToken: randomToken(24) })
    .onConflictDoNothing().returning();
  return created ?? (await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)))[0];
}
const publicPrefs = (p) => ({
  emailLiveAlerts: p.emailLiveAlerts, emailEventReminders: p.emailEventReminders,
  emailAnnouncements: p.emailAnnouncements, inAppEnabled: p.inAppEnabled,
});

meRouter.get('/notification-preferences', async (req, res) => {
  res.json({ data: publicPrefs(await getPrefs(req.user.id)) });
});

meRouter.put('/notification-preferences', validate({ body: z.object({
  emailLiveAlerts: z.boolean().optional(),
  emailEventReminders: z.boolean().optional(),
  emailAnnouncements: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
}).strict() }), async (req, res) => {
  await getPrefs(req.user.id);
  const [p] = await db.update(notificationPreferences).set(req.body).where(eq(notificationPreferences.userId, req.user.id)).returning();
  res.json({ data: publicPrefs(p) });
});

meRouter.get('/notifications', async (req, res) => {
  const [items, [{ unread }]] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, req.user.id)).orderBy(desc(notifications.createdAt)).limit(30),
    db.select({ unread: count() }).from(notifications).where(and(eq(notifications.userId, req.user.id), isNull(notifications.readAt))),
  ]);
  res.json({ data: items.map(({ dedupeKey, userId, ...n }) => n), meta: { unread } });
});

meRouter.post('/notifications/read', validate({ body: z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).strict() }), async (req, res) => {
  const filters = [eq(notifications.userId, req.user.id), isNull(notifications.readAt)];
  if (req.body.ids?.length) filters.push(inArray(notifications.id, req.body.ids));
  await db.update(notifications).set({ readAt: new Date() }).where(and(...filters));
  res.json({ data: { ok: true } });
});
