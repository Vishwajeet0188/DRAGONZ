// Featured crew: weekly stream stats, goals, pins/exclusions, privacy, admin rules, stream end-time accuracy.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, pool, schema } from '../src/db/index.js';
import { hashPassword } from '../src/lib/crypto.js';
import { weekOf } from '../src/modules/fanzone/clips.js';
import { crewReport, invalidateCrew } from '../src/services/crew.js';
import { _internals } from '../src/integrations/sync.service.js';

const app = createApp();
const PASSWORD = 'Correct-Horse-9-Battery';
const H = 3_600_000, D = 24 * H;
// W = start of last week (always fully in the past). Streams go there so tests don't depend on today's weekday.
const W = weekOf(new Date(Date.now() - 7 * D)).start.getTime();
const at = (days, hours) => new Date(W + days * D + hours * H);

let A, B, C, Dx, ytAccount;
const member = async (slug, extra = {}) => (await db.insert(schema.members).values({ slug, displayName: slug, rank: 'Soldier', ...extra }).returning())[0];
const stream = (m, platform, externalId, s, e, extra = {}) => db.insert(schema.liveStreams)
  .values({ memberId: m.id, platform, externalId, title: 's', url: 'https://example.com', isLive: false, startedAt: s, endedAt: e, source: 'SYNC', ...extra }).returning();

before(async () => {
  await db.execute(sql`truncate users, members, live_streams, videos, site_settings, audit_logs cascade`);
  A = await member('multi', { rankOrder: 5 });
  B = await member('short', { rankOrder: 1 });
  C = await member('pinned', { isFeatured: true, rankOrder: 2 });
  Dx = await member('excluded', { rankOrder: 3 });
  [ytAccount] = await db.insert(schema.platformAccounts).values({ memberId: A.id, platform: 'YOUTUBE', handle: '@multi', url: 'https://youtube.com/@multi' }).returning();

  // A: multistream YouTube 18–21 + Kick 18–21:30 (overlap → one 3.5h session), then 2h and 1.5h → 3 streams, 7h, 3 days.
  await stream(A, 'YOUTUBE', 'yt-a1', at(1, 12.5), at(1, 15.5), { peakViewers: 120 });
  await stream(A, 'KICK', 'kick-a1', at(1, 12.5), at(1, 16));
  await stream(A, 'YOUTUBE', 'yt-a2', at(2, 12), at(2, 14));
  await stream(A, 'KICK', 'kick-a3', at(3, 10), at(3, 11.5));
  // A's YouTube replay of yt-a1 is not an "upload"; a normal video is.
  await db.insert(schema.videos).values([
    { memberId: A.id, platform: 'YOUTUBE', externalId: 'yt-a1', title: 'replay', url: 'https://youtube.com/watch?v=yt-a1', publishedAt: at(1, 16), source: 'SYNC' },
    { memberId: A.id, platform: 'YOUTUBE', externalId: 'vid-1', title: 'montage', url: 'https://youtube.com/watch?v=vid-1', publishedAt: at(2, 5), source: 'SYNC' },
  ]);
  // B: five 10-minute streams → none count (under 20 minutes).
  for (let i = 0; i < 5; i++) await stream(B, 'KICK', `kick-b${i}`, at(i, 10), at(i, 10 + 1 / 6));
  // D: qualifies, but an admin will exclude them.
  for (let i = 0; i < 3; i++) await stream(Dx, 'KICK', `kick-d${i}`, at(i, 8), at(i, 11));
  invalidateCrew();
});
after(() => pool.end());

describe('weekly stats', () => {
  test('multistream counted once, short streams ignored, replays are not uploads', async () => {
    invalidateCrew();
    const r = await crewReport({ now: W + 4 * D }); // "this week" = last week
    invalidateCrew();
    const a = r.rows.find((x) => x.member.slug === 'multi');
    assert.deepEqual({ streams: a.thisWeek.streams, hours: a.thisWeek.hours, days: a.thisWeek.days, uploads: a.thisWeek.uploads, peak: a.thisWeek.peakViewers },
      { streams: 3, hours: 7, days: 3, uploads: 1, peak: 120 });
    assert.equal(a.qualifiedThisWeek, true);
    const b = r.rows.find((x) => x.member.slug === 'short');
    assert.equal(b.thisWeek.streams, 0);
    assert.equal(b.qualifiedThisWeek, false);
    assert.deepEqual(b.needs, { streams: 3, hours: 6, days: 0, uploads: 0 });
  });
});

describe('featured crew', () => {
  let admin, mod;
  before(async () => {
    for (const [email, role] of [['crew-admin@test.dev', 'ADMIN'], ['crew-mod@test.dev', 'MODERATOR']]) {
      await db.insert(schema.users).values({ email, passwordHash: await hashPassword(PASSWORD), displayName: role, role, emailVerifiedAt: new Date() });
    }
    const login = async (email) => {
      const agent = request.agent(app);
      const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
      assert.equal((await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ email, password: PASSWORD })).status, 200);
      const send = (m, u, b) => agent[m](u).set('X-CSRF-Token', token).send(b);
      return { get: (u) => agent.get(u), put: (u, b) => send('put', u, b), patch: (u, b) => send('patch', u, b) };
    };
    admin = await login('crew-admin@test.dev');
    mod = await login('crew-mod@test.dev');
  });

  test('only moderators with member rights can change rules; validation enforced', async () => {
    assert.equal((await mod.get('/api/admin/crew')).status, 403);
    assert.equal((await admin.put('/api/admin/crew/rules', { minHours: -1 })).status, 422);
    assert.equal((await admin.patch(`/api/admin/crew/members/${Dx.id}`, { excluded: true })).status, 200);
    const r = (await admin.get('/api/admin/crew')).body.data;
    assert.equal(r.rules.minStreams, 3);
    assert.ok(r.members.find((m) => m.member.slug === 'excluded').excluded);
  });

  test('home shows pinned + members who hit the goals; Streamer of the Week leads', async () => {
    const home = (await request(app).get('/api/home')).body.data;
    const slugs = home.featuredMembers.map((m) => m.slug);
    assert.deepEqual(slugs, ['multi', 'pinned']);
    assert.equal(home.featuredMembers[0].featuredReason, 'EARNED_LAST_WEEK');
    assert.equal(home.featuredMembers[1].featuredReason, 'PINNED');
    assert.ok(home.featuredMembers[0].crew.isStreamerOfWeek);
    assert.equal(home.featuredCrew.goals.hours, 6);
    // the full crew list still has everyone
    assert.ok(home.crew.some((m) => m.slug === 'short'));
  });

  test('profile shows progress + badges; hidden numbers when progress is private', async () => {
    const p = (await request(app).get('/api/members/multi')).body.data;
    assert.equal(p.crew.lastWeek.hours, 7);
    assert.ok(p.crew.badges.some((b) => b.key === 'STREAMER_OF_WEEK'));
    assert.equal(p.crew.goals.streams, 3);
    assert.equal((await admin.put('/api/admin/crew/rules', { showProgress: false })).status, 200);
    const hidden = (await request(app).get('/api/members/multi')).body.data;
    assert.equal(hidden.crew.lastWeek, undefined);
    assert.ok(hidden.crew.badges.length > 0);
    assert.deepEqual((await request(app).get('/api/crew/week')).body.data.items, []);
    await admin.put('/api/admin/crew/rules', { showProgress: true });
  });

  test('MANUAL mode = pinned only; pin/unpin from the crew page', async () => {
    await admin.put('/api/admin/crew/rules', { mode: 'MANUAL' });
    assert.deepEqual((await request(app).get('/api/home')).body.data.featuredMembers.map((m) => m.slug), ['pinned']);
    await admin.patch(`/api/admin/crew/members/${C.id}`, { pinned: false });
    await admin.put('/api/admin/crew/rules', { mode: 'AUTO' });
    assert.deepEqual((await request(app).get('/api/home')).body.data.featuredMembers.map((m) => m.slug), ['multi']);
  });

  test('stricter goals remove members who no longer qualify — nobody else fills in', async () => {
    await admin.put('/api/admin/crew/rules', { minHours: 20 });
    const home = (await request(app).get('/api/home')).body.data;
    assert.deepEqual(home.featuredMembers, []);
    await admin.put('/api/admin/crew/rules', { minHours: 6 });
  });
});

describe('stream end times', () => {
  test('a stream noticed as ended late is capped at last-seen + 10 min', async () => {
    const lastSeen = new Date(Date.now() - 2 * H);
    const [row] = await db.insert(schema.liveStreams).values({ memberId: A.id, platformAccountId: ytAccount.id, platform: 'YOUTUBE', externalId: 'yt-late', title: 'late', url: 'https://x.test', isLive: true, startedAt: new Date(Date.now() - 4 * H), source: 'SYNC' }).returning();
    await db.execute(sql`update live_streams set updated_at = ${lastSeen.toISOString()}::timestamptz where id = ${row.id}`);
    await _internals.persistLive('YOUTUBE', { live: [], checkedAccountIds: [ytAccount.id] }, new Date());
    const [after1] = await db.select().from(schema.liveStreams).where(eq(schema.liveStreams.id, row.id));
    assert.equal(after1.isLive, false);
    assert.ok(Math.abs(new Date(after1.endedAt) - (lastSeen.getTime() + 10 * 60_000)) < 2000, String(after1.endedAt));
  });

  test('finished YouTube streams correct/insert exact times and never go live', async () => {
    const s = new Date(Date.now() - 5 * H), e = new Date(Date.now() - 3 * H);
    await _internals.persistPastStreams('YOUTUBE', [
      { memberId: A.id, accountId: ytAccount.id, externalId: 'yt-late', title: 'late', url: 'https://x.test', startedAt: s, endedAt: e },
      { memberId: A.id, accountId: ytAccount.id, externalId: 'yt-missed', title: 'missed', url: 'https://x.test', startedAt: s, endedAt: e },
    ]);
    const rows = await db.select().from(schema.liveStreams).where(sql`external_id in ('yt-late','yt-missed')`);
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.isLive, false);
      assert.equal(new Date(r.endedAt).getTime(), e.getTime());
    }
  });
});
