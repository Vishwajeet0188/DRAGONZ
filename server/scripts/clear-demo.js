// Removes the demo content created by `npm run db:seed` so only real data remains.
// Keeps: your admin account, any members/content you created yourself, all settings.
//   npm run demo:clear
import { inArray, eq, or } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/index.js';

const s = schema;
const DEMO_MEMBER_SLUGS = ['dragon-navy', 'dragon-blaze', 'dragon-viper', 'dragon-ember', 'dragon-ghost', 'dragon-titan', 'dragon-raven', 'dragon-storm', 'dragon-kaizen', 'dragon-shadow', 'dragon-nova', 'dragon-rukh'];
const DEMO_NEWS = ['recruitment-season-4-open', 'dragonz-central-launch', 'server-maintenance-weekend'];
const DEMO_EVENTS = ['dragonz-night-race-4', 'community-q-and-a', 'season-4-premiere'];
const DEMO_ACHIEVEMENTS = ['City Street Race Championship — 1st place', 'The Pacific Standard job', 'Dragonz founded', 'Charity stream raises ₹2.5 lakh', 'Turf war victory — Grove Street'];

try {
  await db.transaction(async (tx) => {
    const v = await tx.delete(s.videos).where(eq(s.videos.source, 'MOCK')).returning({ id: s.videos.id });
    const l = await tx.delete(s.liveStreams).where(eq(s.liveStreams.source, 'MOCK')).returning({ id: s.liveStreams.id });
    const a = await tx.delete(s.achievements).where(inArray(s.achievements.title, DEMO_ACHIEVEMENTS)).returning({ id: s.achievements.id });
    const n = await tx.delete(s.newsPosts).where(inArray(s.newsPosts.slug, DEMO_NEWS)).returning({ id: s.newsPosts.id });
    const e = await tx.delete(s.events).where(inArray(s.events.slug, DEMO_EVENTS)).returning({ id: s.events.id });
    const u = await tx.delete(s.users).where(eq(s.users.email, 'fan@dragonz.local')).returning({ id: s.users.id }); // demo fan + their submissions
    // Demo members (cascades their platform links, milestones, follows). Members you edited keep their data
    // only if you changed their slug — otherwise they are treated as demo.
    const m = await tx.delete(s.members).where(or(inArray(s.members.slug, DEMO_MEMBER_SLUGS))).returning({ id: s.members.id });
    console.log(`✔ removed: ${m.length} demo members, ${v.length} demo videos, ${l.length} demo streams, ${a.length} achievements, ${n.length} news, ${e.length} events, ${u.length} demo users`);
  });
} catch (err) {
  console.error('✖ clear failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
