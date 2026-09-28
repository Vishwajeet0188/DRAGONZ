// API integration tests (node:test + supertest) against the dragonz_test database.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { sql, eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, pool, schema } from '../src/db/index.js';
import { hashPassword, randomToken, sha256 } from '../src/lib/crypto.js';

const app = createApp();
const PASSWORD = 'Correct-Horse-9-Battery';

async function client() {
  const agent = request.agent(app);
  const res = await agent.get('/api/auth/csrf');
  const token = res.body.data.csrfToken;
  const send = (method, url, body) => agent[method](url).set('X-CSRF-Token', token).send(body);
  return { agent, token, post: (u, b) => send('post', u, b), patch: (u, b) => send('patch', u, b), put: (u, b) => send('put', u, b), del: (u, b) => send('delete', u, b), get: (u) => agent.get(u) };
}

async function makeUser(email, role = 'USER') {
  const [u] = await db.insert(schema.users).values({ email, passwordHash: await hashPassword(PASSWORD), displayName: email.split('@')[0], role, emailVerifiedAt: new Date() }).returning();
  return u;
}

async function loggedIn(email) {
  const c = await client();
  const res = await c.post('/api/auth/login', { email, password: PASSWORD });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return c;
}

before(async () => {
  await db.execute(sql`truncate users, members, email_outbox, audit_logs cascade`);
  await makeUser('super@test.dev', 'SUPER_ADMIN');
  await makeUser('admin@test.dev', 'ADMIN');
  await makeUser('mod@test.dev', 'MODERATOR');
  await makeUser('user@test.dev', 'USER');
});
after(() => pool.end());

describe('auth', () => {
  test('register → session → me, password never returned', async () => {
    const c = await client();
    const res = await c.post('/api/auth/register', { email: 'New@Test.dev', password: PASSWORD, displayName: 'New User' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.email, 'new@test.dev');
    assert.equal(res.body.data.user.emailVerified, false);
    assert.ok(!('passwordHash' in res.body.data.user));
    const cookie = res.headers['set-cookie'].join(';');
    assert.match(cookie, /dz_session=.*HttpOnly/i);
    const me = await c.get('/api/auth/me');
    assert.equal(me.body.data.user.email, 'new@test.dev');
    const [outbox] = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.toAddress, 'new@test.dev'));
    assert.equal(outbox.template, 'verifyEmail');
  });

  test('duplicate email → 409; weak password → 422', async () => {
    const c = await client();
    assert.equal((await c.post('/api/auth/register', { email: 'new@test.dev', password: PASSWORD, displayName: 'Dup' })).status, 409);
    const weak = await c.post('/api/auth/register', { email: 'weak@test.dev', password: 'password1', displayName: 'Weak' });
    assert.equal(weak.status, 422);
    assert.equal(weak.body.error.code, 'VALIDATION_ERROR');
  });

  test('state-changing request without CSRF token is rejected', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'user@test.dev', password: PASSWORD });
    assert.equal(res.status, 403);
  });

  test('foreign Origin is rejected even with token', async () => {
    const c = await client();
    const res = await c.agent.post('/api/auth/login').set('X-CSRF-Token', c.token).set('Origin', 'https://evil.example').send({ email: 'user@test.dev', password: PASSWORD });
    assert.equal(res.status, 403);
  });

  test('unknown email and wrong password give identical errors', async () => {
    const c = await client();
    const a = await c.post('/api/auth/login', { email: 'nobody@test.dev', password: PASSWORD });
    const b = await c.post('/api/auth/login', { email: 'user@test.dev', password: 'wrong-password-123' });
    assert.equal(a.status, 401);
    assert.deepEqual(a.body, b.body);
  });

  test('account locks after 5 failures', async () => {
    await makeUser('lock@test.dev');
    const c = await client();
    for (let i = 0; i < 5; i++) await c.post('/api/auth/login', { email: 'lock@test.dev', password: 'nope-nope-nope' });
    const res = await c.post('/api/auth/login', { email: 'lock@test.dev', password: PASSWORD });
    assert.equal(res.status, 423);
  });

  test('email verification token is single-use', async () => {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, 'new@test.dev'));
    const token = randomToken(32);
    await db.insert(schema.authTokens).values({ userId: u.id, type: 'EMAIL_VERIFY', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60_000) });
    const c = await client();
    assert.equal((await c.post('/api/auth/verify-email', { token })).status, 200);
    assert.equal((await c.post('/api/auth/verify-email', { token })).status, 400);
  });

  test('forgot-password does not reveal whether account exists', async () => {
    const c = await client();
    const a = await c.post('/api/auth/forgot-password', { email: 'user@test.dev' });
    const b = await c.post('/api/auth/forgot-password', { email: 'ghost@test.dev' });
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, b.body);
  });

  test('password reset revokes existing sessions', async () => {
    const u = await makeUser('reset@test.dev');
    const c = await loggedIn('reset@test.dev');
    const token = randomToken(32);
    await db.insert(schema.authTokens).values({ userId: u.id, type: 'PASSWORD_RESET', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60_000) });
    const anon = await client();
    assert.equal((await anon.post('/api/auth/reset-password', { token, password: 'Brand-New-Pass-42' })).status, 200);
    assert.equal((await c.get('/api/auth/me')).body.data.user, null);
  });

  test('logout clears the session', async () => {
    const c = await loggedIn('user@test.dev');
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).body.data.user, null);
  });
});

describe('authorization', () => {
  test('anonymous → 401, USER → 403 on admin routes', async () => {
    assert.equal((await request(app).get('/api/admin/stats')).status, 401);
    const c = await loggedIn('user@test.dev');
    assert.equal((await c.get('/api/admin/stats')).status, 403);
  });

  test('MODERATOR can read stats but cannot manage members', async () => {
    const c = await loggedIn('mod@test.dev');
    assert.equal((await c.get('/api/admin/stats')).status, 200);
    assert.equal((await c.post('/api/admin/members', { displayName: 'X', rank: 'Soldier' })).status, 403);
  });

  test('ADMIN cannot change roles; SUPER_ADMIN can, but not their own', async () => {
    const [target] = await db.select().from(schema.users).where(eq(schema.users.email, 'user@test.dev'));
    const admin = await loggedIn('admin@test.dev');
    assert.equal((await admin.patch(`/api/admin/users/${target.id}/role`, { role: 'ADMIN' })).status, 403);
    const sup = await loggedIn('super@test.dev');
    assert.equal((await sup.patch(`/api/admin/users/${target.id}/role`, { role: 'CONTENT_MANAGER' })).status, 200);
    const me = (await sup.get('/api/auth/me')).body.data.user;
    assert.equal((await sup.patch(`/api/admin/users/${me.id}/role`, { role: 'USER' })).status, 403);
  });

  test('client-supplied role on register is ignored (mass assignment)', async () => {
    const c = await client();
    const res = await c.post('/api/auth/register', { email: 'sneaky@test.dev', password: PASSWORD, displayName: 'Sneaky', role: 'SUPER_ADMIN' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, 'USER');
  });
});

describe('members', () => {
  let memberId;
  test('admin creates member, sets platforms, public profile works', async () => {
    const c = await loggedIn('admin@test.dev');
    const created = await c.post('/api/admin/members', { displayName: 'Dragon Test', rank: 'Soldier', isCreator: true, isFeatured: true });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.slug, 'dragon-test');
    memberId = created.body.data.id;
    const plats = await c.put(`/api/admin/members/${memberId}/platforms`, { platforms: [{ platform: 'YOUTUBE', handle: '@t', url: 'https://www.youtube.com/@t', isPrimary: true }] });
    assert.equal(plats.status, 200);
    const pub = await request(app).get('/api/members/dragon-test');
    assert.equal(pub.status, 200);
    assert.equal(pub.body.data.platforms[0].platform, 'YOUTUBE');
    const list = await request(app).get('/api/members?creator=true&platform=YOUTUBE');
    assert.equal(list.body.meta.total, 1);
  });

  test('platform URL must be on the official domain', async () => {
    const c = await loggedIn('admin@test.dev');
    const res = await c.put(`/api/admin/members/${memberId}/platforms`, { platforms: [{ platform: 'YOUTUBE', handle: 'x', url: 'https://evil.example/@x' }] });
    assert.equal(res.status, 422);
  });

  test('javascript: avatar URLs are rejected', async () => {
    const c = await loggedIn('admin@test.dev');
    const res = await c.patch(`/api/admin/members/${memberId}`, { avatarUrl: 'javascript:alert(1)' });
    assert.equal(res.status, 422);
  });

  test('search input with SQL/LIKE metacharacters is safe', async () => {
    const res = await request(app).get(`/api/members?q=${encodeURIComponent("%' OR 1=1 --")}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.total, 0);
  });

  test('soft-deleted member disappears from public API and writes audit log', async () => {
    const c = await loggedIn('admin@test.dev');
    assert.equal((await c.del(`/api/admin/members/${memberId}`)).status, 204);
    assert.equal((await request(app).get('/api/members/dragon-test')).status, 404);
    const logs = await c.get('/api/admin/audit-logs');
    assert.ok(logs.body.data.some((l) => l.action === 'member.delete'));
  });
});

describe('account', () => {
  test('delete account requires password and anonymises the user', async () => {
    await makeUser('bye@test.dev');
    const c = await loggedIn('bye@test.dev');
    assert.equal((await c.del('/api/users/me', { password: 'wrong-password-1' })).status, 400);
    assert.equal((await c.del('/api/users/me', { password: PASSWORD })).status, 200);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, 'bye@test.dev'));
    assert.equal(row, undefined);
    const again = await client();
    assert.equal((await again.post('/api/auth/login', { email: 'bye@test.dev', password: PASSWORD })).status, 401);
  });
});
