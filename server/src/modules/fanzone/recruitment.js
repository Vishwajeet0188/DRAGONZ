// Crew applications: fans apply while recruitment is open; admins review, accept or reject with a message.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requirePermission } from '../../middleware/session.js';
import { submitLimiter } from '../../middleware/security.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { paginate, pageMeta } from '../../lib/util.js';
import { httpsUrl } from '../../lib/validators.js';
import { audit } from '../../services/audit.js';
import { queueEmail } from '../../services/email/index.js';
import { awardXp, syncBadges } from '../../services/xp.js';
import { getPublicSettings } from '../system/system.routes.js';

const { crewApplications: apps, users, notifications } = schema;
const ACTIVE = ['PENDING', 'REVIEWING'];
const REAPPLY_DAYS = 30;

const applicantView = (a) => a && ({
  id: a.id, rpName: a.rpName, discordTag: a.discordTag, experience: a.experience, whyDrz: a.whyDrz,
  availability: a.availability, clipUrl: a.clipUrl, status: a.status, messageToApplicant: a.messageToApplicant,
  createdAt: a.createdAt, reviewedAt: a.reviewedAt,
});

async function latestFor(userId) {
  const [a] = await db.select().from(apps).where(eq(apps.userId, userId)).orderBy(desc(apps.createdAt)).limit(1);
  return a ?? null;
}

// ── Applicant (/api/me/application) ─────────────────────────────────────
export const myApplicationRouter = Router();
myApplicationRouter.use(requireAuth);

myApplicationRouter.get('/', async (req, res) => {
  const [latest, settings] = await Promise.all([latestFor(req.user.id), getPublicSettings()]);
  const canReapplyAt = latest?.status === 'REJECTED' && latest.reviewedAt ? new Date(new Date(latest.reviewedAt).getTime() + REAPPLY_DAYS * 86_400_000) : null;
  res.json({ data: { application: applicantView(latest), recruitmentOpen: Boolean(settings.recruitmentOpen), canReapplyAt } });
});

const applicationBody = z.object({
  rpName: z.string().trim().min(2).max(80),
  discordTag: z.string().trim().min(2).max(60).regex(/^[\w.#@-]+$/, 'Use your Discord username, e.g. dragonfan or dragonfan#1234'),
  ageConfirmed: z.literal(true, { errorMap: () => ({ message: 'You must be 18 or older to apply' }) }),
  experience: z.string().trim().min(30, 'Tell us a bit more (at least 30 characters)').max(2000),
  whyDrz: z.string().trim().min(30, 'Tell us a bit more (at least 30 characters)').max(2000),
  availability: z.string().trim().max(200).optional().transform((v) => v || null),
  clipUrl: httpsUrl.optional().or(z.literal('').transform(() => undefined)).transform((v) => v || null),
}).strict();

myApplicationRouter.post('/', submitLimiter, validate({ body: applicationBody }), async (req, res) => {
  if (!req.user.emailVerifiedAt) throw forbidden('Verify your email before applying.');
  const settings = await getPublicSettings();
  if (!settings.recruitmentOpen) throw forbidden('Recruitment is closed right now. Check back soon!');
  const latest = await latestFor(req.user.id);
  if (latest && ACTIVE.includes(latest.status)) throw conflict('You already have an application in review.');
  if (latest?.status === 'ACCEPTED') throw conflict('You are already part of the crew!');
  if (latest?.status === 'REJECTED' && latest.reviewedAt && Date.now() - new Date(latest.reviewedAt).getTime() < REAPPLY_DAYS * 86_400_000) {
    throw new AppError(429, 'TOO_SOON', `You can apply again ${REAPPLY_DAYS} days after your last application was reviewed.`);
  }
  const [row] = await db.insert(apps).values({ ...req.body, userId: req.user.id }).returning();
  await awardXp(req.user.id, 'APPLICATION_SENT', row.id);
  res.status(201).json({ data: applicantView(row) });
});

myApplicationRouter.delete('/', async (req, res) => {
  const latest = await latestFor(req.user.id);
  if (!latest || !ACTIVE.includes(latest.status)) throw notFound('No open application to withdraw');
  await db.update(apps).set({ status: 'WITHDRAWN' }).where(eq(apps.id, latest.id));
  res.status(204).end();
});

// ── Admin (/api/admin/applications) ─────────────────────────────────────
export const applicationsAdminRouter = Router();
applicationsAdminRouter.use(requirePermission(P.RECRUITMENT_MANAGE));

applicationsAdminRouter.get('/', validate({ query: z.object({
  status: z.enum(['PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'OPEN']).optional(),
  page: z.coerce.number().int().min(1).default(1),
}) }), async (req, res) => {
  const { status, page } = req.validatedQuery;
  const pg = paginate({ page, pageSize: 20 });
  const where = status === 'OPEN' ? inArray(apps.status, ACTIVE) : status ? eq(apps.status, status) : undefined;
  const [rows, [{ total }], counts] = await Promise.all([
    db.select({ app: apps, userName: users.displayName, userEmail: users.email }).from(apps).innerJoin(users, eq(users.id, apps.userId))
      .where(where).orderBy(desc(apps.createdAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(apps).where(where),
    db.select({ status: apps.status, n: count() }).from(apps).groupBy(apps.status),
  ]);
  res.json({
    data: rows.map(({ app, userName, userEmail }) => ({ ...app, userName, userEmail })),
    meta: { ...pageMeta(pg, total), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) },
  });
});

applicationsAdminRouter.patch('/:id', validate({ params: z.object({ id: z.string().uuid() }), body: z.object({
  status: z.enum(['REVIEWING', 'ACCEPTED', 'REJECTED']).optional(),
  messageToApplicant: z.string().trim().max(500).optional(),
  internalNote: z.string().trim().max(1000).optional(),
}).strict().refine((b) => Object.keys(b).length > 0, 'Nothing to update') }), async (req, res) => {
  const [a] = await db.select().from(apps).where(eq(apps.id, req.params.id)).limit(1);
  if (!a) throw notFound('Application not found');
  if (a.status === 'WITHDRAWN') throw badRequest('The applicant withdrew this application');
  const patch = { ...req.body };
  if (req.body.status) Object.assign(patch, { reviewedById: req.user.id, reviewedAt: new Date() });
  const [updated] = await db.update(apps).set(patch).where(eq(apps.id, a.id)).returning();

  if (req.body.status && req.body.status !== a.status) {
    const title = { REVIEWING: 'Your crew application is being reviewed', ACCEPTED: '🐉 You’re in! Welcome to the Dragonz', REJECTED: 'Update on your crew application' }[req.body.status];
    await db.insert(notifications).values({ userId: a.userId, type: 'SYSTEM', title, body: updated.messageToApplicant, url: '/join', dedupeKey: `application:${a.id}:${req.body.status}` }).onConflictDoNothing();
    const [u] = await db.select({ email: users.email, displayName: users.displayName, verified: users.emailVerifiedAt }).from(users).where(eq(users.id, a.userId));
    if (u?.verified) {
      await queueEmail({ to: u.email, template: 'applicationUpdate', data: { displayName: u.displayName, status: req.body.status, message: updated.messageToApplicant }, dedupeKey: `application:${a.id}:${req.body.status}` });
    }
    if (req.body.status === 'ACCEPTED') await syncBadges(a.userId);
  }
  await audit(req.user.id, `application.${(req.body.status ?? 'note').toLowerCase()}`, 'application', a.id);
  res.json({ data: { ...updated } });
});

/** Open applications count for the admin sidebar badge. */
export async function openApplicationsCount(since) {
  const [{ n }] = await db.select({ n: count() }).from(apps).where(and(inArray(apps.status, ACTIVE), since ? gte(apps.createdAt, since) : undefined));
  return n;
}
