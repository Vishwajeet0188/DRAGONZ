// Phase 2 + 4 API tests: uploads, community, news/events, supporters, search, cron, analytics, settings.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { sql, eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, pool, schema } from '../src/db/index.js';
import { hashPassword } from '../src/lib/crypto.js';

const app = createApp();
const PASSWORD = 'Correct-Horse-9-Battery';
let png;
let member;

async function client() {
  const agent = request.agent(app);
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const send = (m, u, b) => agent[m](u).set('X-CSRF-Token', token).send(b);
  return {
    agent, token, get: (u) => agent.get(u),
    post: (u, b) => send('post', u, b), patch: (u, b) => send('patch', u, b), put: (u, b) => send('put', u, b), del: (u) => send('delete', u),
    multipart: (u) => agent.post(u).set('X-CSRF-Token', token),
  };
}
async function makeUser(email, role = 'USER', verified = true) {
  await db.insert(schema.users).values({ email, passwordHash: await hashPassword(PASSWORD), displayName: email.split('@')[0], role, emailVerifiedAt: verified ? new Date() : null });
}
async function as(email) {
  const c = await client();
  const r = await c.post('/api/auth/login', { email, password: PASSWORD });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}

before(async () => {
  await db.execute(sql`truncate users, members, email_outbox, audit_logs, news_posts, events, community_submissions, page_views_daily, site_settings cascade`);
  for (const [e, r] of [['p-super@test.dev', 'SUPER_ADMIN'], ['p-admin@test.dev', 'ADMIN'], ['p-mod@test.dev', 'MODERATOR'], ['p-cm@test.dev', 'CONTENT_MANAGER'], ['p-fan@test.dev', 'USER'], ['p-fan2@test.dev', 'USER']]) await makeUser(e, r);
  await makeUser('p-unverified@test.dev', 'USER', false);
  [member] = await db.insert(schema.members).values({ slug: 'dragon-nav', displayName: 'Dragon Nav', rank: 'Leader', isCreator: true }).returning();
  png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#f5b50a' } }).png().toBuffer();
});
after(() => pool.end());

describe('uploads', () => {
  test('admin image upload is re-encoded to webp; non-images rejected; fans forbidden', async () => {
    const admin = await as('p-admin@test.dev');
    const ok = await admin.multipart('/api/admin/uploads').field('kind', 'news').attach('file', png, 'x.png');
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.match(ok.body.data.url, /\/media\/news\/.+\.webp$/);
    const fake = await admin.multipart('/api/admin/uploads').field('kind', 'news').attach('file', Buffer.from('<?php echo 1; ?>'), { filename: 'x.png', contentType: 'image/png' });
    assert.ok([400, 415, 422].includes(fake.status), `got ${fake.status}`);
    const fan = await as('p-fan@test.dev');
    assert.equal((await fan.multipart('/api/admin/uploads').field('kind', 'news').attach('file', png, 'x.png')).status, 403);
  });
});

describe('community', () => {
  let subId;
  test('unverified users cannot submit; off-list links rejected', async () => {
    const u = await as('p-unverified@test.dev');
    assert.equal((await u.multipart('/api/community').field('type', 'CLIP').field('title', 'My clip').field('externalUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')).status, 403);
    const fan = await as('p-fan@test.dev');
    assert.equal((await fan.multipart('/api/community').field('type', 'CLIP').field('title', 'Bad link').field('externalUrl', 'https://evil.example/x')).status, 422);
  });

  test('submit → pending (hidden) → moderator approves → public; IDOR delete blocked', async () => {
    const fan = await as('p-fan@test.dev');
    const r = await fan.multipart('/api/community').field('type', 'FAN_ART').field('title', 'Dragon art').attach('images', png, 'a.png');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    subId = r.body.data.id;
    assert.equal(r.body.data.status, 'PENDING');
    assert.equal((await request(app).get('/api/community')).body.data.length, 0);

    const other = await as('p-fan2@test.dev');
    assert.equal((await other.del(`/api/community/${subId}`)).status, 404);
    assert.equal((await other.patch(`/api/admin/community/${subId}`, { status: 'APPROVED' })).status, 403);

    const mod = await as('p-mod@test.dev');
    const queue = await mod.get('/api/admin/community?status=PENDING');
    assert.equal(queue.body.data[0].id, subId);
    assert.equal((await mod.patch(`/api/admin/community/${subId}`, { status: 'APPROVED' })).status, 200);
    const pub = await request(app).get('/api/community');
    assert.equal(pub.body.data[0].images.length, 1);
    assert.ok(!('authorEmail' in pub.body.data[0]), 'public list must not leak emails');
    const [n] = await db.select().from(schema.notifications).where(eq(schema.notifications.url, '/community'));
    assert.match(n.title, /is live/);
  });
});

describe('news + events', () => {
  test('content manager publishes news; drafts are not public; moderators cannot write', async () => {
    const cm = await as('p-cm@test.dev');
    const draft = await cm.post('/api/admin/news', { title: 'Secret draft', content: 'x' });
    assert.equal(draft.status, 201);
    const pub = await cm.post('/api/admin/news', { title: 'Recruitment open', content: '**Join** us', status: 'PUBLISHED' });
    assert.equal(pub.status, 201);
    const list = await request(app).get('/api/news');
    assert.deepEqual(list.body.data.map((p) => p.title), ['Recruitment open']);
    assert.equal((await request(app).get(`/api/news/${draft.body.data.slug}`)).status, 404);
    const mod = await as('p-mod@test.dev');
    assert.equal((await mod.post('/api/admin/news', { title: 'Nope', content: 'x' })).status, 403);
  });

  test('event CRUD, validation, reminder toggle and ICS export', async () => {
    const cm = await as('p-cm@test.dev');
    const startsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    assert.equal((await cm.post('/api/admin/events', { title: 'Bad', description: 'x', category: 'Race', startsAt, endsAt: new Date(Date.now()).toISOString() })).status, 422);
    const ev = await cm.post('/api/admin/events', { title: 'Summer Cup', description: 'Race night', category: 'Race', startsAt, organizerMemberId: member.id });
    assert.equal(ev.status, 201, JSON.stringify(ev.body));
    const slug = ev.body.data.slug;
    const fan = await as('p-fan@test.dev');
    assert.equal((await fan.put(`/api/events/${slug}/reminder`)).status, 200);
    assert.equal((await fan.get(`/api/events/${slug}`)).body.data.viewer.reminder, true);
    const ics = await request(app).get(`/api/events/${slug}/ics`);
    assert.equal(ics.status, 200);
    assert.match(ics.headers['content-type'], /text\/calendar/);
    assert.match(ics.text, /BEGIN:VEVENT[\s\S]*SUMMARY:Summer Cup/);
    const admin = (await cm.get('/api/admin/events')).body.data[0];
    assert.equal(admin.reminders, 1);
  });
});

describe('supporters', () => {
  test('claim → only owner sees it → admin verifies → public if opted in', async () => {
    const fan = await as('p-fan@test.dev');
    const c = await fan.post('/api/me/supporters', { memberSlug: 'dragon-nav', tier: 'Dragon Tier', isPublic: true });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    assert.equal((await request(app).get('/api/members/dragon-nav/supporters')).body.data.length, 0);
    const other = await as('p-fan2@test.dev');
    assert.equal((await other.del(`/api/me/supporters/${c.body.data.id}`)).status, 404);
    assert.equal((await other.get('/api/me/supporters')).body.data.length, 0);
    const admin = await as('p-admin@test.dev');
    assert.equal((await admin.patch(`/api/admin/supporters/${c.body.data.id}`, { status: 'VERIFIED', tier: 'Dragon Tier' })).status, 200);
    const pub = await request(app).get('/api/members/dragon-nav/supporters');
    assert.equal(pub.body.data.length, 1);
    assert.ok(!JSON.stringify(pub.body).includes('@'), 'no emails in public supporter list');
  });
});

describe('videos admin', () => {
  test('manual YouTube video gets a thumbnail; deleting a synced video leaves a tombstone the sync cannot revive', async () => {
    const admin = await as('p-admin@test.dev');
    const m = await admin.post('/api/admin/videos', { memberId: member.id, platform: 'YOUTUBE', title: 'Official song', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', publishedAt: new Date().toISOString() });
    assert.equal(m.status, 201, JSON.stringify(m.body));
    assert.equal(m.body.data.thumbnailUrl, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    const [synced] = await db.insert(schema.videos).values({ memberId: member.id, platform: 'YOUTUBE', externalId: 'SYNCED00001', title: 'Synced one', url: 'https://www.youtube.com/watch?v=SYNCED00001', publishedAt: new Date(), source: 'SYNC' }).returning();
    assert.equal((await admin.del(`/api/admin/videos/${synced.id}`)).status, 204);
    const list = await admin.get('/api/admin/videos');
    assert.ok(!list.body.data.some((v) => v.id === synced.id), 'deleted video gone from admin list');
    // what the sync does on the next run: upsert on (platform, externalId) — must not resurrect it
    await db.insert(schema.videos).values({ memberId: member.id, platform: 'YOUTUBE', externalId: 'SYNCED00001', title: 'Synced one (renamed)', url: synced.url, publishedAt: new Date(), source: 'SYNC' })
      .onConflictDoUpdate({ target: [schema.videos.platform, schema.videos.externalId], set: { title: 'Synced one (renamed)' } });
    const pub = await request(app).get('/api/videos');
    assert.ok(!pub.body.data.some((v) => v.id === synced.id));
    assert.equal((await admin.del(`/api/admin/videos/${synced.id}`)).status, 404);
    // starred videos come first on the public Videos page ("latest" sort)
    const [older] = await db.insert(schema.videos).values({ memberId: member.id, platform: 'YOUTUBE', title: 'Old but starred', url: 'https://www.youtube.com/watch?v=OLDSTARRED1', publishedAt: new Date(Date.now() - 30 * 86_400_000), isFeatured: true }).returning();
    const first = (await request(app).get('/api/videos')).body.data[0];
    assert.equal(first.id, older.id);
  });
});

describe('search, cron, analytics, settings', () => {
  test('search finds members and published news only', async () => {
    const r = await request(app).get('/api/search?q=re');
    assert.equal(r.status, 200);
    const s = await request(app).get('/api/search?q=dragon');
    assert.ok(s.body.data.members.some((m) => m.slug === 'dragon-nav'));
    assert.ok(!(await request(app).get('/api/search?q=secret')).body.data.news.length);
  });

  test('cron tick requires the key', async () => {
    assert.equal((await request(app).get('/api/cron/tick?key=wrong')).status, 403);
    const ok = await request(app).get('/api/cron/tick').set('Authorization', 'Bearer test-cron-secret-0123456789abcdef');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  test('page-view beacons count tracked paths, ignore bots/DNT/untracked; analytics needs permission', async () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130';
    const c = await client();
    const pv = (agent, path) => c.agent.post('/api/analytics/pv').set('X-CSRF-Token', c.token).set('User-Agent', agent).send({ path });
    assert.equal((await pv(ua, '/members/dragon-nav')).status, 204);
    await pv(ua, '/admin/secret');
    await pv('Googlebot/2.1', '/');
    await c.agent.post('/api/analytics/pv').set('X-CSRF-Token', c.token).set('User-Agent', ua).set('DNT', '1').send({ path: '/' });
    const rows = await db.select().from(schema.pageViewsDaily);
    assert.deepEqual(rows.map((r) => r.path), ['/members/dragon-nav']);
    const mod = await as('p-mod@test.dev');
    assert.equal((await mod.get('/api/admin/analytics')).status, 403);
    const admin = await as('p-admin@test.dev');
    const a = await admin.get('/api/admin/analytics?days=7');
    assert.equal(a.status, 200);
    assert.equal(a.body.data.topMembers[0].slug, 'dragon-nav');
  });

  test('settings: validated, super-admin only, reflected publicly', async () => {
    assert.equal((await (await as('p-admin@test.dev')).get('/api/admin/settings')).status, 403);
    const admin = await as('p-super@test.dev');
    const base = { discordUrl: 'https://discord.gg/drz', heroTagline: 'Hi', bannerText: 'Cup Saturday', bannerUrl: '/events', recruitmentOpen: true };
    assert.equal((await admin.put('/api/admin/settings', { ...base, discordUrl: 'https://evil.example' })).status, 422);
    assert.equal((await admin.put('/api/admin/settings', { ...base, bannerUrl: 'javascript:alert(1)' })).status, 422);
    assert.equal((await admin.put('/api/admin/settings', base)).status, 200);
    assert.equal((await request(app).get('/api/settings')).body.data.bannerText, 'Cup Saturday');
    const cm = await as('p-cm@test.dev');
    assert.equal((await cm.put('/api/admin/settings', base)).status, 403);
  });

  test('announcements reach every user in-app', async () => {
    const admin = await as('p-admin@test.dev');
    const r = await admin.post('/api/admin/announcements', { title: 'Hello Dragonz', body: 'Big news', url: '/news' });
    assert.equal(r.status, 201);
    assert.ok(r.body.data.inApp >= 6);
    const fan = await as('p-fan2@test.dev');
    const n = await fan.get('/api/me/notifications');
    assert.ok(n.body.data.some((x) => x.title === 'Hello Dragonz'));
  });
});
