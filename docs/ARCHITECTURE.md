# Dragonz Central — Architecture & Implementation Plan

> "The centralized digital home of Dragonz."

## 1. Current project analysis

- The workspace contained **no existing project** (no `package.json`, no source, no DB). Nothing to preserve or migrate.
- Runtime: Node.js 22 LTS, npm 10, PostgreSQL 16.
- Requested stack: **React + JavaScript** (no TypeScript), Node/Express, PostgreSQL, Prisma-or-equivalent ORM, Tailwind.
- Therefore this is a greenfield build. Decisions below are recorded so future contributors know *why*.

## 2. Architecture

```
           Browser (React SPA, Vite build, served via CDN / Cloudflare)
                     │  HTTPS, same-site cookies, X-CSRF-Token header
                     ▼
     ┌─────────────── Express API (Node 22) ───────────────┐
     │ helmet · CORS allowlist · rate limits · CSRF · zod  │
     │ routes → controllers → services → Drizzle ORM    │
     │ RBAC (permission map) · audit log · pino logging    │
     │ Email outbox (retry, dedupe) · Provider adapters    │
     └───────────┬──────────────────────┬──────────────────┘
                 ▼                      ▼
           PostgreSQL 16          3rd-party providers (Phase 3)
         (Drizzle migrations)      YouTube Data API / Twitch Helix+EventSub /
                                  Kick API · Email (Resend) · S3-compatible storage
```

**Key decisions**

| Decision | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite 6 + JavaScript, React Router 7 (declarative), TanStack Query 5, Tailwind 4 | Requested stack; SPA is CDN-friendly; TanStack Query gives caching, retries, loading/error states for free. |
| Backend | Express 5, layered modules (routes → services → db) | Express 5 handles async errors natively; modules keep routes thin. |
| ORM | **Drizzle ORM** + node-postgres, drizzle-kit SQL migrations | Pure JS (no native engine binaries — Prisma's engine download was blocked in the build sandbox, and a binary-free ORM also deploys more simply). Parameterised queries (SQLi-safe), SQL-first migrations checked into git. |
| Auth | **Server-side sessions** in Postgres, opaque random token in `HttpOnly; Secure; SameSite=Lax` cookie, only SHA-256 hash stored | Instant revocation (logout-everywhere, account deletion, role change), no JWT secret-rotation pitfalls. |
| Passwords | Argon2id | Current OWASP recommendation. |
| CSRF | Double-submit token (`dz_csrf` cookie + `X-CSRF-Token` header) + Origin check + SameSite=Lax | Defence in depth for cookie auth. |
| RBAC | Role enum on user, **permission map in code** (`server/src/auth/permissions.js`) | Granular permissions, version-controlled and reviewed; no admin can grant arbitrary permission rows at runtime. Can move to tables later without API changes. |
| Creators | A creator is a `Member` with `isCreator = true` + `PlatformAccount` rows | Avoids duplicating identity data across `members` and `creators`. New platforms = new enum value + provider adapter. |
| Hall of Fame | `Achievement` rows with `inHallOfFame` flag | One source of truth for achievements. |
| Analytics | Daily aggregated counters (`PageViewDaily`), no IPs / user IDs | Privacy by design. |
| Media | Object storage abstraction (local disk in dev, S3/R2 in prod); DB stores only keys & metadata | Never large blobs in Postgres. |

## 3. Folder structure

```
dragonz-central/
├─ package.json               # npm workspaces: server, client
├─ docs/ARCHITECTURE.md
├─ server/
│  ├─ .env.example
│  ├─ drizzle/               # generated SQL migrations
│  ├─ scripts/ migrate.js · seed.js
│  ├─ src/db/ schema.js · index.js
│  ├─ src/
│  │  ├─ server.js · app.js
│  │  ├─ config/env.js        # zod-validated environment
│  │  ├─ lib/                 # logger, errors, crypto, util, platforms, validators
│  │  ├─ auth/permissions.js  # role → permission map
│  │  ├─ middleware/          # session, requireAuth, requirePermission, csrf, rateLimit, validate, errors
│  │  ├─ services/email/      # provider abstraction, templates, outbox
│  │  ├─ services/audit.js
│  │  └─ modules/<domain>/    # *.routes.js · *.controller.js · *.service.js · *.validators.js
│  │        auth · users · members · home · admin (…videos, news, events, community, live in later phases)
│  └─ test/                   # node:test + supertest API tests
└─ client/
   ├─ .env.example · index.html · vite.config.js
   └─ src/
      ├─ main.jsx · App.jsx (lazy routes)
      ├─ styles/index.css      # Tailwind 4 theme tokens
      ├─ lib/                  # api client (CSRF aware), formatters, queryClient
      ├─ context/AuthContext.jsx
      ├─ components/ layout/ · ui/ · members/ · media/
      ├─ pages/                # public + account pages
      └─ admin/                # admin layout + pages
```

## 4. Database design (ERD)

```
User 1─* Session            User 1─* AuthToken (EMAIL_VERIFY | PASSWORD_RESET)
User 1─1 NotificationPreference
User 0..1─1 Member (member may be linked to a login account)
User *─* Member  via Follow (notifyLive flag)
Member 1─* PlatformAccount (YOUTUBE|KICK|TWITCH|INSTAGRAM|TIKTOK|X|DISCORD)
Member 1─* Video             PlatformAccount 1─* Video
Member 1─* LiveStream        PlatformAccount 1─* LiveStream
Member 1─* Milestone         Member 0..1─* Achievement
Member 1─* Supporter ─* User (tier, source ADMIN|SELF_CLAIM|CREATOR_APPROVED, status)
User 1─* NewsPost (author)   Member 0..1─* Event (organizer) ─* EventReminder *─ User
User 1─* CommunitySubmission 1─* CommunityMedia
User 1─* Notification (unique userId+dedupeKey)
EmailOutbox (unique dedupeKey, attempts, status)   AuditLog (actor, action, entity)
PageViewDaily (path, day, count)   SiteSetting (key, JSON value)
```

- All tables: UUID PKs (`gen_random_uuid()`), `createdAt/updatedAt`; soft-delete (`deletedAt`) on `User`, `Member`, `NewsPost`, `Event`, `CommunitySubmission`.
- Unique: `User.email`, `Member.slug`, `(platform, externalId)` on videos/streams/accounts, `Follow(userId, memberId)`, `Notification(userId, dedupeKey)`, `EmailOutbox.dedupeKey`.
- Indexes on every FK and on hot filters (`Member(status, rankOrder)`, `Video(publishedAt)`, `LiveStream(isLive)`, `Event(startsAt)`, `NewsPost(status, publishedAt)`).
- The full schema is created in Phase 1 so later phases add behaviour, not table churn.

## 5. API design

Consistent envelope: success `{ data, meta? }`, error `{ error: { code, message, details? } }`.

| Area | Endpoints |
|---|---|
| `/api/auth` | `GET csrf` · `POST register` · `POST login` · `POST logout` · `GET me` · `POST verify-email` · `POST resend-verification` · `POST forgot-password` · `POST reset-password` · `POST change-password` |
| `/api/users` | `PATCH me` · `DELETE me` · `GET me/follows` (P3) · `PUT me/notification-preferences` (P3) |
| `/api/home` | `GET /` — aggregated homepage payload (single round-trip, no N+1) |
| `/api/members` | `GET /?q&rank&creator&platform&sort&page&pageSize` · `GET /:slug` · `GET /ranks` |
| `/api/videos` `/api/news` `/api/events` `/api/community` `/api/achievements` | Phase 2 |
| `/api/live` `/api/notifications` `/api/follows` `/api/webhooks/*` | Phase 3 |
| `/api/search` | Phase 2 (Postgres `ILIKE` + trigram index, upgrade path to FTS) |
| `/api/admin` | `GET stats` · `GET/POST/PATCH/DELETE members` · `PUT members/:id/platforms` · `GET users` · `PATCH users/:id/role` · `GET audit-logs` (+ content sections per phase) |

## 6. Authentication architecture

- Register → Argon2id hash → create user (unverified) → queue verification email (token: 32 random bytes, SHA-256 stored, 24h expiry, single use).
- Login → constant-work check (dummy hash when user missing) → per-account lockout (5 failures → 15 min) + IP rate limit → new session (rotated on login, 30-day sliding expiry) → `dz_session` cookie.
- Forgot password always returns the same response (no user enumeration); reset token 1h single-use; reset revokes all sessions.
- Change password requires current password and revokes other sessions.
- Account deletion requires password; user is anonymised + soft-deleted, sessions/tokens/follows removed.
- Every request: session middleware loads user **from DB** — role is never trusted from the client.

## 7. Third-party integration plan (Phases 3–4)

`StreamingProvider` interface: `getChannel`, `getLiveStatus(accounts[])`, `getLatestVideos(account)`, optional `verifyWebhook` / `parseWebhook`.

| Platform | Official mechanism | Auth | Notes / limits |
|---|---|---|---|
| YouTube | Data API v3 (`channels`, `playlistItems` for uploads, `videos?part=liveStreamingDetails`) + WebSub/PubSubHubbub push for new uploads | API key (public data) | 10,000 units/day default quota; `search.list` costs 100 units so live detection uses cheap WebSub + `videos.list` (1 unit). |
| Twitch | Helix API + **EventSub** `stream.online` / `stream.offline` webhooks | App access token (client credentials) | Webhook signature (HMAC-SHA256) verified; fallback polling `GET /streams` ≤ every 2 min. |
| Kick | Official Kick public API / webhooks (`livestream.status.updated`) | OAuth app credentials | Verify current API capabilities at implementation time; no scraping. If unavailable → manual/admin status. |
| Instagram | Link only | — | No live API used. |
| Email | `EmailProvider` interface: `console` (dev), `resend` (prod) | API key | Outbox table gives retry + dedupe. |
| YouTube memberships | `members.list` only for the **channel owner's own** OAuth token (scope `youtube.channel-memberships.creator`), restricted API | Creator OAuth | Not assumed. Phase 4 ships admin-managed + creator-approved supporters; OAuth sync only if a creator authorises it. |

Mock providers live in `providers/mock/` and are only registered when `STREAMING_MODE=mock` (never in production — enforced at boot).

## 8. Admin architecture

- `/admin/*` React routes behind `AdminRoute` (UX only) — **every** `/api/admin/*` endpoint enforces `requirePermission(...)` server-side.
- Roles → permissions: `SUPER_ADMIN` all · `ADMIN` members/creators/content/events/news/achievements/users:read/audit:read · `MODERATOR` community/reports · `CONTENT_MANAGER` videos/news/events · `USER` none.
- Only `SUPER_ADMIN` can change roles; nobody can change their own role or demote the last super-admin.
- All admin mutations write an `AuditLog` row (actor, action, entity, safe metadata diff).

## 9. Security plan

SQLi → Drizzle parameterisation, LIKE-escaping, no raw string SQL · XSS → React escaping, news markdown rendered with sanitisation (P2), strict CSP · CSRF → double-submit + Origin check · Auth → Argon2id, session rotation, lockout, rate limits · Authorization/IDOR → server-side permission checks, user-scoped queries use `req.user.id` only · Uploads (P2) → extension + magic-byte MIME check, size caps, random keys, image re-encode, no SVG/executables, served from separate storage domain · SSRF → no user-supplied URLs fetched server-side; platform URLs validated against host allowlists · Headers → helmet, HSTS in prod, `trust proxy` for Cloudflare · Logging → pino with redaction of passwords/tokens/cookies · Infra → Cloudflare CDN/WAF + rate limits, managed Postgres backups (PITR). Not "DDoS-proof"; mitigated by CDN/WAF.

## 10. Phases

1. **Architecture, DB, auth, core UI, homepage, members, profiles, admin foundation** ← this delivery
2. Videos, news (markdown + sanitising), events (+ .ics), community submissions + storage, hall of fame, global search, admin CRUD for each
3. Live hub, provider adapters (YouTube/Twitch/Kick), webhooks, following, notification + email live alerts, dedupe & rate limits
4. Supporters, analytics dashboards, caching, performance, security hardening review
5. E2E tests, deployment (Docker, CI), monitoring, docs

## 11. Phase 1 status (delivered)

- ✅ Full schema (22 tables) + migration `drizzle/0000_init.sql` + demo seed
- ✅ Auth: register, login, logout, email verification, resend, forgot/reset, change password, session management, account deletion
- ✅ Security: Argon2id, hashed session/reset tokens, CSRF + Origin checks, rate limits, lockout, helmet/CSP/HSTS, zod validation with mass-assignment stripping, platform URL allowlists, audit log, log redaction
- ✅ RBAC permission map enforced server-side on every admin route
- ✅ Public UI: homepage (all sections, data-driven), `/members` (search/filter/sort/paginate, URL-synced), `/members/:slug`, `/about`, auth pages, `/dashboard`, `/settings`; later-phase routes render a branded "coming soon" page
- ✅ Admin: dashboard stats + activity, members CRUD with platform editor, users + role management, audit log; later sections scaffolded in the nav with phase tags
- ✅ 20 API integration tests (auth, CSRF, enumeration, lockout, RBAC, IDOR/mass-assignment, XSS URLs, SQL metacharacters, soft delete, account deletion)

**Known Phase-1 limitations (by design):** following/notifications, videos/news/events/community APIs and admin editors, live provider integrations, uploads and analytics arrive in Phases 2–4. Rate limiting uses an in-memory store (single instance); use a shared store when scaling horizontally.

## 12. Phase 3 status — live sync (delivered)

- **YouTube** (Data API v3, API key): handle → channel id once (`channels.list?forHandle`), then per run `channels.list` (subscribers, 1 unit / 50 channels) + `playlistItems.list` (1 unit / channel) + `videos.list` (1 unit / 50 videos, gives `liveBroadcastContent` + `liveStreamingDetails`). `search.list` is not used (separate 100/day allowance). Runs are paced automatically to stay under `YOUTUBE_DAILY_QUOTA` with 10% headroom.
- **Kick** (Dev Public API, app token via `id.kick.com/oauth/token` client_credentials): `GET /public/v1/channels?slug=…` (≤50 per call) → `stream.is_live`, `viewer_count`, `thumbnail`, `start_time`, `stream_title`. Stream key / ingest URL in the payload are never copied. No public VOD endpoint → Kick videos stay admin-managed.
- **Kick webhooks** `/api/webhooks/kick`: RSA-SHA256 signature over `id.timestamp.rawBody`, 10-min freshness, replay protection; triggers a debounced sync. Admin can subscribe channels once deployed on https.
- **Sync engine**: provider registry → reconcile accounts / videos (upsert) / live state machine (start → alert, update, end), stale-stream safety net, MOCK demo streams ended in live mode, per-account errors stored on `platform_accounts.sync_error`, status in `site_settings`. Postgres advisory lock → one syncing instance.
- **Alerts**: follow/unfollow + per-creator bell, in-app notifications, opt-in emails to verified users; dedupe 1 per creator per follower per 3 h.
- **UI**: `/live` (auto-refresh 30 s), `/videos` (search, creator, platform, sort), follow button, dashboard favourites + notifications, settings toggles, `/admin/live` (provider health, quota bar, per-channel status, Sync now).
- Scripts: `npm run sync:once` (test keys), `npm run demo:clear` (remove seed demo content).
- Tests: 30 passing (providers with doc-shaped fixtures, sync transitions on the DB, webhook signatures, follows/alerts/IDOR).

## Status — Phases 2, 3, 4 complete (Sep 2026)
- **Phase 2 (content):** news, events (reminders, .ics), community showcase with moderation, Hall of Fame (achievements + milestones), videos admin (feature/hide/manual Kick VODs), image uploads (sharp → WebP, EXIF stripped, S3 or local).
- **Phase 3 (live):** YouTube Data API + Kick Dev API sync, Kick webhooks, follow + live alerts (in-app + email).
- **Phase 4 (platform):** supporters (manual verification — memberships are private), announcements, privacy-friendly analytics, site settings, global search, cron tick endpoint.
- **Admin UI:** every section built (Creators, Videos, News, Events, Community, Hall of Fame, Supporters, Notifications, Analytics, Settings).
- **Tests:** 41 API tests passing (`npm test`). Production start verified (`npm start` = migrate → create admin → serve API + SPA).
- **Deploy:** `render.yaml` + `docs/DEPLOY.md` — Render (app) + Neon (DB) + R2/Supabase (media) + Brevo (SMTP) + cron-job.org (tick), all free tiers.
