// Polls: admins ask, signed-in fans vote once. Results are shown after voting (or when the poll closes).
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requirePermission } from '../../middleware/session.js';
import { socialLimiter } from '../../middleware/security.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../services/audit.js';
import { awardXp } from '../../services/xp.js';

const { polls, pollOptions, pollVotes, members } = schema;
const idParam = z.object({ id: z.string().uuid() });
const memberMini = { id: members.id, slug: members.slug, displayName: members.displayName, avatarUrl: members.avatarUrl, accentColor: members.accentColor };

/** A poll is open if its status is OPEN and it hasn't passed closesAt. */
const isOpen = (p) => p.status === 'OPEN' && (!p.closesAt || new Date(p.closesAt) > new Date());

/** Attach options, counts and the viewer's vote. Counts are hidden until the viewer voted or the poll closed. */
export async function hydratePolls(rows, viewerId, { forceResults = false } = {}) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.poll.id);
  const [opts, tallies, mine] = await Promise.all([
    db.select().from(pollOptions).where(inArray(pollOptions.pollId, ids)).orderBy(asc(pollOptions.position)),
    db.select({ optionId: pollVotes.optionId, n: count() }).from(pollVotes).where(inArray(pollVotes.pollId, ids)).groupBy(pollVotes.optionId),
    viewerId ? db.select().from(pollVotes).where(and(inArray(pollVotes.pollId, ids), eq(pollVotes.userId, viewerId))) : [],
  ]);
  const tally = new Map(tallies.map((t) => [t.optionId, t.n]));
  const mineBy = new Map(mine.map((v) => [v.pollId, v.optionId]));
  const optsBy = Map.groupBy(opts, (o) => o.pollId);
  return rows.map(({ poll, member }) => {
    const open = isOpen(poll);
    const myVote = mineBy.get(poll.id) ?? null;
    const showResults = forceResults || !open || Boolean(myVote);
    const options = (optsBy.get(poll.id) ?? []).map((o) => ({ id: o.id, label: o.label, votes: showResults ? tally.get(o.id) ?? 0 : null }));
    const totalVotes = (optsBy.get(poll.id) ?? []).reduce((s, o) => s + (tally.get(o.id) ?? 0), 0);
    return {
      id: poll.id, question: poll.question, description: poll.description, isOpen: open, status: poll.status,
      closesAt: poll.closesAt, isPinned: poll.isPinned, createdAt: poll.createdAt,
      member: member?.id ? member : null, options, totalVotes, myVote, showResults,
    };
  });
}

const baseSelect = () => db.select({ poll: polls, member: memberMini }).from(polls).leftJoin(members, eq(members.id, polls.memberId));

/** The poll to feature on the home page: pinned & open first, else the newest open one. */
export async function featuredPoll(viewerId) {
  const rows = await baseSelect()
    .where(and(isNull(polls.deletedAt), eq(polls.status, 'OPEN'), or(isNull(polls.closesAt), sql`${polls.closesAt} > now()`)))
    .orderBy(desc(polls.isPinned), desc(polls.createdAt)).limit(1);
  return (await hydratePolls(rows, viewerId))[0] ?? null;
}

// ── Public ──────────────────────────────────────────────────────────────
export const pollsRouter = Router();

pollsRouter.get('/', validate({ query: z.object({ status: z.enum(['open', 'closed']).default('open') }) }), async (req, res) => {
  const openCond = and(eq(polls.status, 'OPEN'), or(isNull(polls.closesAt), sql`${polls.closesAt} > now()`));
  const where = and(isNull(polls.deletedAt), req.validatedQuery.status === 'open' ? openCond : sql`not (${openCond})`);
  const rows = await baseSelect().where(where).orderBy(desc(polls.isPinned), desc(polls.createdAt)).limit(30);
  res.json({ data: await hydratePolls(rows, req.user?.id) });
});

pollsRouter.get('/featured', async (req, res) => {
  res.json({ data: await featuredPoll(req.user?.id) });
});

pollsRouter.post('/:id/vote', requireAuth, socialLimiter, validate({ params: idParam, body: z.object({ optionId: z.string().uuid() }).strict() }), async (req, res) => {
  const [poll] = await db.select().from(polls).where(and(eq(polls.id, req.params.id), isNull(polls.deletedAt))).limit(1);
  if (!poll) throw notFound('Poll not found');
  if (!isOpen(poll)) throw badRequest('This poll has closed');
  const [opt] = await db.select().from(pollOptions).where(and(eq(pollOptions.id, req.body.optionId), eq(pollOptions.pollId, poll.id))).limit(1);
  if (!opt) throw badRequest('That option is not part of this poll');
  const [vote] = await db.insert(pollVotes).values({ pollId: poll.id, optionId: opt.id, userId: req.user.id }).onConflictDoNothing().returning();
  if (!vote) throw badRequest('You already voted in this poll');
  await awardXp(req.user.id, 'POLL_VOTE', poll.id);
  const [hydrated] = await hydratePolls(await baseSelect().where(eq(polls.id, poll.id)), req.user.id);
  res.json({ data: hydrated });
});

// ── Admin ───────────────────────────────────────────────────────────────
const pollBody = z.object({
  question: z.string().trim().min(5).max(200),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(6)
    .refine((o) => new Set(o.map((x) => x.toLowerCase())).size === o.length, 'Options must be different'),
  closesAt: z.coerce.date().nullable().optional().refine((d) => !d || d > new Date(), 'Closing time must be in the future'),
  isPinned: z.boolean().default(false),
  memberId: z.string().uuid().nullable().optional().or(z.literal('').transform(() => null)),
}).strict();
const pollPatch = z.object({
  question: z.string().trim().min(5).max(200).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  closesAt: z.coerce.date().nullable().optional(),
  isPinned: z.boolean().optional(),
}).strict();

export const pollsAdminRouter = Router();
pollsAdminRouter.use(requirePermission(P.FANZONE_MANAGE));

pollsAdminRouter.get('/', async (req, res) => {
  const rows = await baseSelect().where(isNull(polls.deletedAt)).orderBy(desc(polls.createdAt)).limit(100);
  res.json({ data: await hydratePolls(rows, null, { forceResults: true }) });
});

pollsAdminRouter.post('/', validate({ body: pollBody }), async (req, res) => {
  const { options, ...rest } = req.body;
  const created = await db.transaction(async (tx) => {
    if (rest.isPinned) await tx.update(polls).set({ isPinned: false }).where(eq(polls.isPinned, true));
    const [p] = await tx.insert(polls).values({ ...rest, createdById: req.user.id }).returning();
    await tx.insert(pollOptions).values(options.map((label, position) => ({ pollId: p.id, label, position })));
    return p;
  });
  await audit(req.user.id, 'poll.create', 'poll', created.id, { question: created.question });
  res.status(201).json({ data: created });
});

pollsAdminRouter.patch('/:id', validate({ params: idParam, body: pollPatch }), async (req, res) => {
  const updated = await db.transaction(async (tx) => {
    if (req.body.isPinned) await tx.update(polls).set({ isPinned: false }).where(eq(polls.isPinned, true));
    const [p] = await tx.update(polls).set(req.body).where(and(eq(polls.id, req.params.id), isNull(polls.deletedAt))).returning();
    return p;
  });
  if (!updated) throw notFound('Poll not found');
  await audit(req.user.id, 'poll.update', 'poll', updated.id, req.body);
  res.json({ data: updated });
});

pollsAdminRouter.delete('/:id', validate({ params: idParam }), async (req, res) => {
  const [p] = await db.update(polls).set({ deletedAt: new Date(), isPinned: false }).where(and(eq(polls.id, req.params.id), isNull(polls.deletedAt))).returning({ id: polls.id });
  if (!p) throw notFound('Poll not found');
  await audit(req.user.id, 'poll.delete', 'poll', p.id);
  res.status(204).end();
});
