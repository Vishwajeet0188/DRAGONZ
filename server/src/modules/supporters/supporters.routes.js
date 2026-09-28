// Supporters. YouTube/Kick membership data is private to each creator and is NOT fetched or assumed.
// Instead: a user claims "I support <creator> (tier)", an admin/creator verifies it, and the user
// decides whether their badge is public. Nothing is shown publicly without VERIFIED + isPublic.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requirePermission } from '../../middleware/session.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { pageMeta, paginate } from '../../lib/util.js';
import { audit } from '../../services/audit.js';

const { supporters, users, members, notifications } = schema;
const slug = z.string().regex(/^[a-z0-9-]{1,80}$/);
const tier = z.string().trim().max(60).optional().transform((v) => v || null);

async function memberBySlug(s) {
  const [m] = await db.select({ id: members.id, displayName: members.displayName }).from(members).where(and(eq(members.slug, s), isNull(members.deletedAt))).limit(1);
  if (!m) throw notFound('Member not found');
  return m;
}

// Public: verified + public supporters of a creator.
export const memberSupportersRouter = Router({ mergeParams: true });
memberSupportersRouter.get('/', validate({ params: z.object({ slug }) }), async (req, res) => {
  const m = await memberBySlug(req.params.slug);
  const verified = and(eq(supporters.memberId, m.id), eq(supporters.status, 'VERIFIED'));
  const [list, [{ total }]] = await Promise.all([
    db.select({ displayName: users.displayName, avatarUrl: users.avatarUrl, tier: supporters.tier, since: supporters.since })
      .from(supporters).innerJoin(users, eq(users.id, supporters.userId))
      .where(and(verified, eq(supporters.isPublic, true), isNull(users.deletedAt))).orderBy(desc(supporters.since)).limit(60),
    db.select({ total: count() }).from(supporters).where(verified),
  ]);
  res.json({ data: list, meta: { total } });
});

// Me: my supporter claims.
export const meSupportersRouter = Router();
meSupportersRouter.use(requireAuth);
meSupportersRouter.get('/', async (req, res) => {
  const rows = await db.select({ id: supporters.id, tier: supporters.tier, since: supporters.since, status: supporters.status, isPublic: supporters.isPublic, memberSlug: members.slug, memberName: members.displayName })
    .from(supporters).innerJoin(members, eq(members.id, supporters.memberId)).where(eq(supporters.userId, req.user.id)).orderBy(desc(supporters.createdAt));
  res.json({ data: rows });
});
meSupportersRouter.post('/', validate({ body: z.object({ memberSlug: slug, tier, since: z.coerce.date().max(new Date()).optional(), isPublic: z.boolean().default(true) }).strict() }), async (req, res) => {
  const m = await memberBySlug(req.body.memberSlug);
  const [existing] = await db.select().from(supporters).where(and(eq(supporters.userId, req.user.id), eq(supporters.memberId, m.id))).limit(1);
  if (existing?.status === 'VERIFIED') throw badRequest('You are already a verified supporter of this creator');
  const values = { tier: req.body.tier, since: req.body.since ?? null, isPublic: req.body.isPublic, status: 'PENDING', source: 'SELF_CLAIM', updatedAt: new Date() };
  const [row] = existing
    ? await db.update(supporters).set(values).where(eq(supporters.id, existing.id)).returning()
    : await db.insert(supporters).values({ ...values, userId: req.user.id, memberId: m.id }).returning();
  res.status(201).json({ data: { id: row.id, status: row.status } });
});
meSupportersRouter.patch('/:id', validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ isPublic: z.boolean() }).strict() }), async (req, res) => {
  const [row] = await db.update(supporters).set({ isPublic: req.body.isPublic, updatedAt: new Date() })
    .where(and(eq(supporters.id, req.params.id), eq(supporters.userId, req.user.id))).returning(); // owner-scoped (IDOR-safe)
  if (!row) throw notFound();
  res.json({ data: { isPublic: row.isPublic } });
});
meSupportersRouter.delete('/:id', validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res) => {
  const [row] = await db.delete(supporters).where(and(eq(supporters.id, req.params.id), eq(supporters.userId, req.user.id))).returning({ id: supporters.id });
  if (!row) throw notFound(); // owner-scoped: someone else's id looks the same as a missing one
  res.status(204).end();
});

// Admin: review claims, add supporters directly, revoke.
export const supportersAdminRouter = Router();
supportersAdminRouter.use(requirePermission(P.SUPPORTERS_MANAGE));
supportersAdminRouter.get('/', validate({ query: z.object({ status: z.enum(['PENDING', 'VERIFIED', 'REVOKED']).optional(), page: z.coerce.number().int().min(1).default(1) }) }), async (req, res) => {
  const pg = paginate({ page: req.validatedQuery.page, pageSize: 25 });
  const where = req.validatedQuery.status ? eq(supporters.status, req.validatedQuery.status) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.select({ id: supporters.id, tier: supporters.tier, since: supporters.since, status: supporters.status, source: supporters.source, isPublic: supporters.isPublic, createdAt: supporters.createdAt,
      userName: users.displayName, userEmail: users.email, memberName: members.displayName, memberSlug: members.slug })
      .from(supporters).innerJoin(users, eq(users.id, supporters.userId)).innerJoin(members, eq(members.id, supporters.memberId))
      .where(where).orderBy(desc(supporters.createdAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(supporters).where(where),
  ]);
  res.json({ data: rows, meta: pageMeta(pg, total) });
});
supportersAdminRouter.post('/', validate({ body: z.object({ email: z.string().trim().toLowerCase().email(), memberSlug: slug, tier, since: z.coerce.date().optional() }).strict() }), async (req, res) => {
  const m = await memberBySlug(req.body.memberSlug);
  const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, req.body.email), isNull(users.deletedAt))).limit(1);
  if (!u) throw badRequest('No account with that email — ask them to register first', [{ field: 'email', message: 'Not registered' }]);
  const [row] = await db.insert(supporters).values({ userId: u.id, memberId: m.id, tier: req.body.tier, since: req.body.since ?? null, source: 'ADMIN', status: 'VERIFIED', isPublic: false })
    .onConflictDoUpdate({ target: [supporters.userId, supporters.memberId], set: { tier: req.body.tier, status: 'VERIFIED', source: 'ADMIN', updatedAt: new Date() } }).returning();
  await audit(req.user.id, 'supporter.add', 'supporter', row.id, { member: m.displayName });
  res.status(201).json({ data: row });
});
supportersAdminRouter.patch('/:id', validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ status: z.enum(['VERIFIED', 'REVOKED', 'PENDING']), tier }).strict() }), async (req, res) => {
  const [row] = await db.update(supporters).set({ status: req.body.status, ...(req.body.tier !== null && { tier: req.body.tier }), updatedAt: new Date() })
    .where(eq(supporters.id, req.params.id)).returning();
  if (!row) throw notFound();
  if (req.body.status === 'VERIFIED') {
    await db.insert(notifications).values({ userId: row.userId, type: 'SYSTEM', title: 'Your supporter badge was verified 🐉', url: '/dashboard', dedupeKey: `supporter:${row.id}:verified` }).onConflictDoNothing();
  }
  await audit(req.user.id, `supporter.${req.body.status.toLowerCase()}`, 'supporter', row.id);
  res.json({ data: row });
});
