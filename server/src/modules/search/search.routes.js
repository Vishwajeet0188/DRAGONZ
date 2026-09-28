// Global search: one request, six small parameterised ILIKE queries run in parallel.
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { escapeLike } from '../../lib/util.js';

const { members, videos, newsPosts, events, achievements, communitySubmissions: subs } = schema;
const visibleMember = and(isNull(members.deletedAt), inArray(members.status, ['ACTIVE', 'ALUMNI']));

export const searchRouter = Router();
searchRouter.get('/', validate({ query: z.object({
  q: z.string().trim().min(2).max(60),
  limit: z.coerce.number().int().min(1).max(10).default(5),
}) }), async (req, res) => {
  const { q, limit } = req.validatedQuery;
  const p = `%${escapeLike(q)}%`;
  const [m, v, n, e, a, c] = await Promise.all([
    db.select({ slug: members.slug, displayName: members.displayName, rank: members.rank, rpCharacter: members.rpCharacter, avatarUrl: members.avatarUrl, accentColor: members.accentColor })
      .from(members).where(and(visibleMember, or(ilike(members.displayName, p), ilike(members.rpCharacter, p)))).orderBy(members.rankOrder).limit(limit),
    db.select({ id: videos.id, title: videos.title, url: videos.url, platform: videos.platform, thumbnailUrl: videos.thumbnailUrl, member: members.displayName })
      .from(videos).innerJoin(members, eq(members.id, videos.memberId))
      .where(and(visibleMember, eq(videos.isHidden, false), isNull(videos.deletedAt), ilike(videos.title, p))).orderBy(desc(videos.publishedAt)).limit(limit),
    db.select({ slug: newsPosts.slug, title: newsPosts.title, category: newsPosts.category, publishedAt: newsPosts.publishedAt })
      .from(newsPosts).where(and(eq(newsPosts.status, 'PUBLISHED'), isNull(newsPosts.deletedAt), or(ilike(newsPosts.title, p), ilike(newsPosts.excerpt, p))))
      .orderBy(desc(newsPosts.publishedAt)).limit(limit),
    db.select({ slug: events.slug, title: events.title, startsAt: events.startsAt, category: events.category })
      .from(events).where(and(isNull(events.deletedAt), inArray(events.status, ['SCHEDULED', 'LIVE', 'COMPLETED']), ilike(events.title, p)))
      .orderBy(desc(events.startsAt)).limit(limit),
    db.select({ id: achievements.id, title: achievements.title, category: achievements.category, achievedAt: achievements.achievedAt })
      .from(achievements).where(and(eq(achievements.inHallOfFame, true), ilike(achievements.title, p))).orderBy(desc(achievements.achievedAt)).limit(limit),
    db.select({ id: subs.id, title: subs.title, type: subs.type })
      .from(subs).where(and(inArray(subs.status, ['APPROVED', 'FEATURED']), isNull(subs.deletedAt), ilike(subs.title, p))).orderBy(desc(subs.createdAt)).limit(limit),
  ]);
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ data: { members: m, videos: v, news: n, events: e, achievements: a, community: c, total: m.length + v.length + n.length + e.length + a.length + c.length } });
});
