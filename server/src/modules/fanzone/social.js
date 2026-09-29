// Reactions (🔥 ❤️ 😂 😮 🐉) and comments on news, events, community posts and quotes.
// Only visible targets can be reacted to / commented on; comments need a verified email and are moderated.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requirePermission } from '../../middleware/session.js';
import { socialLimiter } from '../../middleware/security.js';
import { PERMISSIONS as P, can } from '../../auth/permissions.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { paginate, pageMeta } from '../../lib/util.js';
import { audit } from '../../services/audit.js';
import { awardXp, levelFor } from '../../services/xp.js';

const { reactions, comments, users, newsPosts, events, communitySubmissions, quotes } = schema;

export const EMOJIS = ['fire', 'heart', 'laugh', 'wow', 'dragon'];
const TYPES = { news: 'NEWS', event: 'EVENT', community: 'COMMUNITY', quote: 'QUOTE' };
const targetParams = z.object({ type: z.enum(Object.keys(TYPES)), id: z.string().uuid() });

/** Is this target publicly visible (so it may be reacted to / commented on)? */
async function targetVisible(type, id) {
  const checks = {
    NEWS: () => db.select({ id: newsPosts.id }).from(newsPosts).where(and(eq(newsPosts.id, id), eq(newsPosts.status, 'PUBLISHED'), isNull(newsPosts.deletedAt))),
    EVENT: () => db.select({ id: events.id }).from(events).where(and(eq(events.id, id), ne(events.status, 'DRAFT'), isNull(events.deletedAt))),
    COMMUNITY: () => db.select({ id: communitySubmissions.id }).from(communitySubmissions).where(and(eq(communitySubmissions.id, id), inArray(communitySubmissions.status, ['APPROVED', 'FEATURED']), isNull(communitySubmissions.deletedAt))),
    QUOTE: () => db.select({ id: quotes.id }).from(quotes).where(and(eq(quotes.id, id), eq(quotes.status, 'APPROVED'), isNull(quotes.deletedAt))),
  };
  const [row] = await checks[type]().limit(1);
  return Boolean(row);
}
async function requireTarget(type, id) {
  if (!(await targetVisible(type, id))) throw notFound('That post is not available');
}

/** Reaction counts (+ the viewer's own) for many targets of one type — used by list pages. */
export async function reactionSummary(type, ids, viewerId) {
  if (!ids.length) return new Map();
  const [rows, mine] = await Promise.all([
    db.select({ targetId: reactions.targetId, emoji: reactions.emoji, n: count() }).from(reactions)
      .where(and(eq(reactions.targetType, type), inArray(reactions.targetId, ids))).groupBy(reactions.targetId, reactions.emoji),
    viewerId ? db.select({ targetId: reactions.targetId, emoji: reactions.emoji }).from(reactions)
      .where(and(eq(reactions.targetType, type), inArray(reactions.targetId, ids), eq(reactions.userId, viewerId))) : [],
  ]);
  const out = new Map(ids.map((id) => [id, { counts: Object.fromEntries(EMOJIS.map((e) => [e, 0])), mine: [] }]));
  for (const r of rows) out.get(r.targetId).counts[r.emoji] = r.n;
  for (const r of mine) out.get(r.targetId).mine.push(r.emoji);
  return out;
}

const authorCols = { userId: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl, xp: users.xp, role: users.role };
const publicComment = (c, viewer) => ({
  id: c.id, body: c.body, createdAt: c.createdAt,
  author: { displayName: c.displayName, avatarUrl: c.avatarUrl, levelName: levelFor(c.xp).name, isStaff: c.role !== 'USER' },
  isMine: viewer?.id === c.userId,
  canDelete: viewer?.id === c.userId || (viewer && can(viewer.role, P.COMMUNITY_MODERATE)),
});

export const socialRouter = Router();

// Everything the UI needs for one target: reaction counts, my reactions, comments.
socialRouter.get('/:type/:id', validate({ params: targetParams }), async (req, res) => {
  const type = TYPES[req.params.type];
  await requireTarget(type, req.params.id);
  const [summary, list, [{ total }]] = await Promise.all([
    reactionSummary(type, [req.params.id], req.user?.id),
    db.select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, ...authorCols }).from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .where(and(eq(comments.targetType, type), eq(comments.targetId, req.params.id), eq(comments.status, 'VISIBLE'), isNull(comments.deletedAt)))
      .orderBy(desc(comments.createdAt)).limit(100),
    db.select({ total: count() }).from(comments)
      .where(and(eq(comments.targetType, type), eq(comments.targetId, req.params.id), eq(comments.status, 'VISIBLE'), isNull(comments.deletedAt))),
  ]);
  res.json({ data: { ...summary.get(req.params.id), comments: list.map((c) => publicComment(c, req.user)), commentCount: total } });
});

socialRouter.put('/:type/:id/reactions/:emoji', requireAuth, socialLimiter,
  validate({ params: targetParams.extend({ emoji: z.enum(EMOJIS) }) }), async (req, res) => {
    const type = TYPES[req.params.type];
    await requireTarget(type, req.params.id);
    const [row] = await db.insert(reactions).values({ userId: req.user.id, targetType: type, targetId: req.params.id, emoji: req.params.emoji })
      .onConflictDoNothing().returning();
    if (row) await awardXp(req.user.id, 'REACTION', `${type}:${req.params.id}:${req.params.emoji}`);
    const summary = await reactionSummary(type, [req.params.id], req.user.id);
    res.json({ data: summary.get(req.params.id) });
  });

socialRouter.delete('/:type/:id/reactions/:emoji', requireAuth, socialLimiter,
  validate({ params: targetParams.extend({ emoji: z.enum(EMOJIS) }) }), async (req, res) => {
    const type = TYPES[req.params.type];
    await db.delete(reactions).where(and(eq(reactions.userId, req.user.id), eq(reactions.targetType, type), eq(reactions.targetId, req.params.id), eq(reactions.emoji, req.params.emoji)));
    const summary = await reactionSummary(type, [req.params.id], req.user.id);
    res.json({ data: summary.get(req.params.id) });
  });

const commentBody = z.object({
  body: z.string().trim().min(1, 'Write something first').max(500)
    .refine((b) => (b.match(/https?:\/\//gi) ?? []).length <= 2, 'Too many links in one comment'),
}).strict();

socialRouter.post('/:type/:id/comments', requireAuth, socialLimiter, validate({ params: targetParams, body: commentBody }), async (req, res) => {
  if (!req.user.emailVerifiedAt) throw forbidden('Verify your email to join the conversation.');
  const type = TYPES[req.params.type];
  await requireTarget(type, req.params.id);
  const [c] = await db.insert(comments).values({ userId: req.user.id, targetType: type, targetId: req.params.id, body: req.body.body }).returning();
  await awardXp(req.user.id, 'COMMENT', c.id);
  const [u] = await db.select(authorCols).from(users).where(eq(users.id, req.user.id));
  res.status(201).json({ data: publicComment({ ...c, ...u }, req.user) });
});

socialRouter.delete('/comments/:id', requireAuth, validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res) => {
  const [c] = await db.select().from(comments).where(and(eq(comments.id, req.params.id), isNull(comments.deletedAt))).limit(1);
  const isMod = can(req.user.role, P.COMMUNITY_MODERATE);
  if (!c || (c.userId !== req.user.id && !isMod)) throw notFound('Comment not found'); // same 404 for "not yours" (IDOR-safe)
  await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, c.id));
  if (c.userId !== req.user.id) await audit(req.user.id, 'comment.delete', 'comment', c.id);
  res.status(204).end();
});

// ── Moderation ──────────────────────────────────────────────────────────
/** Title + link for comment targets shown in the admin queue. */
async function describeTargets(list) {
  const ids = (t) => [...new Set(list.filter((c) => c.targetType === t).map((c) => c.targetId))];
  const [n, e, s, q] = await Promise.all([
    ids('NEWS').length ? db.select({ id: newsPosts.id, title: newsPosts.title, slug: newsPosts.slug }).from(newsPosts).where(inArray(newsPosts.id, ids('NEWS'))) : [],
    ids('EVENT').length ? db.select({ id: events.id, title: events.title, slug: events.slug }).from(events).where(inArray(events.id, ids('EVENT'))) : [],
    ids('COMMUNITY').length ? db.select({ id: communitySubmissions.id, title: communitySubmissions.title }).from(communitySubmissions).where(inArray(communitySubmissions.id, ids('COMMUNITY'))) : [],
    ids('QUOTE').length ? db.select({ id: quotes.id, title: quotes.text }).from(quotes).where(inArray(quotes.id, ids('QUOTE'))) : [],
  ]);
  const map = new Map([
    ...n.map((x) => [x.id, { title: x.title, url: `/news/${x.slug}` }]),
    ...e.map((x) => [x.id, { title: x.title, url: `/events/${x.slug}` }]),
    ...s.map((x) => [x.id, { title: x.title, url: '/community' }]),
    ...q.map((x) => [x.id, { title: x.title.slice(0, 80), url: '/quotes' }]),
  ]);
  return list.map((c) => ({ ...c, target: map.get(c.targetId) ?? { title: '(removed)', url: null } }));
}

export const commentsAdminRouter = Router();
commentsAdminRouter.use(requirePermission(P.COMMUNITY_MODERATE));
commentsAdminRouter.get('/', validate({ query: z.object({ status: z.enum(['VISIBLE', 'HIDDEN']).optional(), page: z.coerce.number().int().min(1).default(1) }) }), async (req, res) => {
  const pg = paginate({ page: req.validatedQuery.page, pageSize: 30 });
  const where = and(isNull(comments.deletedAt), req.validatedQuery.status ? eq(comments.status, req.validatedQuery.status) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ id: comments.id, body: comments.body, status: comments.status, createdAt: comments.createdAt, targetType: comments.targetType, targetId: comments.targetId, authorName: users.displayName, authorEmail: users.email })
      .from(comments).innerJoin(users, eq(users.id, comments.userId)).where(where).orderBy(desc(comments.createdAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(comments).where(where),
  ]);
  res.json({ data: await describeTargets(rows), meta: pageMeta(pg, total) });
});
commentsAdminRouter.patch('/:id', validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ status: z.enum(['VISIBLE', 'HIDDEN']) }).strict() }), async (req, res) => {
  const [c] = await db.update(comments).set({ status: req.body.status }).where(and(eq(comments.id, req.params.id), isNull(comments.deletedAt))).returning();
  if (!c) throw notFound('Comment not found');
  await audit(req.user.id, `comment.${req.body.status.toLowerCase()}`, 'comment', c.id);
  res.json({ data: { id: c.id, status: c.status } });
});
commentsAdminRouter.delete('/:id', validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res) => {
  const [c] = await db.update(comments).set({ deletedAt: new Date() }).where(and(eq(comments.id, req.params.id), isNull(comments.deletedAt))).returning({ id: comments.id });
  if (!c) throw notFound('Comment not found');
  await audit(req.user.id, 'comment.delete', 'comment', c.id);
  res.status(204).end();
});

