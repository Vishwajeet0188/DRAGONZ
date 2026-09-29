// Fan XP, levels and badges.
// - Every grant is a row in xp_events with a unique (user, reason, refKey) → an action can never pay twice.
// - Some actions are capped per day so XP can't be farmed (reactions, comments).
// - Badges are re-evaluated after each grant; newly earned ones create an in-app notification.
import { and, count, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';

const { users, xpEvents, userBadges, notifications, pollVotes, follows, communitySubmissions, quotes, comments, clipWinners, crewApplications } = schema;

export const XP = Object.freeze({
  DAILY_CHECKIN: 5,
  STREAK_BONUS: 25, // every 7th consecutive day
  VERIFY_EMAIL: 20,
  FOLLOW: 10,
  POLL_VOTE: 5,
  CLIP_VOTE: 5,
  REACTION: 1,
  COMMENT: 3,
  SHOWCASE_APPROVED: 25,
  QUOTE_APPROVED: 15,
  CLIP_WIN: 100,
  APPLICATION_SENT: 10,
});

const DAILY_CAPS = { REACTION: 20, COMMENT: 10 };

export const LEVELS = [
  { min: 0, name: 'Hatchling' },
  { min: 50, name: 'Whelp' },
  { min: 150, name: 'Drake' },
  { min: 300, name: 'Wyvern' },
  { min: 600, name: 'Fire Drake' },
  { min: 1000, name: 'Dragon' },
  { min: 1600, name: 'Elder Dragon' },
  { min: 2500, name: 'Ancient Dragon' },
  { min: 4000, name: 'Dragon Lord' },
];

export function levelFor(xp = 0) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1] ?? null;
  return { level: i + 1, name: LEVELS[i].name, min: LEVELS[i].min, nextAt: next?.min ?? null, nextName: next?.name ?? null };
}

/** Badge catalogue. `check(stats)` decides if a user has earned it. Order = display order. */
export const BADGES = [
  { key: 'EARLY_DRAGON', name: 'Early Dragon', icon: '🥚', description: 'One of the first 100 fans on Dragonz Central', check: (s) => s.signupRank <= 100 },
  { key: 'VERIFIED', name: 'Verified Fan', icon: '✅', description: 'Verified your email', check: (s) => s.verified },
  { key: 'FIRST_VOTE', name: 'First Vote', icon: '🗳️', description: 'Voted in a poll', check: (s) => s.pollVotes >= 1 },
  { key: 'POLLSTER', name: 'Pollster', icon: '📊', description: 'Voted in 10 polls', check: (s) => s.pollVotes >= 10 },
  { key: 'HYPE_FAN', name: 'Hype Fan', icon: '🔥', description: 'Following 5 or more creators', check: (s) => s.follows >= 5 },
  { key: 'STREAK_7', name: 'Week Streak', icon: '📅', description: 'Visited 7 days in a row', check: (s) => s.bestStreak >= 7 },
  { key: 'STREAK_30', name: 'Loyal Dragon', icon: '🐉', description: 'Visited 30 days in a row', check: (s) => s.bestStreak >= 30 },
  { key: 'SHOWCASED', name: 'Showcased', icon: '🎨', description: 'Had a post approved in the Community showcase', check: (s) => s.showcased >= 1 },
  { key: 'CLIP_CHAMPION', name: 'Clip Champion', icon: '🏆', description: 'Won Clip of the Week', check: (s) => s.clipWins >= 1 },
  { key: 'QUOTESMITH', name: 'Quotesmith', icon: '💬', description: 'Had a quote added to the Quote Wall', check: (s) => s.quotes >= 1 },
  { key: 'CHATTERBOX', name: 'Chatterbox', icon: '🗨️', description: 'Posted 25 comments', check: (s) => s.comments >= 25 },
  { key: 'RECRUIT', name: 'DRZ Recruit', icon: '⚔️', description: 'Accepted into the crew', check: (s) => s.accepted },
  { key: 'DRAGON_RANK', name: 'True Dragon', icon: '👑', description: 'Reached the Dragon level (1000 XP)', check: (s) => s.xp >= 1000 },
];
const BADGE_BY_KEY = Object.fromEntries(BADGES.map((b) => [b.key, b]));
export const publicBadge = (key) => { const b = BADGE_BY_KEY[key]; return b ? { key, name: b.name, icon: b.icon, description: b.description } : null; };

/** "Today" in India time — streaks and daily caps follow the audience's calendar, not UTC. */
export function istDay(d = new Date()) {
  return new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
function istDayStart(d = new Date()) {
  return new Date(`${istDay(d)}T00:00:00+05:30`);
}

/**
 * Grant XP once. Returns the points actually granted (0 if already granted or capped).
 * Never throws — XP is a bonus and must not break the action that triggered it.
 */
export async function awardXp(userId, reason, refKey = '', points = XP[reason]) {
  try {
    if (!userId || !points) return 0;
    const cap = DAILY_CAPS[reason];
    if (cap) {
      const [{ n }] = await db.select({ n: count() }).from(xpEvents)
        .where(and(eq(xpEvents.userId, userId), eq(xpEvents.reason, reason), gte(xpEvents.createdAt, istDayStart())));
      if (n >= cap) return 0;
    }
    const [row] = await db.insert(xpEvents).values({ userId, reason, refKey: String(refKey).slice(0, 120), points })
      .onConflictDoNothing().returning({ id: xpEvents.id });
    if (!row) return 0;
    await db.update(users).set({ xp: sql`${users.xp} + ${points}` }).where(eq(users.id, userId));
    await syncBadges(userId);
    return points;
  } catch (err) {
    logger.warn({ err: err.message, reason }, 'xp award failed');
    return 0;
  }
}

async function statsFor(userId) {
  const [u] = await db.select({ xp: users.xp, verified: users.emailVerifiedAt, createdAt: users.createdAt, streak: users.checkinStreak })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
  const one = async (q) => (await q)[0]?.n ?? 0;
  const [signupRank, pv, fl, sc, cw, qt, cm, acc, bestStreakRow] = await Promise.all([
    one(db.select({ n: count() }).from(users).where(and(lte(users.createdAt, u.createdAt), isNull(users.deletedAt)))),
    one(db.select({ n: count() }).from(pollVotes).where(eq(pollVotes.userId, userId))),
    one(db.select({ n: count() }).from(follows).where(eq(follows.userId, userId))),
    one(db.select({ n: count() }).from(communitySubmissions).where(and(eq(communitySubmissions.authorId, userId), inArray(communitySubmissions.status, ['APPROVED', 'FEATURED']), isNull(communitySubmissions.deletedAt)))),
    one(db.select({ n: count() }).from(clipWinners).innerJoin(communitySubmissions, eq(communitySubmissions.id, clipWinners.submissionId)).where(eq(communitySubmissions.authorId, userId))),
    one(db.select({ n: count() }).from(quotes).where(and(eq(quotes.submittedById, userId), eq(quotes.status, 'APPROVED'), isNull(quotes.deletedAt)))),
    one(db.select({ n: count() }).from(comments).where(and(eq(comments.userId, userId), isNull(comments.deletedAt)))),
    one(db.select({ n: count() }).from(crewApplications).where(and(eq(crewApplications.userId, userId), eq(crewApplications.status, 'ACCEPTED')))),
    // best streak ever = max streak recorded in check-in grants' refKey isn't needed: track via STREAK bonus rows
    one(db.select({ n: sql`coalesce(max((regexp_match(${xpEvents.refKey}, '^streak:(\\d+):'))[1]::int), 0)` }).from(xpEvents)
      .where(and(eq(xpEvents.userId, userId), eq(xpEvents.reason, 'DAILY_CHECKIN')))),
  ]);
  return {
    xp: u.xp, verified: Boolean(u.verified), signupRank, pollVotes: pv, follows: fl, showcased: sc, clipWins: cw,
    quotes: qt, comments: cm, accepted: acc > 0, bestStreak: Math.max(u.streak, bestStreakRow),
  };
}

/** Award any badges the user now qualifies for. Returns newly earned badge keys. */
export async function syncBadges(userId) {
  try {
    const stats = await statsFor(userId);
    if (!stats) return [];
    const earned = BADGES.filter((b) => b.check(stats)).map((b) => b.key);
    if (!earned.length) return [];
    const inserted = await db.insert(userBadges).values(earned.map((badge) => ({ userId, badge })))
      .onConflictDoNothing().returning({ badge: userBadges.badge });
    if (inserted.length) {
      await db.insert(notifications).values(inserted.map(({ badge }) => ({
        userId, type: 'SYSTEM', title: `${BADGE_BY_KEY[badge].icon} New badge: ${BADGE_BY_KEY[badge].name}`,
        body: BADGE_BY_KEY[badge].description, url: '/dashboard', dedupeKey: `badge:${badge}`,
      }))).onConflictDoNothing();
    }
    return inserted.map((r) => r.badge);
  } catch (err) {
    logger.warn({ err: err.message }, 'badge sync failed');
    return [];
  }
}

/**
 * Daily check-in (called when a signed-in user opens the site). Idempotent per India-time day.
 * Consecutive days grow the streak; every 7th day pays a bonus.
 */
export async function checkIn(userId) {
  const today = istDay();
  const yesterday = istDay(new Date(Date.now() - 86_400_000));
  const [u] = await db.select({ last: users.lastCheckinDay, streak: users.checkinStreak }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
  if (u.last === today) return { streak: u.streak, gained: 0 };
  const streak = u.last === yesterday ? u.streak + 1 : 1;
  // Conditional update guards against double check-ins from parallel requests.
  const [row] = await db.update(users).set({ lastCheckinDay: today, checkinStreak: streak })
    .where(and(eq(users.id, userId), sql`${users.lastCheckinDay} is distinct from ${today}`)).returning({ id: users.id });
  if (!row) return { streak: u.streak, gained: 0 };
  let gained = await awardXp(userId, 'DAILY_CHECKIN', `streak:${streak}:${today}`);
  if (streak % 7 === 0) gained += await awardXp(userId, 'STREAK_BONUS', today);
  return { streak, gained };
}

/** Progress for the signed-in user's dashboard. */
export async function progressFor(userId) {
  const [u] = await db.select({ xp: users.xp, streak: users.checkinStreak, last: users.lastCheckinDay, show: users.showOnLeaderboard })
    .from(users).where(eq(users.id, userId)).limit(1);
  const owned = await db.select({ badge: userBadges.badge, awardedAt: userBadges.awardedAt }).from(userBadges).where(eq(userBadges.userId, userId));
  const ownedMap = new Map(owned.map((b) => [b.badge, b.awardedAt]));
  const [{ ahead }] = await db.select({ ahead: count() }).from(users)
    .where(and(isNull(users.deletedAt), eq(users.showOnLeaderboard, true), sql`${users.xp} > ${u.xp}`));
  const streakAlive = u.last === istDay() || u.last === istDay(new Date(Date.now() - 86_400_000));
  return {
    xp: u.xp, ...levelFor(u.xp), streak: streakAlive ? u.streak : 0, rank: u.show ? ahead + 1 : null, showOnLeaderboard: u.show,
    badges: BADGES.map(({ key, name, icon, description }) => ({ key, name, icon, description, earned: ownedMap.has(key), awardedAt: ownedMap.get(key) ?? null })),
  };
}

/** Public leaderboard — display name, avatar, level and badges only. */
export async function leaderboard(limit = 10) {
  const rows = await db.select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl, xp: users.xp })
    .from(users).where(and(isNull(users.deletedAt), eq(users.showOnLeaderboard, true), sql`${users.xp} > 0`))
    .orderBy(sql`${users.xp} desc`, users.createdAt).limit(limit);
  if (!rows.length) return [];
  const badges = await db.select().from(userBadges).where(inArray(userBadges.userId, rows.map((r) => r.id)));
  const byUser = Map.groupBy(badges, (b) => b.userId);
  return rows.map((r, i) => ({
    rank: i + 1, displayName: r.displayName, avatarUrl: r.avatarUrl, xp: r.xp, ...levelFor(r.xp),
    badges: (byUser.get(r.id) ?? []).map((b) => publicBadge(b.badge)).filter(Boolean),
  }));
}
