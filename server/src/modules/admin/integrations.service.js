import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { env } from '../../config/env.js';
import { badRequest } from '../../lib/errors.js';
import { audit } from '../../services/audit.js';
import { providers, runLockedSync, liveMode, getProvider } from '../../integrations/index.js';
import { loadStatus, estimateYouTubeUnits } from '../../integrations/sync.service.js';

const { platformAccounts, members } = schema;
const SYNCED = ['YOUTUBE', 'KICK'];

export async function getIntegrationsOverview() {
  const [status, accounts] = await Promise.all([
    loadStatus(),
    db.select({
      id: platformAccounts.id, platform: platformAccounts.platform, handle: platformAccounts.handle, url: platformAccounts.url,
      externalId: platformAccounts.externalId, followerCount: platformAccounts.followerCount, syncEnabled: platformAccounts.syncEnabled,
      lastSyncedAt: platformAccounts.lastSyncedAt, syncError: platformAccounts.syncError,
      memberId: members.id, memberName: members.displayName, memberSlug: members.slug,
    }).from(platformAccounts).innerJoin(members, eq(members.id, platformAccounts.memberId))
      .where(and(inArray(platformAccounts.platform, SYNCED), isNull(members.deletedAt)))
      .orderBy(asc(platformAccounts.platform), asc(members.displayName)),
  ]);
  const ytCount = accounts.filter((a) => a.platform === 'YOUTUBE' && a.syncEnabled).length;
  return {
    mode: env.STREAMING_MODE,
    intervalSeconds: env.SYNC_INTERVAL_SECONDS,
    lastRunAt: status.lastRunAt ?? null,
    providers: providers.map((p) => ({
      platform: p.platform,
      label: p.label,
      configured: p.configured,
      ...(status.providers?.[p.platform] ?? {}),
      ...(p.platform === 'YOUTUBE' && { dailyQuota: env.YOUTUBE_DAILY_QUOTA, estimatedUnitsPerRun: estimateYouTubeUnits(ytCount) }),
    })),
    accounts,
  };
}

export async function syncNow(actor, platform) {
  if (!liveMode()) throw badRequest('Live sync is off. Set STREAMING_MODE=live in server/.env and restart the server.');
  const summary = await runLockedSync({ platform, force: true });
  await audit(actor.id, 'integrations.sync', 'integration', platform ?? 'ALL', { summary });
  return { summary, overview: await getIntegrationsOverview() };
}

export async function subscribeKickWebhooks(actor) {
  const kick = getProvider('KICK');
  if (!kick?.configured) throw badRequest('Kick is not configured.');
  const rows = await db.select({ externalId: platformAccounts.externalId }).from(platformAccounts)
    .where(and(eq(platformAccounts.platform, 'KICK'), isNotNull(platformAccounts.externalId)));
  if (!rows.length) throw badRequest('Run a sync first so Kick channel IDs are known.');
  const results = await kick.subscribeLivestreamEvents([...new Set(rows.map((r) => r.externalId))]);
  await audit(actor.id, 'integrations.kick_subscribe', 'integration', 'KICK', { ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
  return { results };
}
