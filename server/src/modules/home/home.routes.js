import { Router } from 'express';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { hydrateMembers, memberCardColumns } from '../members/members.service.js';
import { listPublic } from '../community/community.service.js';

const { members, liveStreams, videos, newsPosts, events, achievements, milestones } = schema;

export const homeRouter = Router();

const memberMini = { id: members.id, slug: members.slug, displayName: members.displayName, avatarUrl: members.avatarUrl, accentColor: members.accentColor };

/** One aggregated payload for the homepage — a single round-trip, every section batched. */
async function getHome() {
  const activeMember = and(isNull(members.deletedAt), eq(members.status, 'ACTIVE'));
  const [featured, live, latestVideos, news, upcoming, hof, recentMilestones, community, roster] = await Promise.all([
    db.select(memberCardColumns).from(members).where(and(activeMember, eq(members.isFeatured, true))).orderBy(asc(members.rankOrder)).limit(8),
    db.select({ stream: liveStreams, member: memberMini }).from(liveStreams)
      .innerJoin(members, eq(members.id, liveStreams.memberId))
      .where(and(eq(liveStreams.isLive, true), activeMember)).orderBy(desc(liveStreams.viewerCount)).limit(8),
    db.select({ video: videos, member: memberMini }).from(videos)
      .innerJoin(members, eq(members.id, videos.memberId))
      .where(and(activeMember, eq(videos.isHidden, false), isNull(videos.deletedAt), eq(videos.isFeatured, true))).orderBy(desc(videos.publishedAt)).limit(8), // only videos an admin starred
    db.select({ id: newsPosts.id, slug: newsPosts.slug, title: newsPosts.title, excerpt: newsPosts.excerpt, category: newsPosts.category, featuredImageUrl: newsPosts.featuredImageUrl, publishedAt: newsPosts.publishedAt, isPinned: newsPosts.isPinned })
      .from(newsPosts).where(and(eq(newsPosts.status, 'PUBLISHED'), isNull(newsPosts.deletedAt)))
      .orderBy(desc(newsPosts.isPinned), desc(newsPosts.publishedAt)).limit(3),
    db.select({ id: events.id, slug: events.slug, title: events.title, category: events.category, startsAt: events.startsAt, bannerUrl: events.bannerUrl, status: events.status })
      .from(events).where(and(inArray(events.status, ['SCHEDULED', 'LIVE']), gte(events.startsAt, new Date(Date.now() - 6 * 3600_000)), isNull(events.deletedAt)))
      .orderBy(asc(events.startsAt)).limit(4),
    db.select().from(achievements).where(eq(achievements.isFeatured, true)).orderBy(desc(achievements.achievedAt)).limit(4),
    db.select({ milestone: milestones, member: memberMini }).from(milestones)
      .innerJoin(members, eq(members.id, milestones.memberId))
      .where(activeMember).orderBy(desc(milestones.isFeatured), desc(milestones.achievedAt)).limit(6),
    listPublic({ pageSize: 6 }).then((r) => r.data),
    // Whole active crew (hero ribbon + "The crew" grid), ordered by rank.
    db.select({ ...memberMini, rank: members.rank, rpCharacter: members.rpCharacter, isCreator: members.isCreator, tagline: members.tagline, bio: sql`left(${members.bio}, 220)` }).from(members)
      .where(activeMember).orderBy(asc(members.rankOrder), asc(members.displayName)).limit(60),
  ]);

  const [hydratedFeatured, crew] = await Promise.all([
    hydrateMembers(featured),
    hydrateMembers(roster),
  ]);

  const [counts] = await db.execute(/* sql */ `
    select (select count(*) from members where deleted_at is null and status = 'ACTIVE')::int as members,
           (select count(*) from members where deleted_at is null and status = 'ACTIVE' and is_creator)::int as creators,
           (select count(*) from live_streams where is_live)::int as live
  `).then((r) => r.rows);

  return {
    stats: counts,
    featuredMembers: hydratedFeatured,
    liveNow: live.map(({ stream, member }) => ({ ...stream, member })),
    latestVideos: latestVideos.map(({ video, member }) => ({ ...video, member })),
    announcements: news,
    upcomingEvents: upcoming,
    achievements: hof,
    milestones: recentMilestones.map(({ milestone, member }) => ({ ...milestone, member })),
    community,
    roster: roster.slice(0, 40),
    crew,
  };
}

homeRouter.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.json({ data: await getHome() });
});
