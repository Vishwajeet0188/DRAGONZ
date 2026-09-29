// Quote Wall: fans submit memorable RP lines, moderators approve, the best rotate on the home page.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requirePermission } from '../../middleware/session.js';
import { submitLimiter } from '../../middleware/security.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors.js';
import { paginate, pageMeta } from '../../lib/util.js';
import { audit } from '../../services/audit.js';
import { awardXp } from '../../services/xp.js';
import { reactionSummary } from './social.js';

const { quotes, members, users, notifications } = schema;
const memberMini = { id: members.id, slug: members.slug, displayName: members.displayName, avatarUrl: members.avatarUrl, accentColor: members.accentColor };
const MAX_PENDING = 3;

const view = ({ quote, member, submittedBy }) => ({
  id: quote.id, text: quote.text, characterName: quote.characterName, context: quote.context, isFeatured: quote.isFeatured,
  createdAt: quote.createdAt, member: member?.id ? member : null, submittedBy: submittedBy ?? null,
});
const select = () => db.select({ quote: quotes, member: memberMini, submittedBy: users.displayName }).from(quotes)
  .leftJoin(members, eq(members.id, quotes.memberId)).leftJoin(users, eq(users.id, quotes.submittedById));
const approved = and(eq(quotes.status, 'APPROVED'), isNull(quotes.deletedAt));

/** A handful of quotes for the home page: featured first, then a random mix. */
export async function homeQuotes(limit = 6) {
  const rows = await select().where(approved).orderBy(desc(quotes.isFeatured), sql`random()`).limit(limit);
  return rows.map(view);
}

export const quotesRouter = Router();

quotesRouter.get('/', validate({ query: z.object({ page: z.coerce.number().int().min(1).max(200).default(1), member: z.string().regex(/^[a-z0-9-]{1,80}$/).optional() }) }), async (req, res) => {
  const pg = paginate({ page: req.validatedQuery.page, pageSize: 24 });
  const where = and(approved, req.validatedQuery.member ? eq(members.slug, req.validatedQuery.member) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    select().where(where).orderBy(desc(quotes.isFeatured), desc(quotes.moderatedAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(quotes).leftJoin(members, eq(members.id, quotes.memberId)).where(where),
  ]);
  const data = rows.map(view);
  const reactions = await reactionSummary('QUOTE', data.map((q) => q.id), req.user?.id);
  res.json({ data: data.map((q) => ({ ...q, reactions: reactions.get(q.id) })), meta: pageMeta(pg, total) });
});

quotesRouter.get('/mine', requireAuth, async (req, res) => {
  const rows = await db.select({ id: quotes.id, text: quotes.text, status: quotes.status, createdAt: quotes.createdAt }).from(quotes)
    .where(and(eq(quotes.submittedById, req.user.id), isNull(quotes.deletedAt))).orderBy(desc(quotes.createdAt)).limit(20);
  res.json({ data: rows });
});

const quoteBody = z.object({
  text: z.string().trim().min(5).max(280),
  memberSlug: z.string().regex(/^[a-z0-9-]{1,80}$/).optional().or(z.literal('').transform(() => undefined)),
  characterName: z.string().trim().max(80).optional().transform((v) => v || null),
  context: z.string().trim().max(140).optional().transform((v) => v || null),
}).strict();

quotesRouter.post('/', requireAuth, submitLimiter, validate({ body: quoteBody }), async (req, res) => {
  if (!req.user.emailVerifiedAt) throw forbidden('Verify your email before submitting quotes.');
  const [{ pending }] = await db.select({ pending: count() }).from(quotes)
    .where(and(eq(quotes.submittedById, req.user.id), eq(quotes.status, 'PENDING'), isNull(quotes.deletedAt)));
  if (pending >= MAX_PENDING) throw new AppError(429, 'TOO_MANY_PENDING', `You already have ${MAX_PENDING} quotes waiting for review.`);
  let memberId = null;
  if (req.body.memberSlug) {
    const [m] = await db.select({ id: members.id }).from(members).where(and(eq(members.slug, req.body.memberSlug), isNull(members.deletedAt))).limit(1);
    if (!m) throw badRequest('That member does not exist', [{ field: 'memberSlug', message: 'Unknown member' }]);
    memberId = m.id;
  }
  const [row] = await db.insert(quotes).values({ text: req.body.text, characterName: req.body.characterName, context: req.body.context, memberId, submittedById: req.user.id }).returning();
  res.status(201).json({ data: { id: row.id, status: row.status } });
});

// ── Moderation ──────────────────────────────────────────────────────────
export const quotesAdminRouter = Router();
quotesAdminRouter.use(requirePermission(P.COMMUNITY_MODERATE));

quotesAdminRouter.get('/', validate({ query: z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(), page: z.coerce.number().int().min(1).default(1) }) }), async (req, res) => {
  const pg = paginate({ page: req.validatedQuery.page, pageSize: 30 });
  const where = and(isNull(quotes.deletedAt), req.validatedQuery.status ? eq(quotes.status, req.validatedQuery.status) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    select().where(where).orderBy(desc(quotes.createdAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(quotes).where(where),
  ]);
  res.json({ data: rows.map(({ quote, member, submittedBy }) => ({ ...view({ quote, member, submittedBy }), status: quote.status })), meta: pageMeta(pg, total) });
});

// Admins can also add quotes directly (already approved).
quotesAdminRouter.post('/', validate({ body: quoteBody.extend({ isFeatured: z.boolean().default(false) }) }), async (req, res) => {
  let memberId = null;
  if (req.body.memberSlug) {
    const [m] = await db.select({ id: members.id }).from(members).where(eq(members.slug, req.body.memberSlug)).limit(1);
    memberId = m?.id ?? null;
  }
  const [row] = await db.insert(quotes).values({ text: req.body.text, characterName: req.body.characterName, context: req.body.context, memberId, isFeatured: req.body.isFeatured, status: 'APPROVED', submittedById: req.user.id, moderatedById: req.user.id, moderatedAt: new Date() }).returning();
  await audit(req.user.id, 'quote.create', 'quote', row.id);
  res.status(201).json({ data: row });
});

quotesAdminRouter.patch('/:id', validate({ params: z.object({ id: z.string().uuid() }), body: z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'PENDING']).optional(), isFeatured: z.boolean().optional(),
}).strict() }), async (req, res) => {
  const [q] = await db.select().from(quotes).where(and(eq(quotes.id, req.params.id), isNull(quotes.deletedAt))).limit(1);
  if (!q) throw notFound('Quote not found');
  const patch = { ...req.body, ...(req.body.status && { moderatedById: req.user.id, moderatedAt: new Date() }) };
  const [updated] = await db.update(quotes).set(patch).where(eq(quotes.id, q.id)).returning();
  if (req.body.status === 'APPROVED' && q.status !== 'APPROVED' && q.submittedById) {
    await db.insert(notifications).values({ userId: q.submittedById, type: 'SYSTEM', title: '💬 Your quote is on the Quote Wall!', body: q.text.slice(0, 120), url: '/quotes', dedupeKey: `quote:${q.id}:approved` }).onConflictDoNothing();
    await awardXp(q.submittedById, 'QUOTE_APPROVED', q.id);
  }
  await audit(req.user.id, 'quote.moderate', 'quote', q.id, req.body);
  res.json({ data: updated });
});

quotesAdminRouter.delete('/:id', validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res) => {
  const [q] = await db.update(quotes).set({ deletedAt: new Date() }).where(and(eq(quotes.id, req.params.id), isNull(quotes.deletedAt))).returning({ id: quotes.id });
  if (!q) throw notFound('Quote not found');
  await audit(req.user.id, 'quote.delete', 'quote', q.id);
  res.status(204).end();
});
