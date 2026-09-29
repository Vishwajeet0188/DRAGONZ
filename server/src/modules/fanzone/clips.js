// Clip of the Week: fans vote (one vote per week, changeable) on recent community clips.
// When a week ends the top clip wins: it gets featured, its author gets XP + a badge.
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/session.js';
import { socialLimiter } from '../../middleware/security.js';
import { badRequest } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { awardXp } from '../../services/xp.js';
import { attachMedia } from '../community/community.service.js';

const { clipVotes, clipWinners, communitySubmissions: subs, users, members, notifications } = schema;
const CLIP_TYPES = ['CLIP', 'VIDEO', 'EDIT', 'MOMENT'];
const WINDOW_DAYS = 60;
const IST = 5.5 * 3_600_000;

/** ISO week in India time → { key: "2026-W40", start, end } (start = Monday 00:00 IST). */
export function weekOf(date = new Date()) {
  const local = new Date(date.getTime() + IST);
  const day = (local.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day));
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday - yearStart) / 86_400_000 + 1) / 7);
  const start = new Date(monday.getTime() - IST);
  return { key: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, start, end: new Date(start.getTime() + 7 * 86_400_000) };
}

const cols = {
  id: subs.id, type: subs.type, title: subs.title, description: subs.description, externalUrl: subs.externalUrl,
  status: subs.status, createdAt: subs.createdAt, authorName: users.displayName, memberSlug: members.slug, memberName: members.displayName,
};

async function pastWinnerIds() {
  return (await db.select({ id: clipWinners.submissionId }).from(clipWinners)).map((r) => r.id);
}

async function candidates() {
  const exclude = await pastWinnerIds();
  const rows = await db.select(cols).from(subs).innerJoin(users, eq(users.id, subs.authorId)).leftJoin(members, eq(members.id, subs.featuredMemberId))
    .where(and(inArray(subs.status, ['APPROVED', 'FEATURED']), isNull(subs.deletedAt), inArray(subs.type, CLIP_TYPES),
      gte(subs.createdAt, new Date(Date.now() - WINDOW_DAYS * 86_400_000)), exclude.length ? notInArray(subs.id, exclude) : undefined))
    .orderBy(desc(subs.createdAt)).limit(24);
  return attachMedia(rows);
}

async function winnerView(w) {
  if (!w) return null;
  const [row] = await db.select(cols).from(subs).innerJoin(users, eq(users.id, subs.authorId)).leftJoin(members, eq(members.id, subs.featuredMemberId))
    .where(and(eq(subs.id, w.submissionId), isNull(subs.deletedAt))).limit(1);
  if (!row) return null;
  const [withMedia] = await attachMedia([row]);
  return { weekKey: w.weekKey, votes: w.votes, submission: withMedia };
}

export async function latestWinner() {
  const [w] = await db.select().from(clipWinners).orderBy(desc(clipWinners.weekKey)).limit(1);
  return winnerView(w);
}

/** Decide winners for finished weeks that have votes but no winner yet. Safe to call often. */
export async function decideClipWinners() {
  const current = weekOf().key;
  const weeks = await db.selectDistinct({ weekKey: clipVotes.weekKey }).from(clipVotes)
    .where(and(lt(clipVotes.weekKey, current), sql`${clipVotes.weekKey} not in (select week_key from clip_winners)`));
  let decided = 0;
  for (const { weekKey } of weeks) {
    const [top] = await db.select({ submissionId: clipVotes.submissionId, n: count(), first: sql`min(${clipVotes.createdAt})` })
      .from(clipVotes).innerJoin(subs, eq(subs.id, clipVotes.submissionId))
      .where(and(eq(clipVotes.weekKey, weekKey), isNull(subs.deletedAt), inArray(subs.status, ['APPROVED', 'FEATURED'])))
      .groupBy(clipVotes.submissionId).orderBy(desc(count()), asc(sql`min(${clipVotes.createdAt})`)).limit(1);
    if (!top) continue;
    const [won] = await db.insert(clipWinners).values({ weekKey, submissionId: top.submissionId, votes: top.n }).onConflictDoNothing().returning();
    if (!won) continue;
    decided++;
    const [s] = await db.update(subs).set({ status: 'FEATURED' }).where(eq(subs.id, top.submissionId)).returning({ authorId: subs.authorId, title: subs.title });
    if (s) {
      await db.insert(notifications).values({ userId: s.authorId, type: 'SYSTEM', title: '🏆 Your clip won Clip of the Week!', body: `“${s.title}” won with ${top.n} vote${top.n === 1 ? '' : 's'}.`, url: '/clip-of-the-week', dedupeKey: `clipwin:${weekKey}` }).onConflictDoNothing();
      await awardXp(s.authorId, 'CLIP_WIN', weekKey);
    }
  }
  if (decided) logger.info({ decided }, 'clip of the week decided');
  return decided;
}

export const clipsRouter = Router();

clipsRouter.get('/week', async (req, res) => {
  await decideClipWinners().catch(() => {});
  const wk = weekOf();
  const [list, tallies, mine, lastWinner] = await Promise.all([
    candidates(),
    db.select({ submissionId: clipVotes.submissionId, n: count() }).from(clipVotes).where(eq(clipVotes.weekKey, wk.key)).groupBy(clipVotes.submissionId),
    req.user ? db.select({ submissionId: clipVotes.submissionId }).from(clipVotes).where(and(eq(clipVotes.weekKey, wk.key), eq(clipVotes.userId, req.user.id))) : [],
    latestWinner(),
  ]);
  const t = new Map(tallies.map((x) => [x.submissionId, x.n]));
  const withVotes = list.map((c) => ({ ...c, votes: t.get(c.id) ?? 0 })).sort((a, b) => b.votes - a.votes || new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ data: { weekKey: wk.key, endsAt: wk.end, candidates: withVotes, myVote: mine[0]?.submissionId ?? null, totalVotes: tallies.reduce((s, x) => s + x.n, 0), lastWinner } });
});

clipsRouter.post('/week/vote', requireAuth, socialLimiter, validate({ body: z.object({ submissionId: z.string().uuid() }).strict() }), async (req, res) => {
  const list = await candidates();
  if (!list.some((c) => c.id === req.body.submissionId)) throw badRequest('That clip is not in this week’s vote');
  const wk = weekOf();
  await db.insert(clipVotes).values({ weekKey: wk.key, userId: req.user.id, submissionId: req.body.submissionId })
    .onConflictDoUpdate({ target: [clipVotes.weekKey, clipVotes.userId], set: { submissionId: req.body.submissionId, createdAt: new Date() } });
  await awardXp(req.user.id, 'CLIP_VOTE', wk.key);
  res.json({ data: { myVote: req.body.submissionId, weekKey: wk.key } });
});

clipsRouter.get('/winners', async (_req, res) => {
  const rows = await db.select().from(clipWinners).orderBy(desc(clipWinners.weekKey)).limit(12);
  res.json({ data: (await Promise.all(rows.map(winnerView))).filter(Boolean) });
});
