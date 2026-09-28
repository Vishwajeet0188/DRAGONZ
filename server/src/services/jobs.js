// Background jobs, driven by ONE "tick" that is safe to call often:
//   • an in-process timer (every 60 s) while the server is awake
//   • GET /api/cron/tick from an external scheduler (cron-job.org etc.) — keeps free hosts that
//     sleep when idle syncing, because the request itself wakes the server.
// Each job is paced by its own interval, so extra ticks are cheap no-ops.
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { pool } from '../db/index.js';
import { processOutbox } from './email/index.js';
import { runLockedSync, liveMode } from '../integrations/index.js';
import { sendDueEventReminders } from '../modules/events/events.service.js';

const last = { sync: 0, email: 0, reminders: 0, cleanup: 0 };
let running = null;

async function runJob(name, everyMs, fn, force) {
  if (!force && Date.now() - last[name] < everyMs) return 'skipped';
  last[name] = Date.now();
  try {
    return (await fn()) ?? 'ok';
  } catch (err) {
    logger.error({ err, job: name }, 'job failed');
    return `error: ${err.message}`;
  }
}

export function tick({ force = false } = {}) {
  if (running) return running;
  running = (async () => ({
    sync: liveMode()
      ? await runJob('sync', env.SYNC_INTERVAL_SECONDS * 1000 - 5_000, () => runLockedSync(), force)
      : 'off (STREAMING_MODE=mock)',
    email: await runJob('email', 30_000, async () => `${await processOutbox()} sent/retried`, force),
    reminders: await runJob('reminders', 60_000, async () => `${await sendDueEventReminders()} reminders`, force),
    cleanup: await runJob('cleanup', 3_600_000, async () => {
      await pool.query('delete from sessions where expires_at < now()');
      await pool.query("delete from auth_tokens where expires_at < now() - interval '7 days'");
      await pool.query("delete from email_outbox where status = 'SENT' and sent_at < now() - interval '30 days'");
      await pool.query("delete from notifications where created_at < now() - interval '90 days'");
    }, force),
  }))().finally(() => { running = null; });
  return running;
}

let timer = null;
export function startJobs() {
  if (liveMode()) logger.info(`Streaming sync ON — every ${env.SYNC_INTERVAL_SECONDS}s`);
  else logger.info('Streaming sync is OFF (STREAMING_MODE=mock) — showing demo data only');
  const loop = async () => {
    await tick().catch((err) => logger.error({ err }, 'tick failed'));
    timer = setTimeout(loop, 60_000 + Math.random() * 3_000);
    timer.unref?.();
  };
  timer = setTimeout(loop, 5_000);
  timer.unref?.();
}
export const stopJobs = () => clearTimeout(timer);
