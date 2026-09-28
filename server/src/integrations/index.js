// Wires providers + sync engine + scheduler together. One shared instance per process.
import { env } from '../config/env.js';
import { pool } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { buildProviders } from './providers/index.js';
import { createSyncService } from './sync.service.js';
import { notifyStreamStarted } from '../services/notifications.js';

const LOCK_KEY = 7310421; // pg advisory lock id: only one server instance syncs at a time

export const providers = buildProviders();
export const syncService = createSyncService({
  providers,
  onStreamStarted: notifyStreamStarted,
  youtubeDailyQuota: env.YOUTUBE_DAILY_QUOTA,
});

export const liveMode = () => env.STREAMING_MODE === 'live';
export const getProvider = (platform) => providers.find((p) => p.platform === platform);

/** Run a sync while holding a cluster-wide advisory lock (safe with multiple API instances). */
export async function runLockedSync(opts = {}) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('select pg_try_advisory_lock($1) as ok', [LOCK_KEY]);
    if (!rows[0].ok) return { skipped: 'another instance is syncing' };
    try {
      return await syncService.run(opts);
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

let timer = null;
let soonTimer = null;

/** Ask for a sync shortly (debounced) — used by webhooks so bursts collapse into one run. */
export function requestSync(platform) {
  if (!liveMode()) return;
  clearTimeout(soonTimer);
  soonTimer = setTimeout(() => runLockedSync({ platform, force: true }).catch((err) => logger.error({ err }, 'sync failed')), 3_000);
  soonTimer.unref?.();
}

export function startSyncScheduler() {
  if (!liveMode()) {
    logger.info('Streaming sync is OFF (STREAMING_MODE=mock) — showing demo data only');
    return;
  }
  for (const p of providers) {
    logger.info(`Streaming sync: ${p.label} ${p.configured ? 'configured ✔' : 'NOT configured (add credentials to .env)'}`);
  }
  const tick = async () => {
    try {
      const summary = await runLockedSync();
      logger.debug({ summary }, 'sync tick');
    } catch (err) {
      logger.error({ err }, 'sync tick failed');
    } finally {
      // Small jitter so multiple instances don't align.
      timer = setTimeout(tick, env.SYNC_INTERVAL_SECONDS * 1000 + Math.random() * 5_000);
      timer.unref?.();
    }
  };
  timer = setTimeout(tick, 5_000); // first run shortly after boot
  timer.unref?.();
}

export function stopSyncScheduler() {
  clearTimeout(timer);
  clearTimeout(soonTimer);
}
