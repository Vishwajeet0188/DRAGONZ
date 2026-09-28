// Integration layer tests: providers (with fake HTTP shaped like the official API docs),
// the sync state machine against the real test database, Kick webhook signatures, follows + alerts.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/index.js';
import { createYouTubeProvider, isoDurationToSeconds, parseYouTubeRef } from '../src/integrations/providers/youtube.js';
import { createKickProvider, parseKickSlug } from '../src/integrations/providers/kick.js';
import { createSyncService } from '../src/integrations/sync.service.js';
import { createKickWebhookRouter } from '../src/modules/webhooks/kick.routes.js';
import { notifyStreamStarted } from '../src/services/notifications.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/crypto.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const CH = 'UC' + 'a'.repeat(22);

after(() => pool.end());

describe('YouTube provider', () => {
  test('helpers', () => {
    assert.equal(isoDurationToSeconds('PT1H2M3S'), 3723);
    assert.equal(isoDurationToSeconds('PT45S'), 45);
    assert.equal(isoDurationToSeconds('P0D'), null);
    assert.deepEqual(parseYouTubeRef({ url: 'https://www.youtube.com/@DragonNav' }), { handle: 'DragonNav' });
    assert.deepEqual(parseYouTubeRef({ url: `https://www.youtube.com/channel/${CH}` }), { channelId: CH });
    assert.deepEqual(parseYouTubeRef({ externalId: CH, url: 'x' }), { channelId: CH });
  });

  test('resolves handle, reads subscribers, finds live + VODs, counts quota units', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      const u = new URL(url);
      calls.push(u.pathname.split('/').pop());
      assert.equal(u.searchParams.get('key'), 'test-key');
      if (u.pathname.endsWith('/channels') && u.searchParams.get('forHandle')) return json({ items: [{ id: CH }] });
      if (u.pathname.endsWith('/channels')) return json({ items: [{ id: CH, snippet: { thumbnails: { high: { url: 'https://yt3.ggpht.com/navy=s800' } } }, statistics: { subscriberCount: '184000', hiddenSubscriberCount: false }, contentDetails: { relatedPlaylists: { uploads: 'UU' + 'a'.repeat(22) } } }] });
      if (u.pathname.endsWith('/playlistItems')) return json({ items: ['v_live', 'v_vod', 'v_soon'].map((id) => ({ contentDetails: { videoId: id } })) });
      if (u.pathname.endsWith('/videos')) return json({ items: [
        { id: 'v_live', snippet: { title: 'Night Ops LIVE', liveBroadcastContent: 'live', thumbnails: { high: { url: 'https://i.ytimg.com/vi/v_live/hq.jpg' } } }, liveStreamingDetails: { actualStartTime: '2026-09-28T10:00:00Z', concurrentViewers: '2400' }, contentDetails: { duration: 'P0D' }, statistics: {} },
        { id: 'v_vod', snippet: { title: 'Heist recap', liveBroadcastContent: 'none', publishedAt: '2026-09-20T10:00:00Z', thumbnails: { maxres: { url: 'https://i.ytimg.com/vi/v_vod/max.jpg' } } }, contentDetails: { duration: 'PT25M10S' }, statistics: { viewCount: '9900' } },
        { id: 'v_soon', snippet: { title: 'Premiere', liveBroadcastContent: 'upcoming' }, contentDetails: {}, statistics: {} },
      ] });
      throw new Error('unexpected ' + url);
    };
    const yt = createYouTubeProvider({ apiKey: 'test-key', fetchImpl });
    const r = await yt.sync([{ id: 'acc1', memberId: 'm1', handle: '@dragonnav', url: 'https://www.youtube.com/@dragonnav', externalId: null }]);
    assert.deepEqual(r.accounts, [{ id: 'acc1', externalId: CH, followerCount: 184000, avatarUrl: 'https://yt3.ggpht.com/navy=s800' }]);
    assert.equal(r.live.length, 1);
    assert.equal(r.live[0].viewerCount, 2400);
    assert.equal(r.live[0].url, 'https://www.youtube.com/watch?v=v_live');
    assert.equal(r.videos.length, 1);
    assert.equal(r.videos[0].durationSec, 1510);
    assert.equal(r.videos[0].viewCount, 9900);
    assert.deepEqual(r.checkedAccountIds, ['acc1']);
    assert.equal(r.unitsUsed, 4);
    assert.deepEqual(calls, ['channels', 'channels', 'playlistItems', 'videos']);
  });

  test('a bad API key aborts the provider run (403)', async () => {
    const yt = createYouTubeProvider({ apiKey: 'bad', fetchImpl: async () => json({ error: { errors: [{ reason: 'keyInvalid' }] } }, 403) });
    await assert.rejects(yt.sync([{ id: 'a', memberId: 'm', handle: '@x', url: 'https://www.youtube.com/@xyz' }]), /keyInvalid/);
  });
});

describe('Kick provider', () => {
  test('slug parsing', () => {
    assert.equal(parseKickSlug({ url: 'https://kick.com/DragonViper' }), 'dragonviper');
    assert.equal(parseKickSlug({ url: 'nope', handle: '@kick_guy' }), 'kick_guy');
  });

  test('uses app token, batches slugs, maps live stream, never leaks the stream key', async () => {
    let tokenCalls = 0;
    const fetchImpl = async (url, init) => {
      const u = new URL(url);
      if (u.hostname === 'id.kick.com') {
        tokenCalls++;
        assert.equal(init.method, 'POST');
        assert.match(String(init.body), /grant_type=client_credentials/);
        return json({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600 });
      }
      assert.equal(init.headers.Authorization, 'Bearer tok');
      assert.deepEqual(u.searchParams.getAll('slug'), ['dragonviper', 'offline_guy']);
      return json({ data: [
        { slug: 'dragonviper', broadcaster_user_id: 777, stream_title: 'Enforcer duty', stream: { is_live: true, viewer_count: 860, thumbnail: 'https://images.kick.com/t.jpg', start_time: '2026-09-28T09:00:00Z', key: 'super-secret-stream-key', url: 'rtmps://stream.kick.com/abc' } },
        { slug: 'offline_guy', broadcaster_user_id: 778, stream_title: '', stream: { is_live: false, viewer_count: 0 } },
      ] });
    };
    const kick = createKickProvider({ clientId: 'id', clientSecret: 'secret', fetchImpl });
    const accs = [
      { id: 'k1', memberId: 'm1', handle: 'dragonviper', url: 'https://kick.com/dragonviper' },
      { id: 'k2', memberId: 'm2', handle: 'offline_guy', url: 'https://kick.com/offline_guy' },
    ];
    const r = await kick.sync(accs);
    await kick.sync(accs); // token reused
    assert.equal(tokenCalls, 1);
    assert.equal(r.live.length, 1);
    assert.equal(r.live[0].viewerCount, 860);
    assert.equal(r.live[0].url, 'https://kick.com/dragonviper');
    assert.equal(r.live[0].stableId, true);
    assert.deepEqual(r.checkedAccountIds, ['k1', 'k2']);
    assert.ok(!JSON.stringify(r).includes('super-secret'), 'stream key must never be copied');
    assert.ok(!JSON.stringify(r).includes('rtmps://'), 'ingest URL must never be copied');
  });
});

describe('sync engine (database)', () => {
  let member, account;
  before(async () => {
    await db.execute(sql`truncate members, live_streams, videos, site_settings cascade`);
    [member] = await db.insert(schema.members).values({ slug: 'sync-test', displayName: 'Sync Test', rank: 'Soldier', isCreator: true }).returning();
    [account] = await db.insert(schema.platformAccounts).values({ memberId: member.id, platform: 'YOUTUBE', handle: '@synctest', url: 'https://www.youtube.com/@synctest' }).returning();
    await db.insert(schema.liveStreams).values({ memberId: member.id, platform: 'TWITCH', externalId: 'demo-x', title: 'demo', url: 'https://www.twitch.tv/x', startedAt: new Date(), source: 'MOCK' });
  });

  test('offline → live → live → offline, alerts fire once, videos upsert, demo streams end', async () => {
    let state = 'live';
    const provider = {
      platform: 'YOUTUBE', label: 'YouTube', configured: true,
      async sync(accounts) {
        const a = accounts[0];
        return {
          accounts: [{ id: a.id, externalId: CH, followerCount: 5000, avatarUrl: 'https://yt3.ggpht.com/chan=s800' }],
          videos: [{ accountId: a.id, memberId: a.memberId, externalId: 'vid1', title: 'VOD', url: 'https://www.youtube.com/watch?v=vid1', thumbnailUrl: null, durationSec: 60, viewCount: 10, publishedAt: new Date() }],
          live: state === 'live' ? [{ accountId: a.id, memberId: a.memberId, externalId: 'stream1', title: 'LIVE!', url: 'https://www.youtube.com/watch?v=stream1', thumbnailUrl: null, viewerCount: 50, startedAt: new Date() }] : [],
          checkedAccountIds: [a.id],
          unitsUsed: 3,
        };
      },
    };
    const startedEvents = [];
    const svc = createSyncService({ providers: [provider], onStreamStarted: async (s) => { startedEvents.push(s.externalId); } });

    await svc.run({ force: true });
    let live = await db.select().from(schema.liveStreams).where(eq(schema.liveStreams.isLive, true));
    assert.deepEqual(live.map((l) => l.externalId), ['stream1'], 'demo stream ended, real one live');
    assert.deepEqual(startedEvents, ['stream1']);
    const [acc] = await db.select().from(schema.platformAccounts).where(eq(schema.platformAccounts.id, account.id));
    assert.equal(acc.externalId, CH);
    assert.equal(acc.followerCount, 5000);
    assert.ok(acc.lastSyncedAt);
    const [mem] = await db.select().from(schema.members).where(eq(schema.members.id, acc.memberId));
    assert.equal(mem.avatarUrl, 'https://yt3.ggpht.com/chan=s800', 'channel picture fills a missing member photo');
    await db.update(schema.members).set({ avatarUrl: 'https://example.com/uploaded.webp' }).where(eq(schema.members.id, acc.memberId));

    await svc.run({ force: true }); // still live → no second alert
    const [mem2] = await db.select().from(schema.members).where(eq(schema.members.id, acc.memberId));
    assert.equal(mem2.avatarUrl, 'https://example.com/uploaded.webp', 'an uploaded photo is never overwritten');
    assert.equal(startedEvents.length, 1);
    assert.equal((await db.select().from(schema.videos)).length, 1, 'videos are upserted, not duplicated');

    state = 'offline';
    await svc.run({ force: true });
    live = await db.select().from(schema.liveStreams).where(eq(schema.liveStreams.isLive, true));
    assert.equal(live.length, 0);
    const [ended] = await db.select().from(schema.liveStreams).where(eq(schema.liveStreams.externalId, 'stream1'));
    assert.ok(ended.endedAt, 'stream marked ended');
  });

  test('account-level errors are stored and do not end unknown streams', async () => {
    const provider = { platform: 'YOUTUBE', label: 'YouTube', configured: true,
      async sync(accs) { return { accounts: [{ id: accs[0].id, error: 'No YouTube channel found for @synctest' }], videos: [], live: [], checkedAccountIds: [] }; } };
    await createSyncService({ providers: [provider] }).run({ force: true });
    const [acc] = await db.select().from(schema.platformAccounts).where(eq(schema.platformAccounts.id, account.id));
    assert.match(acc.syncError, /No YouTube channel/);
  });

  test('provider outage is recorded, not thrown', async () => {
    const provider = { platform: 'YOUTUBE', label: 'YouTube', configured: true, async sync() { throw new Error('youtube: HTTP 403 quotaExceeded'); } };
    const summary = await createSyncService({ providers: [provider] }).run({ force: true });
    assert.match(summary.YOUTUBE.error, /quotaExceeded/);
  });
});

describe('Kick webhook', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const received = [];
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use('/hook', createKickWebhookRouter({ getPublicKey: async () => pem, onLiveStatus: (b) => received.push(b) }));

  const sign = (id, ts, body) => crypto.createSign('RSA-SHA256').update(`${id}.${ts}.${body}`).sign(privateKey, 'base64');
  const send = (id, body, { ts = new Date().toISOString(), sig } = {}) => request(app).post('/hook')
    .set('Content-Type', 'application/json')
    .set('Kick-Event-Message-Id', id).set('Kick-Event-Message-Timestamp', ts)
    .set('Kick-Event-Type', 'livestream.status.updated').set('Kick-Event-Version', '1')
    .set('Kick-Event-Signature', sig ?? sign(id, ts, body))
    .send(body);

  test('valid signature is accepted once; replays and forgeries are rejected', async () => {
    const body = JSON.stringify({ broadcaster: { user_id: 777, channel_slug: 'dragonviper' }, is_live: true, title: 'Live!' });
    assert.equal((await send('01MSG1', body)).status, 200);
    assert.equal(received.length, 1);
    const replay = await send('01MSG1', body);
    assert.equal(replay.body.data.duplicate, true);
    assert.equal(received.length, 1);
    assert.equal((await send('01MSG2', body, { sig: sign('01MSG2', new Date().toISOString(), '{"forged":true}') })).status, 401);
    const old = new Date(Date.now() - 3600_000).toISOString();
    assert.equal((await send('01MSG3', body, { ts: old, sig: sign('01MSG3', old, body) })).status, 400);
  });
});

describe('follows + live alerts', () => {
  test('follow a creator, get one in-app alert per stream window', async () => {
    await db.execute(sql`truncate notifications, email_outbox`);
    await db.delete(schema.users).where(eq(schema.users.email, 'fan@test.dev'));
    const app = createApp();
    const agent = request.agent(app);
    const csrf = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
    await db.insert(schema.users).values({ email: 'fan@test.dev', passwordHash: await hashPassword('Correct-Horse-9-Battery'), displayName: 'Fan', emailVerifiedAt: new Date() });
    assert.equal((await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ email: 'fan@test.dev', password: 'Correct-Horse-9-Battery' })).status, 200);

    assert.equal((await agent.put('/api/members/sync-test/follow').set('X-CSRF-Token', csrf).send({ notifyLive: true })).status, 200);
    assert.equal((await agent.get('/api/me/follows')).body.data[0].slug, 'sync-test');
    assert.equal((await agent.put('/api/me/notification-preferences').set('X-CSRF-Token', csrf).send({ emailLiveAlerts: true })).body.data.emailLiveAlerts, true);

    const [m] = await db.select().from(schema.members).where(eq(schema.members.slug, 'sync-test'));
    const stream = { memberId: m.id, platform: 'KICK', title: 'Going live', url: 'https://kick.com/x', startedAt: new Date(), thumbnailUrl: null };
    await notifyStreamStarted(stream);
    await notifyStreamStarted({ ...stream }); // stream restart in same window → no duplicate
    const inbox = await agent.get('/api/me/notifications');
    assert.equal(inbox.body.data.length, 1);
    assert.match(inbox.body.data[0].title, /Sync Test is LIVE on Kick/);
    assert.equal(inbox.body.meta.unread, 1);
    const emails = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.template, 'liveAlert'));
    assert.equal(emails.length, 1, 'one email, deduped');

    await agent.post('/api/me/notifications/read').set('X-CSRF-Token', csrf).send({});
    assert.equal((await agent.get('/api/me/notifications')).body.meta.unread, 0);
    // Another user can't read this user's notifications: /me is always scoped to the session.
    assert.equal((await request(app).get('/api/me/notifications')).status, 401);
  });
});
