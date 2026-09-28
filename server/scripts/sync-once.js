// Runs one YouTube/Kick sync immediately and prints what happened — handy for testing your API keys.
//   npm run sync:once
import { pool } from '../src/db/index.js';
import { providers, runLockedSync } from '../src/integrations/index.js';
import { loadStatus } from '../src/integrations/sync.service.js';

try {
  for (const p of providers) console.log(`${p.label}: ${p.configured ? 'configured ✔' : 'not configured (add credentials to server/.env)'}`);
  const summary = await runLockedSync({ force: true });
  console.log('\nResult:', JSON.stringify(summary, null, 2));
  const status = await loadStatus();
  for (const [k, v] of Object.entries(status.providers ?? {})) {
    console.log(`\n${k}: ${v.ok ? '✔ ok' : '✖ ' + (v.error ?? 'not run')}` +
      (v.accounts != null ? ` · accounts ${v.accounts}` : '') + (v.liveNow != null ? ` · live ${v.liveNow}` : '') +
      (v.videosSeen != null ? ` · videos ${v.videosSeen}` : '') + (v.accountErrors ? ` · ${v.accountErrors} account error(s) — see Admin → Live integrations` : '') +
      (v.unitsToday != null ? ` · YouTube units today ${v.unitsToday}` : ''));
  }
} catch (err) {
  console.error('✖ sync failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
