// Sync engine: asks each configured provider for fresh data, then reconciles the database.
//
// Live-stream state machine (per platform account whose status the provider confirmed this run):
//   not live → live   : insert live_streams row (isLive) and fire onStreamStarted (notifications)
//   live → live       : refresh title / viewers / thumbnail
//   live → not live   : mark row ended (isLive=false, endedAt)
// Safety nets: rows not refreshed for STALE_MS are ended; MOCK demo streams are ended in live mode.
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';

const { platformAccounts, members, videos, liveStreams, siteSettings } = schema;
const STALE_MS = 30 * 60_000;
// When we only notice a stream has ended later (server asleep, provider hiccup), assume it ended at most this long
// after we last saw it live — so crew stream-hours are never inflated by our own downtime.
const END_GRACE = "interval '10 minutes'";
const endedAtExpr = (now) => sql`least(${now.toISOString()}::timestamptz, ${liveStreams.updatedAt} + ${sql.raw(END_GRACE)})`;
const STATUS_KEY = 'integrations.status';

const today = () => new Date().toISOString().slice(0, 10);

export async function loadStatus() {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, STATUS_KEY)).limit(1);
  return row?.value ?? { providers: {} };
}

async function saveStatus(status) {
  await db.insert(siteSettings).values({ key: STATUS_KEY, value: status })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: status, updatedAt: new Date() } });
}

/** Accounts eligible for sync: auto-sync on, member active & not deleted. */
async function loadAccounts(platforms, accountIds) {
  const filters = [
    inArray(platformAccounts.platform, platforms),
    eq(platformAccounts.syncEnabled, true),
    isNull(members.deletedAt),
    inArray(members.status, ['ACTIVE', 'ALUMNI']),
  ];
  if (accountIds?.length) filters.push(inArray(platformAccounts.id, accountIds));
  return db.select({
    id: platformAccounts.id, memberId: platformAccounts.memberId, platform: platformAccounts.platform,
    handle: platformAccounts.handle, url: platformAccounts.url, externalId: platformAccounts.externalId,
  }).from(platformAccounts).innerJoin(members, eq(members.id, platformAccounts.memberId)).where(and(...filters));
}

async function persistAccounts(result, now) {
  for (const a of result.accounts) {
    const set = { syncError: a.error ? String(a.error).slice(0, 300) : null, updatedAt: now };
    if (!a.error) set.lastSyncedAt = now;
    if (a.externalId) set.externalId = a.externalId;
    if (typeof a.followerCount === 'number' && Number.isFinite(a.followerCount)) set.followerCount = a.followerCount;
    try {
      await db.update(platformAccounts).set(set).where(eq(platformAccounts.id, a.id));
      // Fill in a missing member photo from the channel picture (never overwrites an uploaded one).
      if (typeof a.avatarUrl === 'string' && a.avatarUrl.startsWith('https://')) {
        await db.update(members).set({ avatarUrl: a.avatarUrl.slice(0, 500), updatedAt: now })
          .where(and(
            sql`${members.id} = (select ${platformAccounts.memberId} from ${platformAccounts} where ${platformAccounts.id} = ${a.id})`,
            or(isNull(members.avatarUrl), eq(members.avatarUrl, '')),
          ));
      }
    } catch (err) {
      if (err.code !== '23505' && err.cause?.code !== '23505') throw err;
      // Same channel linked to two members — keep the first, flag this one.
      await db.update(platformAccounts)
        .set({ syncError: 'This channel is already linked to another member', updatedAt: now })
        .where(eq(platformAccounts.id, a.id));
    }
  }
}

async function persistVideos(platform, items) {
  for (const v of items) {
    await db.insert(videos).values({
      memberId: v.memberId, platformAccountId: v.accountId, platform, externalId: v.externalId,
      title: v.title, url: v.url, thumbnailUrl: v.thumbnailUrl, durationSec: v.durationSec,
      viewCount: v.viewCount, publishedAt: v.publishedAt, source: 'SYNC',
    }).onConflictDoUpdate({
      target: [videos.platform, videos.externalId],
      set: { title: v.title, thumbnailUrl: v.thumbnailUrl, durationSec: v.durationSec, viewCount: v.viewCount, updatedAt: new Date() },
    });
  }
}

async function persistLive(platform, result, now) {
  const checked = result.checkedAccountIds;
  const current = checked.length
    ? await db.select().from(liveStreams).where(and(eq(liveStreams.platform, platform), eq(liveStreams.isLive, true), inArray(liveStreams.platformAccountId, checked)))
    : [];
  const currentByAccount = Map.groupBy(current, (r) => r.platformAccountId);
  const currentIds = new Set(current.map((r) => r.externalId));

  const started = [];
  const seen = new Set();
  for (const s of result.live) {
    let externalId = s.externalId;
    // Provider couldn't give a stable id (e.g. no start time) → keep the ongoing row for that account.
    if (s.stableId === false) externalId = currentByAccount.get(s.accountId)?.[0]?.externalId ?? externalId;
    seen.add(externalId);
    const [row] = await db.insert(liveStreams).values({
      memberId: s.memberId, platformAccountId: s.accountId, platform, externalId, title: s.title, url: s.url,
      thumbnailUrl: s.thumbnailUrl, viewerCount: s.viewerCount, peakViewers: s.viewerCount, isLive: true, startedAt: s.startedAt, source: 'SYNC',
    }).onConflictDoUpdate({
      target: [liveStreams.platform, liveStreams.externalId],
      set: {
        title: s.title, viewerCount: s.viewerCount, thumbnailUrl: s.thumbnailUrl, isLive: true, endedAt: null, updatedAt: now,
        peakViewers: sql`greatest(coalesce(${liveStreams.peakViewers}, 0), coalesce(excluded.viewer_count, 0))`,
      },
    }).returning();
    if (!currentIds.has(externalId)) started.push(row);
  }

  const ended = current.filter((r) => !seen.has(r.externalId));
  if (ended.length) {
    await db.update(liveStreams).set({ isLive: false, endedAt: endedAtExpr(now), updatedAt: now })
      .where(inArray(liveStreams.id, ended.map((r) => r.id)));
  }
  return { started, ended };
}

/**
 * Finished YouTube streams carry their exact start/end time. Record (or correct) them so crew stream-hours are
 * right even for streams we missed while the server slept. Never marks anything live, never notifies.
 */
async function persistPastStreams(platform, items = []) {
  for (const s of items) {
    await db.insert(liveStreams).values({
      memberId: s.memberId, platformAccountId: s.accountId, platform, externalId: s.externalId, title: s.title, url: s.url,
      thumbnailUrl: s.thumbnailUrl, isLive: false, startedAt: s.startedAt, endedAt: s.endedAt, source: 'SYNC',
    }).onConflictDoUpdate({
      target: [liveStreams.platform, liveStreams.externalId],
      set: { startedAt: s.startedAt, endedAt: s.endedAt, isLive: false },
      where: eq(liveStreams.isLive, false),
    });
  }
}

/** Rough YouTube units per run, used to keep polling under the daily quota. */
export function estimateYouTubeUnits(accountCount, videosPerChannel = 6) {
  if (!accountCount) return 0;
  return Math.ceil(accountCount / 50) + accountCount + Math.ceil((accountCount * videosPerChannel) / 50);
}

/**
 * @param {{providers: Array, onStreamStarted?: (stream) => Promise<void>, youtubeDailyQuota?: number}} deps
 */
export function createSyncService({ providers, onStreamStarted = async () => {}, youtubeDailyQuota = 10_000 }) {
  let running = null;

  async function runProvider(provider, status, { accountIds, force }) {
    const now = new Date();
    const st = (status.providers[provider.platform] ??= {});
    st.label = provider.label;
    st.configured = provider.configured;
    if (!provider.configured) { st.ok = false; st.error = 'Not configured — add credentials to server/.env'; return null; }

    const accounts = await loadAccounts([provider.platform], accountIds);
    st.accounts = accounts.length;
    if (!accounts.length) { st.ok = true; st.error = null; st.lastRunAt = now.toISOString(); return null; }

    if (provider.platform === 'YOUTUBE') {
      if (st.quotaDay !== today()) { st.quotaDay = today(); st.unitsToday = 0; }
      const estimate = estimateYouTubeUnits(accounts.length);
      // Keep ~10% headroom and space runs so a full day of polling fits in the quota.
      const runsPerDay = Math.max(1, Math.floor((youtubeDailyQuota * 0.9) / Math.max(estimate, 1)));
      const minGapMs = (86_400_000 / runsPerDay);
      st.minIntervalSeconds = Math.ceil(minGapMs / 1000);
      if (!force && st.lastRunAt && now - new Date(st.lastRunAt) < minGapMs) return { skipped: 'quota pacing' };
      if (st.unitsToday + estimate > youtubeDailyQuota * 0.95) {
        st.ok = false; st.error = 'Daily YouTube quota nearly used — pausing until tomorrow (UTC)';
        return { skipped: 'quota' };
      }
    }

    try {
      const result = await provider.sync(accounts);
      await persistAccounts(result, now);
      await persistVideos(provider.platform, result.videos);
      const { started, ended } = await persistLive(provider.platform, result, now);
      await persistPastStreams(provider.platform, result.pastStreams);
      st.ok = true;
      st.error = null;
      st.lastRunAt = now.toISOString();
      st.lastSuccessAt = now.toISOString();
      st.liveNow = result.live.length;
      st.videosSeen = result.videos.length;
      st.accountErrors = result.accounts.filter((a) => a.error).length;
      if (result.unitsUsed != null) st.unitsToday = (st.unitsToday ?? 0) + result.unitsUsed;

      for (const s of started) {
        logger.info({ platform: provider.platform, streamId: s.id }, 'stream started');
        await onStreamStarted(s).catch((err) => logger.error({ err }, 'onStreamStarted failed'));
      }
      if (ended.length) logger.info({ platform: provider.platform, count: ended.length }, 'streams ended');
      return { started: started.length, ended: ended.length, live: result.live.length, videos: result.videos.length };
    } catch (err) {
      st.ok = false;
      st.lastRunAt = now.toISOString();
      st.error = String(err.message).slice(0, 300);
      if (/quotaExceeded/i.test(err.message)) st.unitsToday = youtubeDailyQuota;
      logger.warn({ platform: provider.platform, err: err.message }, 'provider sync failed');
      return { error: st.error };
    }
  }

  async function cleanup(now) {
    // Demo streams never represent reality once real syncing is on.
    await db.update(liveStreams).set({ isLive: false, endedAt: now, updatedAt: now })
      .where(and(eq(liveStreams.isLive, true), eq(liveStreams.source, 'MOCK')));
    // Anything we stopped hearing about (account deleted, sync disabled, provider down) → ended.
    await db.update(liveStreams).set({ isLive: false, endedAt: endedAtExpr(now), updatedAt: now })
      .where(and(eq(liveStreams.isLive, true), eq(liveStreams.source, 'SYNC'), lt(liveStreams.updatedAt, new Date(now - STALE_MS))));
  }

  /** Run all (or one) providers. Concurrent calls share the in-flight run. */
  async function run({ platform, accountIds, force = false } = {}) {
    if (running) return running;
    running = (async () => {
      const started = Date.now();
      const status = await loadStatus();
      status.providers ??= {};
      const summary = {};
      for (const p of providers) {
        if (platform && p.platform !== platform) continue;
        summary[p.platform] = await runProvider(p, status, { accountIds, force });
      }
      await cleanup(new Date());
      status.lastRunAt = new Date().toISOString();
      status.durationMs = Date.now() - started;
      await saveStatus(status);
      return summary;
    })().finally(() => { running = null; });
    return running;
  }

  return { run, isRunning: () => Boolean(running) };
}

export const _internals = { persistLive, persistPastStreams, sql };
