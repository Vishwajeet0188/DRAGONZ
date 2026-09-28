import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { pool } from './db/index.js';
import { startJobs, stopJobs } from './services/jobs.js';

const app = createApp();
const server = app.listen(env.PORT, () => logger.info(`🐉 Dragonz Central API listening on :${env.PORT} (${env.NODE_ENV})`));
startJobs();


function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  stopJobs();
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
