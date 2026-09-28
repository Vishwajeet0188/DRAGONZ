// Admin: announcements, analytics, site settings.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, gte, isNull, like, notLike, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/session.js';
import { sensitiveLimiter } from '../../middleware/security.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { chunk } from '../../integrations/http.js';
import { audit } from '../../services/audit.js';
import { queueEmail } from '../../services/email/index.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY, getPublicSettings } from '../system/system.routes.js';
import { httpsUrl } from '../../lib/validators.js';
import { env } from '../../config/env.js';

const { users, notificationPreferences, notifications, auditLogs, pageViewsDaily, members, videos, follows, communitySubmissions, siteSettings } = schema;

export const platformAdminRouter = Router();

// ── Announcements ─────────────────────────────────────────────────────────
platformAdminRouter.get('/announcements', requirePermission(P.NOTIFICATIONS_MANAGE), async (_req, res) => {
  const rows = await db.select({ id: auditLogs.id, createdAt: auditLogs.createdAt, metadata: auditLogs.metadata, actorName: users.displayName })
    .from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId)).where(eq(auditLogs.action, 'announcement.send'))
    .orderBy(desc(auditLogs.createdAt)).limit(20);
  const [{ inApp }] = await db.select({ inApp: count() }).from(users).where(isNull(users.deletedAt));
  const [{ email }] = await db.select({ email: count() }).from(notificationPreferences).innerJoin(users, eq(users.id, notificationPreferences.userId))
    .where(and(eq(notificationPreferences.emailAnnouncements, true), isNull(users.deletedAt), sql`${users.emailVerifiedAt} is not null`));
  res.json({ data: rows, meta: { audience: { inApp, email } } });
});

platformAdminRouter.post('/announcements', requirePermission(P.NOTIFICATIONS_MANAGE), sensitiveLimiter, validate({ body: z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(1500),
  url: httpsUrl.optional().or(z.string().regex(/^\/[a-z0-9/_-]*$/).optional()).or(z.literal('').transform(() => undefined)),
  sendEmail: z.boolean().default(false),
}).strict() }), async (req, res) => {
  const { title, body, url, sendEmail } = req.body;
  const announceId = randomUUID();
  const recipients = await db.select({ id: users.id, email: users.email, displayName: users.displayName, verified: users.emailVerifiedAt,
    inApp: notificationPreferences.inAppEnabled, emailOk: notificationPreferences.emailAnnouncements })
    .from(users).leftJoin(notificationPreferences, eq(notificationPreferences.userId, users.id)).where(isNull(users.deletedAt));

  let inApp = 0;
  for (const batch of chunk(recipients.filter((r) => r.inApp !== false), 500)) {
    await db.insert(notifications).values(batch.map((r) => ({ userId: r.id, type: 'ANNOUNCEMENT', title, body, url: url ?? null, dedupeKey: `announce:${announceId}` }))).onConflictDoNothing();
    inApp += batch.length;
  }
  let emailed = 0;
  if (sendEmail) {
    const fullUrl = url?.startsWith('/') ? `${env.APP_URL}${url}` : url;
    for (const r of recipients) {
      if (!r.emailOk || !r.verified) continue; // opt-in only
      if (await queueEmail({ to: r.email, template: 'announcement', data: { displayName: r.displayName, title, body, url: fullUrl }, dedupeKey: `announce:${announceId}:${r.id}` })) emailed++;
    }
  }
  await audit(req.user.id, 'announcement.send', 'announcement', null, { title, inApp, emailed });
  res.status(201).json({ data: { inApp, emailed } });
});

// ── Analytics ─────────────────────────────────────────────────────────────
platformAdminRouter.get('/analytics', requirePermission(P.ANALYTICS_READ), validate({ query: z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }) }), async (req, res) => {
  const { days } = req.validatedQuery;
  const since = new Date(Date.now() - days * 86_400_000);
  const sinceDay = since.toISOString().slice(0, 10);
  const pv = and(gte(pageViewsDaily.day, sinceDay), notLike(pageViewsDaily.path, '/_click/%'));

  const [daily, topPages, topMembers, topVideos, [totals], signups, subsByStatus] = await Promise.all([
    db.select({ day: pageViewsDaily.day, views: sql`sum(${pageViewsDaily.count})::int` }).from(pageViewsDaily).where(pv).groupBy(pageViewsDaily.day).orderBy(pageViewsDaily.day),
    db.select({ path: pageViewsDaily.path, views: sql`sum(${pageViewsDaily.count})::int` }).from(pageViewsDaily).where(pv).groupBy(pageViewsDaily.path).orderBy(desc(sql`2`)).limit(10),
    db.select({ slug: pageViewsDaily.entityId, name: members.displayName, views: sql`sum(${pageViewsDaily.count})::int` }).from(pageViewsDaily)
      .innerJoin(members, eq(members.slug, pageViewsDaily.entityId))
      .where(and(pv, eq(pageViewsDaily.entityType, 'member'))).groupBy(pageViewsDaily.entityId, members.displayName).orderBy(desc(sql`3`)).limit(8),
    db.select({ id: videos.id, title: videos.title, member: members.displayName, clicks: sql`sum(${pageViewsDaily.count})::int` }).from(pageViewsDaily)
      .innerJoin(videos, sql`${videos.id}::text = ${pageViewsDaily.entityId}`).innerJoin(members, eq(members.id, videos.memberId))
      .where(and(gte(pageViewsDaily.day, sinceDay), like(pageViewsDaily.path, '/_click/video/%'))).groupBy(videos.id, videos.title, members.displayName).orderBy(desc(sql`4`)).limit(8),
    db.select({
      users: sql`(select count(*)::int from users where deleted_at is null)`,
      follows: sql`(select count(*)::int from follows)`,
      emailLiveSubscribers: sql`(select count(*)::int from notification_preferences where email_live_alerts)`,
      reminders: sql`(select count(*)::int from event_reminders)`,
      members: sql`(select count(*)::int from members where deleted_at is null)`,
    }).from(sql`(select 1) as x`),
    db.select({ day: sql`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`, n: count() }).from(users)
      .where(and(gte(users.createdAt, since), isNull(users.deletedAt))).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ status: communitySubmissions.status, n: count() }).from(communitySubmissions).where(isNull(communitySubmissions.deletedAt)).groupBy(communitySubmissions.status),
  ]);
  const topFollowed = await db.select({ name: members.displayName, slug: members.slug, followers: count() }).from(follows)
    .innerJoin(members, eq(members.id, follows.memberId)).groupBy(members.id).orderBy(desc(count())).limit(8);

  res.json({ data: { days, daily, topPages, topMembers, topVideos, topFollowed, totals, signups, submissions: subsByStatus, eventReminders: totals.reminders } });
});

// ── Settings ──────────────────────────────────────────────────────────────
const settingsBody = z.object({
  discordUrl: z.string().trim().url().max(300).refine((u) => /^https:\/\/(discord\.gg|discord\.com)\//.test(u), 'Must be a discord.gg or discord.com link'),
  heroTagline: z.string().trim().max(200),
  bannerText: z.string().trim().max(160),
  bannerUrl: z.string().trim().max(300).refine((u) => !u || /^https:\/\//.test(u) || /^\/[a-z0-9/_-]*$/.test(u), 'Use an https:// link or a site path like /events'),
  recruitmentOpen: z.boolean(),
}).strict();

platformAdminRouter.get('/settings', requirePermission(P.SETTINGS_MANAGE), async (_req, res) => {
  res.json({ data: await getPublicSettings(), meta: { defaults: DEFAULT_SETTINGS } });
});
platformAdminRouter.put('/settings', requirePermission(P.SETTINGS_MANAGE), validate({ body: settingsBody }), async (req, res) => {
  await db.insert(siteSettings).values({ key: SETTINGS_KEY, value: req.body })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: req.body, updatedAt: new Date() } });
  await audit(req.user.id, 'settings.update', 'settings', SETTINGS_KEY, { fields: Object.keys(req.body) });
  res.json({ data: req.body });
});


