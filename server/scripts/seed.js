// Development seed data. Idempotent: skips content if members already exist (use --reset to wipe content first).
// ⚠ All members, handles, videos and streams below are DEMO placeholders — replace them from the admin panel.
import { eq, sql } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/index.js';
import { hashPassword, randomToken } from '../src/lib/crypto.js';

const s = schema;
const days = (n) => new Date(Date.now() - n * 86400_000);
const hoursFromNow = (n) => new Date(Date.now() + n * 3600_000);

const MEMBERS = [
  { displayName: 'Dragon Navy', rank: 'Boss', rankOrder: 1, rpCharacter: 'Vikram "Navy" Rathore', tagline: 'Built the Dragonz from one garage and a promise.', accentColor: '#e11d2e', isCreator: true, isFeatured: true, joined: 900,
    bio: 'Founder and Boss of the Dragonz. Known for calm negotiations, sharp strategy and the longest-running RP storyline in the city. Streams story-driven GTA RP most nights.',
    platforms: [['YOUTUBE', '@dragonnavy', 'https://www.youtube.com/@dragonnavy', 184000, true], ['KICK', 'dragonnavy', 'https://kick.com/dragonnavy', 52000], ['INSTAGRAM', 'dragon.navy', 'https://www.instagram.com/dragon.navy']] },
  { displayName: 'Dragon Blaze', rank: 'Underboss', rankOrder: 2, rpCharacter: 'Arjun "Blaze" Mehra', tagline: 'Fast cars, faster decisions.', accentColor: '#f97316', isCreator: true, isFeatured: true, joined: 820,
    bio: 'Second in command and the crew’s getaway specialist. Chaos on the streets, precision in the plan.',
    platforms: [['YOUTUBE', '@dragonblaze', 'https://www.youtube.com/@dragonblaze', 96000, true], ['TWITCH', 'dragonblaze', 'https://www.twitch.tv/dragonblaze', 31000]] },
  { displayName: 'Dragon Viper', rank: 'Enforcer', rankOrder: 3, rpCharacter: 'Kabir "Viper" Singh', tagline: 'Quiet. Patient. Never misses.', accentColor: '#22c55e', isCreator: true, isFeatured: true, joined: 700,
    bio: 'The Dragonz enforcer. Handles the problems nobody else wants to handle.',
    platforms: [['KICK', 'dragonviper', 'https://kick.com/dragonviper', 44000, true], ['YOUTUBE', '@dragonviper', 'https://www.youtube.com/@dragonviper', 38000], ['INSTAGRAM', 'dragon.viper', 'https://www.instagram.com/dragon.viper']] },
  { displayName: 'Dragon Ember', rank: 'Captain', rankOrder: 4, rpCharacter: 'Meera "Ember" Kapoor', tagline: 'Every heist needs a mastermind.', accentColor: '#ec4899', isCreator: true, isFeatured: true, joined: 640,
    bio: 'Planner, hacker and the reason the Dragonz have never been caught on camera. Streams heists and community events.',
    platforms: [['TWITCH', 'dragonember', 'https://www.twitch.tv/dragonember', 27000, true], ['YOUTUBE', '@dragonember', 'https://www.youtube.com/@dragonember', 21000]] },
  { displayName: 'Dragon Ghost', rank: 'Captain', rankOrder: 4, rpCharacter: 'Rehan "Ghost" Qureshi', tagline: 'You won’t see him coming.', accentColor: '#94a3b8', isCreator: true, isFeatured: false, joined: 520,
    bio: 'Stealth specialist and the crew’s eyes on the city.',
    platforms: [['YOUTUBE', '@dragonghost', 'https://www.youtube.com/@dragonghost', 12500, true]] },
  { displayName: 'Dragon Titan', rank: 'Soldier', rankOrder: 5, rpCharacter: 'Dev "Titan" Malhotra', tagline: 'Hold the line.', accentColor: '#3b82f6', isCreator: false, isFeatured: true, joined: 480,
    bio: 'Muscle of the Dragonz. First through the door, last to leave.',
    platforms: [['INSTAGRAM', 'dragon.titan', 'https://www.instagram.com/dragon.titan']] },
  { displayName: 'Dragon Raven', rank: 'Soldier', rankOrder: 5, rpCharacter: 'Aisha "Raven" Khan', tagline: 'Information is the real currency.', accentColor: '#a855f7', isCreator: true, isFeatured: false, joined: 410,
    bio: 'Runs the Dragonz intel network. Knows every rumour in the city before it spreads.',
    platforms: [['KICK', 'dragonraven', 'https://kick.com/dragonraven', 8900, true], ['INSTAGRAM', 'dragon.raven', 'https://www.instagram.com/dragon.raven']] },
  { displayName: 'Dragon Storm', rank: 'Soldier', rankOrder: 5, rpCharacter: 'Yash "Storm" Chauhan', tagline: 'Loud entrance, clean exit.', accentColor: '#06b6d4', isCreator: false, isFeatured: false, joined: 350,
    bio: 'Mechanic by day, wheelman by night.', platforms: [] },
  { displayName: 'Dragon Kaizen', rank: 'Soldier', rankOrder: 5, rpCharacter: 'Kenji "Kaizen" Rao', tagline: 'One percent better every day.', accentColor: '#eab308', isCreator: true, isFeatured: false, joined: 300,
    bio: 'Tournament grinder and the crew’s best shooter.',
    platforms: [['TWITCH', 'dragonkaizen', 'https://www.twitch.tv/dragonkaizen', 5400, true], ['YOUTUBE', '@dragonkaizen', 'https://www.youtube.com/@dragonkaizen', 3100]] },
  { displayName: 'Dragon Shadow', rank: 'Prospect', rankOrder: 6, rpCharacter: 'Nikhil "Shadow" Verma', tagline: 'Earning the wings.', accentColor: '#64748b', isCreator: false, isFeatured: false, joined: 60,
    bio: 'Newest prospect. Eager, loyal, and still learning the rules.', platforms: [] },
  { displayName: 'Dragon Nova', rank: 'Prospect', rankOrder: 6, rpCharacter: 'Zara "Nova" Fernandes', tagline: 'Rising fast.', accentColor: '#f43f5e', isCreator: true, isFeatured: false, joined: 45,
    bio: 'Street racer turned prospect. Streams racing and chill RP.',
    platforms: [['KICK', 'dragonnova', 'https://kick.com/dragonnova', 1800, true]] },
  { displayName: 'Dragon Rukh', rank: 'Alumni', rankOrder: 50, rpCharacter: 'Farhan "Rukh" Ali', tagline: 'Once a Dragon, always a Dragon.', accentColor: '#78716c', isCreator: false, isFeatured: false, joined: 1000, status: 'ALUMNI',
    bio: 'Original member, now retired from the streets.', platforms: [] },
];

const VIDEO_TITLES = [
  'We pulled off the biggest heist in city history', 'Dragonz vs Police — 40 minute chase', 'The meeting that changed everything',
  'Building the new Dragonz HQ', 'Funniest moments of the week', 'Turf war: the final night', 'I got arrested… again',
  'Initiation day for the new prospects', 'Street race tournament finals', 'Story recap: Season 3',
];

async function upsertAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@dragonz.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 10) throw new Error('Set SEED_ADMIN_PASSWORD (min 10 chars) in .env');
  const [existing] = await db.select().from(s.users).where(eq(s.users.email, email));
  if (existing) return existing;
  const [u] = await db.insert(s.users).values({
    email, passwordHash: await hashPassword(password), displayName: 'Dragonz Admin', role: 'SUPER_ADMIN', emailVerifiedAt: new Date(),
  }).returning();
  await db.insert(s.notificationPreferences).values({ userId: u.id, unsubscribeToken: randomToken(24) });
  console.log(`✔ super-admin created: ${email}`);
  return u;
}

async function main() {
  if (process.argv.includes('--reset')) {
    await db.execute(sql`truncate members, videos, live_streams, milestones, achievements, news_posts, events, community_submissions, platform_accounts, audit_logs cascade`);
    console.log('✔ content tables truncated');
  }
  const admin = await upsertAdmin();

  const [{ n }] = await db.select({ n: sql`count(*)::int` }).from(s.members);
  if (n > 0) {
    console.log('ℹ members already exist — skipping content seed (use --reset to reseed)');
    return;
  }

  const memberRows = [];
  for (const m of MEMBERS) {
    const slug = m.displayName.toLowerCase().replace(/\s+/g, '-');
    const [row] = await db.insert(s.members).values({
      slug, displayName: m.displayName, rank: m.rank, rankOrder: m.rankOrder, rpCharacter: m.rpCharacter, tagline: m.tagline,
      bio: m.bio, accentColor: m.accentColor, isCreator: m.isCreator, isFeatured: m.isFeatured, status: m.status ?? 'ACTIVE', joinedAt: days(m.joined),
    }).returning();
    const plats = [];
    for (const [platform, handle, url, followerCount = null, isPrimary = false] of m.platforms) {
      const [p] = await db.insert(s.platformAccounts).values({ memberId: row.id, platform, handle, url, followerCount, isPrimary }).returning();
      plats.push(p);
    }
    memberRows.push({ ...row, plats, src: m });
  }
  console.log(`✔ ${memberRows.length} members`);

  // Videos (demo, source MOCK; link to channel pages rather than invented video ids)
  let vi = 0;
  const creators = memberRows.filter((m) => m.isCreator && m.plats.length);
  for (const m of creators) {
    const videoPlats = m.plats.filter((p) => ['YOUTUBE', 'KICK', 'TWITCH'].includes(p.platform));
    for (let i = 0; i < 3; i++) {
      const p = videoPlats[i % videoPlats.length];
      if (!p) continue;
      await db.insert(s.videos).values({
        memberId: m.id, platformAccountId: p.id, platform: p.platform, externalId: `demo-${m.slug}-${i}`,
        title: VIDEO_TITLES[vi++ % VIDEO_TITLES.length], url: p.url, durationSec: 600 + ((vi * 377) % 3000),
        viewCount: 2000 + ((vi * 7919) % 90000), publishedAt: days(i * 4 + (vi % 5)), isFeatured: i === 0 && m.isFeatured, source: 'MOCK',
      });
    }
  }
  console.log('✔ videos');

  // Live streams (demo)
  const liveSet = [['dragon-navy', 'YOUTUBE', 'Dragonz Night Ops — the war council meets', 2400], ['dragon-viper', 'KICK', 'Enforcer duty | chill RP & chaos', 860], ['dragon-ember', 'TWITCH', 'Planning the casino job 🎲', 540]];
  for (const [slug, platform, title, viewers] of liveSet) {
    const m = memberRows.find((x) => x.slug === slug);
    const p = m.plats.find((x) => x.platform === platform);
    await db.insert(s.liveStreams).values({ memberId: m.id, platformAccountId: p.id, platform, externalId: `demo-live-${slug}`, title, url: p.url, viewerCount: viewers, startedAt: new Date(Date.now() - 80 * 60_000), source: 'MOCK' });
  }
  console.log('✔ live streams');

  const bySlug = (slug) => memberRows.find((m) => m.slug === slug).id;

  await db.insert(s.milestones).values([
    { memberId: bySlug('dragon-navy'), platform: 'YOUTUBE', type: 'SUBSCRIBERS', value: 100000, title: '100K subscribers on YouTube', achievedAt: days(40), isFeatured: true },
    { memberId: bySlug('dragon-blaze'), platform: 'YOUTUBE', type: 'SUBSCRIBERS', value: 50000, title: '50K subscribers on YouTube', achievedAt: days(75), isFeatured: true },
    { memberId: bySlug('dragon-viper'), platform: 'KICK', type: 'FOLLOWERS', value: 10000, title: '10K followers on Kick', achievedAt: days(20), isFeatured: true },
    { memberId: bySlug('dragon-ember'), platform: 'TWITCH', type: 'FOLLOWERS', value: 10000, title: 'Twitch Partner & 10K followers', achievedAt: days(12) },
    { memberId: bySlug('dragon-ghost'), platform: 'YOUTUBE', type: 'SUBSCRIBERS', value: 10000, title: '10K subscribers on YouTube', achievedAt: days(8) },
    { memberId: bySlug('dragon-kaizen'), platform: 'TWITCH', type: 'FOLLOWERS', value: 1000, title: 'First 1K followers', achievedAt: days(5) },
  ]);

  await db.insert(s.achievements).values([
    { title: 'City Street Race Championship — 1st place', category: 'TOURNAMENT', achievedAt: days(30), memberId: bySlug('dragon-blaze'), isFeatured: true, description: 'Blaze took the crown in the season finale, winning 4 of 5 heats.' },
    { title: 'The Pacific Standard job', category: 'MOMENT', achievedAt: days(95), isFeatured: true, description: 'A 6-hour coordinated heist streamed across four POVs. Still the most-watched night in Dragonz history.' },
    { title: 'Dragonz founded', category: 'HISTORY', achievedAt: days(1000), isFeatured: true, description: 'Navy, Rukh and Blaze form the Dragonz in a Sandy Shores garage.' },
    { title: 'Charity stream raises ₹2.5 lakh', category: 'EVENT', achievedAt: days(150), isFeatured: true, description: 'A 24-hour community charity marathon across every Dragonz channel.' },
    { title: 'Turf war victory — Grove Street', category: 'MOMENT', achievedAt: days(210), memberId: bySlug('dragon-viper') },
  ]);

  await db.insert(s.newsPosts).values([
    { slug: 'recruitment-season-4-open', title: 'Recruitment for Season 4 is open', excerpt: 'We are looking for committed RPers who value story over chaos. Applications close soon.', content: '## Recruitment is open\n\nThe Dragonz are expanding…', category: 'RECRUITMENT', status: 'PUBLISHED', isPinned: true, publishedAt: days(1), authorId: admin.id },
    { slug: 'dragonz-central-launch', title: 'Welcome to Dragonz Central', excerpt: 'One home for every Dragonz member, stream, video and moment.', content: 'Dragonz Central is live…', category: 'ANNOUNCEMENT', status: 'PUBLISHED', publishedAt: days(3), authorId: admin.id },
    { slug: 'server-maintenance-weekend', title: 'Server maintenance this weekend', excerpt: 'Expect downtime on Sunday morning while the city gets an upgrade.', content: 'Details…', category: 'NOTICE', status: 'PUBLISHED', publishedAt: days(6), authorId: admin.id },
  ]);

  await db.insert(s.events).values([
    { slug: 'dragonz-night-race-4', title: 'Dragonz Night Race #4', description: 'Open street race through the city. Top 3 get Dragonz custom liveries.', category: 'Race', startsAt: hoursFromNow(52), status: 'SCHEDULED', organizerMemberId: bySlug('dragon-blaze'), createdById: admin.id },
    { slug: 'community-q-and-a', title: 'Community Q&A with Navy', description: 'Ask the Boss anything — lore, plans and what is next for the Dragonz.', category: 'Community', startsAt: hoursFromNow(120), status: 'SCHEDULED', organizerMemberId: bySlug('dragon-navy'), createdById: admin.id },
    { slug: 'season-4-premiere', title: 'Season 4 Premiere', description: 'All Dragonz creators live at the same time for the season opener.', category: 'Premiere', startsAt: hoursFromNow(24 * 9), status: 'SCHEDULED', createdById: admin.id },
  ]);

  // A demo community user + approved submissions
  const [fan] = await db.insert(s.users).values({ email: 'fan@dragonz.local', passwordHash: await hashPassword(randomToken(16)), displayName: 'DragonFan99', emailVerifiedAt: new Date() }).returning();
  await db.insert(s.notificationPreferences).values({ userId: fan.id, unsubscribeToken: randomToken(24) });
  await db.insert(s.communitySubmissions).values([
    { authorId: fan.id, featuredMemberId: bySlug('dragon-navy'), type: 'CLIP', title: 'Navy’s speech before the war', status: 'FEATURED', moderatedById: admin.id, moderatedAt: days(2) },
    { authorId: fan.id, featuredMemberId: bySlug('dragon-blaze'), type: 'EDIT', title: 'Blaze — Season 3 montage', status: 'APPROVED', moderatedById: admin.id, moderatedAt: days(4) },
    { authorId: fan.id, featuredMemberId: bySlug('dragon-ember'), type: 'FAN_ART', title: 'Ember fan art', status: 'APPROVED', moderatedById: admin.id, moderatedAt: days(6) },
    { authorId: fan.id, type: 'MEME', title: 'When the plan actually works', status: 'PENDING' },
  ]);
  console.log('✔ milestones, achievements, news, events, community');
}

main()
  .then(() => console.log('🐉 seed complete'))
  .catch((err) => { console.error('✖ seed failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
