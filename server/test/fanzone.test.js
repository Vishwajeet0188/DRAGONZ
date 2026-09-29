// Fan Zone: polls, XP/badges, check-in, leaderboard, reactions & comments, recruitment, quotes, clip of the week, celebrations.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, pool, schema } from '../src/db/index.js';
import { hashPassword } from '../src/lib/crypto.js';
import { weekOf, decideClipWinners } from '../src/modules/fanzone/clips.js';
import { celebrations } from '../src/modules/fanzone/fans.js';

const app = createApp();
const PASSWORD = 'Correct-Horse-9-Battery';

async function client() {
  const agent = request.agent(app);
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const send = (m, u, b) => agent[m](u).set('X-CSRF-Token', token).send(b);
  return { get: (u) => agent.get(u), post: (u, b) => send('post', u, b), patch: (u, b) => send('patch', u, b), put: (u, b) => send('put', u, b), del: (u) => send('delete', u) };
}
async function makeUser(email, role = 'USER', verified = true) {
  const [u] = await db.insert(schema.users).values({ email, passwordHash: await hashPassword(PASSWORD), displayName: email.split('@')[0], role, emailVerifiedAt: verified ? new Date() : null }).returning();
  return u;
}
async function as(email) {
  const c = await client();
  assert.equal((await c.post('/api/auth/login', { email, password: PASSWORD })).status, 200);
  return c;
}
const xpOf = async (email) => (await db.select({ xp: schema.users.xp }).from(schema.users).where(eq(schema.users.email, email)))[0].xp;
const badgesOf = async (id) => (await db.select().from(schema.userBadges).where(eq(schema.userBadges.userId, id))).map((b) => b.badge).sort();

let fan, fan2, member, news;
before(async () => {
  await db.execute(sql`truncate users, members, news_posts, events, community_submissions, quotes, crew_applications, polls, site_settings, xp_events, audit_logs, email_outbox cascade`);
  await makeUser('fz-admin@test.dev', 'ADMIN');
  await makeUser('fz-mod@test.dev', 'MODERATOR');
  await makeUser('fz-cm@test.dev', 'CONTENT_MANAGER');
  fan = await makeUser('fz-fan@test.dev');
  fan2 = await makeUser('fz-fan2@test.dev');
  await makeUser('fz-unverified@test.dev', 'USER', false);
  [member] = await db.insert(schema.members).values({ slug: 'dragon-nav', displayName: 'Dragon Nav', rank: 'Leader', joinedAt: new Date(Date.now() - 2 * 365.25 * 86_400_000) }).returning();
  [news] = await db.insert(schema.newsPosts).values({ title: 'Season 4', slug: 'season-4', content: 'x', status: 'PUBLISHED', publishedAt: new Date() }).returning();
});
after(() => pool.end());

describe('polls', () => {
  let pollId;
  test('staff create polls; validation + permissions enforced', async () => {
    const mod = await as('fz-mod@test.dev');
    assert.equal((await mod.post('/api/admin/polls', { question: 'Who wins?', options: ['A', 'B'] })).status, 403);
    const cm = await as('fz-cm@test.dev');
    assert.equal((await cm.post('/api/admin/polls', { question: 'Who wins tonight?', options: ['Only one'] })).status, 422);
    assert.equal((await cm.post('/api/admin/polls', { question: 'Who wins tonight?', options: ['Nav', 'nav'] })).status, 422);
    const r = await cm.post('/api/admin/polls', { question: 'Who wins tonight’s race?', options: ['Dragon Nav', 'Dragon Blaze', 'Nobody'], isPinned: true, memberId: member.id });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    pollId = r.body.data.id;
  });

  test('results hidden until you vote; one vote per fan; XP + badge', async () => {
    const f = await as('fz-fan@test.dev');
    const featured = (await f.get('/api/polls/featured')).body.data;
    assert.equal(featured.id, pollId);
    assert.equal(featured.options[0].votes, null, 'counts hidden before voting');
    const r = await f.post(`/api/polls/${pollId}/vote`, { optionId: featured.options[1].id });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.options[1].votes, 1);
    assert.equal(r.body.data.myVote, featured.options[1].id);
    assert.equal((await f.post(`/api/polls/${pollId}/vote`, { optionId: featured.options[0].id })).status, 400, 'second vote rejected');
    assert.equal(await xpOf('fz-fan@test.dev'), 5);
    assert.ok((await badgesOf(fan.id)).includes('FIRST_VOTE'));
    // an option from another poll is rejected
    assert.equal((await f.post(`/api/polls/${pollId}/vote`, { optionId: '00000000-0000-0000-0000-000000000000' })).status, 400);
  });

  test('closed polls reject votes and show results to everyone', async () => {
    const admin = await as('fz-admin@test.dev');
    assert.equal((await admin.patch(`/api/admin/polls/${pollId}`, { status: 'CLOSED' })).status, 200);
    const f2 = await as('fz-fan2@test.dev');
    const closed = (await f2.get('/api/polls?status=closed')).body.data[0];
    assert.equal(closed.isOpen, false);
    assert.equal(closed.totalVotes, 1);
    assert.equal(closed.options[1].votes, 1);
    assert.equal((await f2.post(`/api/polls/${pollId}/vote`, { optionId: closed.options[0].id })).status, 400);
  });
});

describe('xp, check-in, leaderboard', () => {
  test('daily check-in pays once per day and builds a streak', async () => {
    const f2 = await as('fz-fan2@test.dev');
    const a = (await f2.post('/api/me/checkin', {})).body.data;
    const b = (await f2.post('/api/me/checkin', {})).body.data;
    assert.deepEqual([a.streak, a.gained, b.gained], [1, 5, 0]);
    // simulate: last check-in was yesterday with a 6-day streak → today is day 7 → bonus
    const yesterday = new Date(Date.now() + 5.5 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
    await db.update(schema.users).set({ lastCheckinDay: yesterday, checkinStreak: 6 }).where(eq(schema.users.id, fan2.id));
    const c = (await f2.post('/api/me/checkin', {})).body.data;
    assert.equal(c.streak, 7);
    assert.equal(c.gained, 5 + 25);
    assert.ok((await badgesOf(fan2.id)).includes('STREAK_7'));
    const p = (await f2.get('/api/me/progress')).body.data;
    assert.equal(p.streak, 7);
    assert.equal(p.name, 'Hatchling');
    assert.ok(p.badges.find((x) => x.key === 'STREAK_7').earned);
  });

  test('leaderboard is public-safe and respects the opt-out', async () => {
    const lb = (await request(app).get('/api/fans/leaderboard')).body.data;
    assert.ok(lb.length >= 2);
    assert.ok(!JSON.stringify(lb).includes('@test.dev'), 'no emails');
    assert.ok(!('id' in lb[0]), 'no user ids');
    const f = await as('fz-fan@test.dev');
    assert.equal((await f.patch('/api/users/me', { showOnLeaderboard: false })).status, 200);
    const lb2 = (await request(app).get('/api/fans/leaderboard')).body.data;
    assert.ok(!lb2.some((r) => r.displayName === 'fz-fan'));
  });

  test('following pays XP once per creator, even after unfollow/refollow', async () => {
    const f2 = await as('fz-fan2@test.dev');
    const before = await xpOf('fz-fan2@test.dev');
    await f2.put('/api/members/dragon-nav/follow', { notifyLive: true });
    await f2.del('/api/members/dragon-nav/follow');
    await f2.put('/api/members/dragon-nav/follow', { notifyLive: true });
    assert.equal(await xpOf('fz-fan2@test.dev'), before + 10);
  });
});

describe('reactions & comments', () => {
  test('react to published news; toggling works; hidden targets 404', async () => {
    const f = await as('fz-fan@test.dev');
    const r = await f.put(`/api/social/news/${news.id}/reactions/fire`, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.data.counts.fire, 1);
    assert.deepEqual(r.body.data.mine, ['fire']);
    assert.equal((await f.put(`/api/social/news/${news.id}/reactions/poop`, {})).status, 422, 'unknown emoji');
    const off = await f.del(`/api/social/news/${news.id}/reactions/fire`);
    assert.equal(off.body.data.counts.fire, 0);
    const [draft] = await db.insert(schema.newsPosts).values({ title: 'Draft', slug: 'draft', content: 'x' }).returning();
    assert.equal((await f.put(`/api/social/news/${draft.id}/reactions/fire`, {})).status, 404);
    assert.equal((await request(app).get(`/api/social/news/${draft.id}`)).status, 404);
  });

  test('comments: verified only, owner/mod delete, hidden ones disappear', async () => {
    const u = await as('fz-unverified@test.dev');
    assert.equal((await u.post(`/api/social/news/${news.id}/comments`, { body: 'hi' })).status, 403);
    const f = await as('fz-fan@test.dev');
    const c = await f.post(`/api/social/news/${news.id}/comments`, { body: 'Let’s gooo 🔥' });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    assert.equal(c.body.data.isMine, true);
    assert.ok(!JSON.stringify(c.body).includes('@test.dev'));
    assert.equal((await f.post(`/api/social/news/${news.id}/comments`, { body: 'x https://a.b https://c.d https://e.f' })).status, 422, 'link spam');
    const f2 = await as('fz-fan2@test.dev');
    assert.equal((await f2.del(`/api/social/comments/${c.body.data.id}`)).status, 404, 'cannot delete others (IDOR)');
    const c2 = await f2.post(`/api/social/news/${news.id}/comments`, { body: 'Second!' });
    const mod = await as('fz-mod@test.dev');
    assert.equal((await mod.patch(`/api/admin/comments/${c2.body.data.id}`, { status: 'HIDDEN' })).status, 200);
    const pub = (await request(app).get(`/api/social/news/${news.id}`)).body.data;
    assert.equal(pub.commentCount, 1);
    assert.equal(pub.comments[0].body, 'Let’s gooo 🔥');
    assert.equal((await mod.del(`/api/social/comments/${c.body.data.id}`)).status, 204, 'moderator can delete');
  });
});

describe('recruitment', () => {
  test('closed → 403; open → apply once; admin decision notifies + badge', async () => {
    const f2 = await as('fz-fan2@test.dev');
    const body = { rpName: 'Tony Cartel', discordTag: 'tonycartel', ageConfirmed: true, experience: 'Two years of serious RP on multiple servers.', whyDrz: 'The Dragonz storylines are the best in the city, I want in.' };
    assert.equal((await f2.post('/api/me/application', body)).status, 403);
    const superish = await as('fz-admin@test.dev');
    await db.insert(schema.siteSettings).values({ key: 'site.public', value: { recruitmentOpen: true } });
    assert.equal((await f2.post('/api/me/application', { ...body, ageConfirmed: false })).status, 422, 'must confirm 18+');
    const r = await f2.post('/api/me/application', body);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await f2.post('/api/me/application', body)).status, 409, 'one open application');
    const mod = await as('fz-mod@test.dev');
    assert.equal((await mod.get('/api/admin/applications')).status, 403, 'moderators cannot see applications');
    const list = (await superish.get('/api/admin/applications?status=OPEN')).body;
    assert.equal(list.data[0].rpName, 'Tony Cartel');
    assert.equal((await superish.patch(`/api/admin/applications/${r.body.data.id}`, { status: 'ACCEPTED', messageToApplicant: 'Welcome! Join our Discord.' })).status, 200);
    const mine = (await f2.get('/api/me/application')).body.data.application;
    assert.equal(mine.status, 'ACCEPTED');
    assert.equal(mine.messageToApplicant, 'Welcome! Join our Discord.');
    assert.ok(!('internalNote' in mine), 'internal notes stay internal');
    assert.ok((await badgesOf(fan2.id)).includes('RECRUIT'));
    const [mail] = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.template, 'applicationUpdate'));
    assert.ok(mail, 'applicant emailed');
  });
});

describe('quotes', () => {
  test('submitted quotes wait for approval; approval pays XP and allows reactions', async () => {
    const f = await as('fz-fan@test.dev');
    const q = await f.post('/api/quotes', { text: 'We don’t run. We regroup.', memberSlug: 'dragon-nav', characterName: 'Tarak Singh' });
    assert.equal(q.status, 201);
    assert.equal((await request(app).get('/api/quotes')).body.data.length, 0, 'pending quotes are private');
    assert.equal((await f.put(`/api/social/quote/${q.body.data.id}/reactions/laugh`, {})).status, 404);
    const before = await xpOf('fz-fan@test.dev');
    const mod = await as('fz-mod@test.dev');
    assert.equal((await mod.patch(`/api/admin/quotes/${q.body.data.id}`, { status: 'APPROVED', isFeatured: true })).status, 200);
    assert.equal(await xpOf('fz-fan@test.dev'), before + 15);
    const pub = (await request(app).get('/api/quotes')).body.data;
    assert.equal(pub[0].member.slug, 'dragon-nav');
    assert.equal(pub[0].submittedBy, 'fz-fan');
    assert.equal((await f.put(`/api/social/quote/${q.body.data.id}/reactions/laugh`, {})).status, 200);
  });
});

describe('clip of the week', () => {
  test('week keys are ISO weeks in India time', () => {
    assert.equal(weekOf(new Date('2026-09-28T00:00:00+05:30')).key, '2026-W40'); // Monday 00:00 IST
    assert.equal(weekOf(new Date('2026-09-27T23:59:00+05:30')).key, '2026-W39'); // Sunday night IST
  });

  test('vote (changeable) on eligible clips; winner decided after the week', async () => {
    const [clip] = await db.insert(schema.communitySubmissions).values({ authorId: fan.id, type: 'CLIP', title: 'Insane getaway', externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', status: 'APPROVED' }).returning();
    const [art] = await db.insert(schema.communitySubmissions).values({ authorId: fan2.id, type: 'FAN_ART', title: 'Not a clip', status: 'APPROVED' }).returning();
    const f2 = await as('fz-fan2@test.dev');
    const week = (await f2.get('/api/clips/week')).body.data;
    assert.ok(week.candidates.some((c) => c.id === clip.id));
    assert.ok(!week.candidates.some((c) => c.id === art.id), 'fan art is not a clip');
    assert.equal((await f2.post('/api/clips/week/vote', { submissionId: art.id })).status, 400);
    assert.equal((await f2.post('/api/clips/week/vote', { submissionId: clip.id })).status, 200);
    assert.equal((await f2.get('/api/clips/week')).body.data.candidates.find((c) => c.id === clip.id).votes, 1);

    // a finished week with votes → winner, featured, author rewarded
    await db.insert(schema.clipVotes).values({ weekKey: '2026-W01', userId: fan2.id, submissionId: clip.id });
    const before = await xpOf('fz-fan@test.dev');
    assert.equal(await decideClipWinners(), 1);
    assert.equal(await decideClipWinners(), 0, 'idempotent');
    const [s] = await db.select().from(schema.communitySubmissions).where(eq(schema.communitySubmissions.id, clip.id));
    assert.equal(s.status, 'FEATURED');
    assert.equal(await xpOf('fz-fan@test.dev'), before + 100);
    assert.ok((await badgesOf(fan.id)).includes('CLIP_CHAMPION'));
    const w = (await request(app).get('/api/clips/winners')).body.data[0];
    assert.equal(w.submission.title, 'Insane getaway');
    assert.ok(!(await request(app).get('/api/clips/week')).body.data.candidates.some((c) => c.id === clip.id), 'winners leave the running');
  });
});

describe('celebrations', () => {
  test('anniversaries and birthdays within a week', async () => {
    const tomorrow = new Date(Date.now() + 5.5 * 3_600_000 + 86_400_000);
    await db.insert(schema.members).values({ slug: 'bday', displayName: 'Birthday Guy', rank: 'Soldier', birthMonth: tomorrow.getUTCMonth() + 1, birthDay: tomorrow.getUTCDate() });
    const list = await celebrations(7);
    const ann = list.find((c) => c.kind === 'anniversary' && c.member.slug === 'dragon-nav');
    const bd = list.find((c) => c.kind === 'birthday' && c.member.slug === 'bday');
    assert.ok(ann && ann.years === 2, JSON.stringify(list));
    assert.ok(bd && bd.inDays === 1);
    const home = (await request(app).get('/api/home')).body.data;
    assert.ok(home.fanZone.celebrations.length >= 2);
    assert.ok(Array.isArray(home.fanZone.topFans));
  });
});
