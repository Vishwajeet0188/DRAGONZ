import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, count, exists } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { notFound } from '../../lib/errors.js';
import { escapeLike, paginate, pageMeta } from '../../lib/util.js';
import { listPublic } from '../community/community.service.js';

const { members, platformAccounts, liveStreams, videos, achievements, milestones, follows, communitySubmissions } = schema;

/** Columns exposed on public member cards. */
export const memberCardColumns = {
  id: members.id,
  slug: members.slug,
  displayName: members.displayName,
  rank: members.rank,
  rankOrder: members.rankOrder,
  rpCharacter: members.rpCharacter,
  tagline: members.tagline,
  avatarUrl: members.avatarUrl,
  accentColor: members.accentColor,
  isCreator: members.isCreator,
  isFeatured: members.isFeatured,
  status: members.status,
};

const publicPlatform = (p) => ({ platform: p.platform, handle: p.handle, url: p.url, isPrimary: p.isPrimary, followerCount: p.followerCount });

/**
 * Attach platform links + live status to a list of members using two batched queries (no N+1).
 */
export async function hydrateMembers(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [plats, lives] = await Promise.all([
    db.select().from(platformAccounts).where(inArray(platformAccounts.memberId, ids)).orderBy(desc(platformAccounts.isPrimary)),
    db.select({ memberId: liveStreams.memberId, platform: liveStreams.platform, title: liveStreams.title, url: liveStreams.url })
      .from(liveStreams).where(and(inArray(liveStreams.memberId, ids), eq(liveStreams.isLive, true))),
  ]);
  const platBy = Map.groupBy(plats, (p) => p.memberId);
  const liveBy = Map.groupBy(lives, (l) => l.memberId);
  return rows.map((m) => ({
    ...m,
    platforms: (platBy.get(m.id) ?? []).map(publicPlatform),
    live: liveBy.get(m.id)?.[0] ?? null,
  }));
}

const visible = and(isNull(members.deletedAt), inArray(members.status, ['ACTIVE', 'ALUMNI']));

export async function listMembers({ q, rank, creator, platform, live, sort, page, pageSize }) {
  const pg = paginate({ page, pageSize });
  const filters = [visible];
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    filters.push(or(ilike(members.displayName, pattern), ilike(members.rpCharacter, pattern), ilike(members.rank, pattern)));
  }
  if (rank) filters.push(eq(members.rank, rank));
  if (creator !== undefined) filters.push(eq(members.isCreator, creator));
  if (platform) {
    filters.push(exists(db.select({ x: sql`1` }).from(platformAccounts)
      .where(and(eq(platformAccounts.memberId, members.id), eq(platformAccounts.platform, platform)))));
  }
  if (live) {
    filters.push(exists(db.select({ x: sql`1` }).from(liveStreams)
      .where(and(eq(liveStreams.memberId, members.id), eq(liveStreams.isLive, true)))));
  }
  const where = and(...filters);

  const order = {
    rank: [asc(members.rankOrder), asc(members.displayName)],
    name: [asc(members.displayName)],
    newest: [desc(members.joinedAt), asc(members.displayName)],
  }[sort ?? 'rank'];

  const [rows, [{ total }]] = await Promise.all([
    db.select(memberCardColumns).from(members).where(where).orderBy(...order).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(members).where(where),
  ]);
  return { data: await hydrateMembers(rows), meta: pageMeta(pg, total) };
}

export async function listRanks() {
  const rows = await db.selectDistinct({ rank: members.rank, rankOrder: members.rankOrder })
    .from(members).where(visible).orderBy(asc(members.rankOrder));
  return [...new Set(rows.map((r) => r.rank))];
}

export async function getMemberProfile(slug, viewerId) {
  const [member] = await db.select({
    ...memberCardColumns,
    bio: members.bio,
    bannerUrl: members.bannerUrl,
    joinedAt: members.joinedAt,
  }).from(members).where(and(eq(members.slug, slug), visible)).limit(1);
  if (!member) throw notFound('Member not found');

  const id = member.id;
  const [[hydrated], latestVideos, featuredVideos, memberAchievements, memberMilestones, [{ followers }], highlights, viewerFollow] = await Promise.all([
    hydrateMembers([member]),
    db.select().from(videos).where(and(eq(videos.memberId, id), eq(videos.isHidden, false), isNull(videos.deletedAt))).orderBy(desc(videos.publishedAt)).limit(8),
    db.select().from(videos).where(and(eq(videos.memberId, id), eq(videos.isFeatured, true), eq(videos.isHidden, false), isNull(videos.deletedAt))).orderBy(desc(videos.publishedAt)).limit(4),
    db.select().from(achievements).where(eq(achievements.memberId, id)).orderBy(desc(achievements.achievedAt)).limit(12),
    db.select().from(milestones).where(eq(milestones.memberId, id)).orderBy(desc(milestones.achievedAt)).limit(12),
    db.select({ followers: count() }).from(follows).where(eq(follows.memberId, id)),
    listPublic({ member: slug, pageSize: 6, featuredFirst: true }).then((r) => r.data),
    viewerId
      ? db.select({ notifyLive: follows.notifyLive }).from(follows).where(and(eq(follows.userId, viewerId), eq(follows.memberId, id))).limit(1)
      : Promise.resolve([]),
  ]);

  const liveNow = await db.select().from(liveStreams).where(and(eq(liveStreams.memberId, id), eq(liveStreams.isLive, true)));

  return {
    ...hydrated,
    liveStreams: liveNow,
    latestVideos,
    featuredVideos,
    achievements: memberAchievements,
    milestones: memberMilestones,
    communityHighlights: highlights,
    stats: { followers },
    viewer: { following: viewerFollow.length > 0, notifyLive: viewerFollow[0]?.notifyLive ?? false },
  };
}
