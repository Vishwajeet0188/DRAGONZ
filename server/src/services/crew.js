// Crew activity: weekly streaming stats per member, goals set by admins, streaks, score, crew badges,
// and who earns a spot in "Featured crew".
//
// Weeks run Monday 00:00 → Sunday 23:59 India time (same as Clip of the Week).
// Stream time comes from live_streams (YouTube + Kick). Overlapping streams — e.g. multistreaming to YouTube
// and Kick at once — are merged, so the same hour never counts twice. Very short sessions don't count.
// Uploads = new videos in the week, excluding replays of live streams.
import { and, eq, gte, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { weekOf } from '../modules/fanzone/clips.js';

const { members, liveStreams, videos, siteSettings } = schema;
const RULES_KEY = 'crew.rules';
const WEEKS_TRACKED = 13; // current week + 12 past weeks (streaks, badges)
const MERGE_GAP_MS = 5 * 60_000; // a stream that drops and restarts within 5 min is one session
const IST = 5.5 * 3_600_000;

export const DEFAULT_RULES = {
  mode: 'AUTO',          // AUTO = earned by activity (+ pins); MANUAL = only members an admin pinned
  minStreams: 3,         // streams per week
  minHours: 6,           // hours streamed per week
  minDays: 0,            // different days streamed per week (0 = not required)
  minUploads: 0,         // new videos per week (0 = not required)
  minSessionMinutes: 20, // shorter streams don't count
  maxFeatured: 8,
  showProgress: true,    // show weekly progress publicly on member profiles
  excluded: [],          // member ids never auto-featured
};

export const CREW_BADGES = {
  STREAMER_OF_WEEK: { name: 'Streamer of the Week', icon: '👑', description: 'Top crew score last week' },
  IRON_STREAK: { name: 'Iron Streak', icon: '🛡️', description: 'Hit the weekly goals 4 weeks in a row' },
  HOURS_100: { name: '100 Hours Club', icon: '💯', description: '100+ hours streamed (last 3 months)' },
  HOURS_50: { name: '50 Hours Club', icon: '⏱️', description: '50+ hours streamed (last 3 months)' },
  MARATHON: { name: 'Marathon', icon: '🏃', description: 'One stream of 6+ hours' },
  NIGHT_OWL: { name: 'Night Owl', icon: '🦉', description: '3+ streams started after midnight' },
};

export async function getCrewRules() {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, RULES_KEY)).limit(1);
  return { ...DEFAULT_RULES, ...(row?.value ?? {}) };
}

export async function saveCrewRules(patch) {
  const next = { ...(await getCrewRules()), ...patch };
  await db.insert(siteSettings).values({ key: RULES_KEY, value: next })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: next } });
  invalidateCrew();
  return next;
}

// ── Stats ───────────────────────────────────────────────────────────────
const emptyStats = () => ({ streams: 0, hours: 0, days: 0, uploads: 0, peakViewers: 0, longestHours: 0, nightStreams: 0 });
const round1 = (n) => Math.round(n * 10) / 10;
const istDay = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
const istHour = (ms) => new Date(ms + IST).getUTCHours();

/** Merge a member's stream intervals (sorted) into sessions. */
function mergeSessions(rows, now) {
  const iv = rows
    .map((r) => ({ s: new Date(r.startedAt).getTime(), e: r.isLive ? now : new Date(r.endedAt ?? r.updatedAt).getTime(), peak: r.peakViewers ?? r.viewerCount ?? 0 }))
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s);
  const out = [];
  for (const x of iv) {
    const last = out.at(-1);
    if (last && x.s <= last.e + MERGE_GAP_MS) { last.e = Math.max(last.e, x.e); last.peak = Math.max(last.peak, x.peak); } else out.push({ ...x });
  }
  return out;
}

function weekStats(sessions, uploads, wk, minSessionMs) {
  const st = emptyStats();
  const start = wk.start.getTime(), end = wk.end.getTime();
  const days = new Set();
  for (const x of sessions) {
    const s = Math.max(x.s, start), e = Math.min(x.e, end);
    if (e - s < minSessionMs) continue;
    st.streams++;
    st.hours += (e - s) / 3_600_000;
    st.longestHours = Math.max(st.longestHours, (x.e - x.s) / 3_600_000);
    st.peakViewers = Math.max(st.peakViewers, x.peak);
    days.add(istDay(s));
    if (x.s >= start && istHour(x.s) < 5) st.nightStreams++;
  }
  st.days = days.size;
  st.uploads = uploads.filter((t) => t >= start && t < end).length;
  st.hours = round1(st.hours);
  st.longestHours = round1(st.longestHours);
  return st;
}

export function meetsGoals(st, r) {
  const any = r.minStreams || r.minHours || r.minDays || r.minUploads;
  if (!any) return st.hours > 0;
  return st.streams >= r.minStreams && st.hours >= r.minHours && st.days >= r.minDays && st.uploads >= r.minUploads;
}

/** What's still missing to hit this week's goals. */
function needs(st, r) {
  return {
    streams: Math.max(0, r.minStreams - st.streams),
    hours: round1(Math.max(0, r.minHours - st.hours)),
    days: Math.max(0, r.minDays - st.days),
    uploads: Math.max(0, r.minUploads - st.uploads),
  };
}

export const crewScore = (st, streak = 0) => Math.round(st.hours * 10 + st.streams * 5 + st.days * 5 + st.uploads * 8 + streak * 10);

// ── Report (cached briefly; the home page and profiles read it often) ───
let cache = null;
export const invalidateCrew = () => { cache = null; };

export async function crewReport({ now = Date.now() } = {}) {
  if (cache && now - cache.at < 60_000) return cache.data;
  const rules = await getCrewRules();
  const weeks = Array.from({ length: WEEKS_TRACKED }, (_, i) => weekOf(new Date(now - i * 7 * 86_400_000))); // [0] = current
  const from = weeks.at(-1).start;
  const minSessionMs = rules.minSessionMinutes * 60_000;

  const [roster, streamRows, videoRows] = await Promise.all([
    db.select({ id: members.id, slug: members.slug, displayName: members.displayName, avatarUrl: members.avatarUrl, accentColor: members.accentColor, rank: members.rank, rankOrder: members.rankOrder, isFeatured: members.isFeatured, isCreator: members.isCreator })
      .from(members).where(and(isNull(members.deletedAt), eq(members.status, 'ACTIVE'))),
    db.select({ memberId: liveStreams.memberId, startedAt: liveStreams.startedAt, endedAt: liveStreams.endedAt, updatedAt: liveStreams.updatedAt, isLive: liveStreams.isLive, peakViewers: liveStreams.peakViewers, viewerCount: liveStreams.viewerCount })
      .from(liveStreams).where(and(ne(liveStreams.source, 'MOCK'), lt(liveStreams.startedAt, new Date(now)), or(eq(liveStreams.isLive, true), gte(liveStreams.endedAt, from)))),
    // New uploads, not counting replays of live streams (those are counted as stream time instead).
    db.select({ memberId: videos.memberId, publishedAt: videos.publishedAt }).from(videos)
      .where(and(gte(videos.publishedAt, from), isNull(videos.deletedAt), eq(videos.isHidden, false),
        sql`not exists (select 1 from live_streams ls where ls.platform = ${videos.platform} and ls.external_id = ${videos.externalId})`)),
  ]);

  const streamsBy = Map.groupBy(streamRows, (r) => r.memberId);
  const uploadsBy = Map.groupBy(videoRows, (r) => r.memberId);
  const excluded = new Set(rules.excluded ?? []);

  const rows = roster.map((m) => {
    const sessions = mergeSessions(streamsBy.get(m.id) ?? [], now);
    const ups = (uploadsBy.get(m.id) ?? []).map((v) => new Date(v.publishedAt).getTime());
    const perWeek = weeks.map((wk) => weekStats(sessions, ups, wk, minSessionMs));
    const met = perWeek.map((st) => meetsGoals(st, rules));
    let streakWeeks = 0;
    for (let i = 1; i < met.length && met[i]; i++) streakWeeks++; // consecutive completed weeks
    const totalHours = round1(perWeek.reduce((s, w) => s + w.hours, 0));
    const longest = Math.max(0, ...perWeek.map((w) => w.longestHours));
    const nights = perWeek.reduce((s, w) => s + w.nightStreams, 0);
    const [thisWeek, lastWeek] = perWeek;
    return {
      member: m,
      pinned: m.isFeatured,
      excluded: excluded.has(m.id),
      thisWeek, lastWeek,
      qualifiedThisWeek: met[0], qualifiedLastWeek: met[1],
      streakWeeks,
      needs: needs(thisWeek, rules),
      score: crewScore(thisWeek, streakWeeks + (met[0] ? 1 : 0)),
      lastWeekScore: crewScore(lastWeek, streakWeeks),
      totalHours,
      badgeKeys: [
        ...(streakWeeks >= 4 ? ['IRON_STREAK'] : []),
        ...(totalHours >= 100 ? ['HOURS_100'] : totalHours >= 50 ? ['HOURS_50'] : []),
        ...(longest >= 6 ? ['MARATHON'] : []),
        ...(nights >= 3 ? ['NIGHT_OWL'] : []),
      ],
      weeksHistory: perWeek.slice(1, 9).map((w, i) => ({ weekKey: weeks[i + 1].key, hours: w.hours, streams: w.streams, met: met[i + 1] })),
    };
  });

  // Streamer of the Week = best score last (completed) week among members who hit the goals.
  const sow = rows.filter((r) => !r.excluded && r.qualifiedLastWeek && r.lastWeekScore > 0).sort((a, b) => b.lastWeekScore - a.lastWeekScore)[0] ?? null;
  if (sow) sow.badgeKeys.unshift('STREAMER_OF_WEEK');

  const data = { rules, week: { key: weeks[0].key, start: weeks[0].start, end: weeks[0].end }, lastWeekKey: weeks[1].key, rows, streamerOfWeekId: sow?.member.id ?? null };
  cache = { at: now, data };
  return data;
}

const badgeList = (keys) => keys.map((k) => ({ key: k, ...CREW_BADGES[k] }));

/** Public summary for one member (profile page). Progress numbers only if the admin allows it. */
export function publicCrew(row, report) {
  if (!row) return null;
  const { rules } = report;
  const base = {
    badges: badgeList(row.badgeKeys),
    isStreamerOfWeek: report.streamerOfWeekId === row.member.id,
    streakWeeks: row.streakWeeks,
    qualifiedThisWeek: row.qualifiedThisWeek,
  };
  if (!rules.showProgress) return base;
  return {
    ...base,
    weekKey: report.week.key, weekEndsAt: report.week.end,
    goals: { streams: rules.minStreams, hours: rules.minHours, days: rules.minDays, uploads: rules.minUploads },
    thisWeek: row.thisWeek, lastWeek: row.lastWeek, needs: row.needs,
    history: row.weeksHistory,
  };
}

export async function crewForMember(memberId) {
  const report = await crewReport();
  return publicCrew(report.rows.find((r) => r.member.id === memberId), report);
}

/**
 * Who appears in "Featured crew".
 *  AUTO: pinned members + everyone who hit the goals this week or last week, best score first.
 *        Nobody else is shown — if nobody has hit the goals yet, only pinned members appear.
 *  MANUAL: pinned members only (the old behaviour).
 */
export async function featuredCrew() {
  const report = await crewReport();
  const { rules, rows } = report;
  const byRank = (a, b) => a.member.rankOrder - b.member.rankOrder;
  const pinned = rows.filter((r) => r.pinned).sort(byRank);
  let picked;
  let basis;
  if (rules.mode === 'MANUAL') {
    picked = pinned.map((r) => ({ row: r, reason: 'PINNED' }));
    basis = 'MANUAL';
  } else {
    const earned = rows.filter((r) => !r.pinned && !r.excluded && (r.qualifiedThisWeek || r.qualifiedLastWeek))
      .sort((a, b) => (b.score + b.lastWeekScore) - (a.score + a.lastWeekScore));
    picked = [...pinned.map((r) => ({ row: r, reason: 'PINNED' })), ...earned.map((r) => ({ row: r, reason: r.qualifiedThisWeek ? 'EARNED' : 'EARNED_LAST_WEEK' }))];
    basis = 'GOALS';
  }
  // Streamer of the Week always leads.
  picked.sort((a, b) => Number(b.row.member.id === report.streamerOfWeekId) - Number(a.row.member.id === report.streamerOfWeekId));
  return {
    basis,
    goals: { streams: rules.minStreams, hours: rules.minHours, days: rules.minDays, uploads: rules.minUploads, mode: rules.mode },
    items: picked.slice(0, rules.maxFeatured).map(({ row, reason }) => ({ memberId: row.member.id, reason, crew: publicCrew(row, report) })),
  };
}

/** This week's crew ranking (Live page). Empty when progress is private. */
export async function weekLeaderboard(limit = 10) {
  const report = await crewReport();
  if (!report.rules.showProgress) return { week: report.week, items: [] };
  const items = report.rows.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
    .map((r, i) => {
      const { id, slug, displayName, avatarUrl, accentColor, rank } = r.member;
      return { rank: i + 1, member: { slug, displayName, avatarUrl, accentColor, rank }, score: r.score, thisWeek: r.thisWeek, qualified: r.qualifiedThisWeek, streakWeeks: r.streakWeeks, isStreamerOfWeek: id === report.streamerOfWeekId };
    });
  return { week: report.week, goals: { streams: report.rules.minStreams, hours: report.rules.minHours }, items };
}

