# 🐉 Dragonz Central

The centralized digital home of **Dragonz** — a GTA RP crew and creator collective. Members, creators, live streams, videos, events, announcements, achievements and community in one place.

> Current status: **Phase 1 complete** (architecture, database, auth, core UI, homepage, members, profiles, admin foundation). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and roadmap.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 6, JavaScript, Tailwind CSS 4, React Router 7, TanStack Query 5 |
| Backend | Node.js 22, Express 5, zod, pino |
| Database | PostgreSQL 16, Drizzle ORM (SQL migrations) |
| Auth | Server-side sessions (HttpOnly cookie), Argon2id, CSRF double-submit |

## Quick start

Requirements: Node.js ≥ 22, PostgreSQL ≥ 14.

```bash
# 1. Install
npm install

# 2. Create a database
createdb dragonz_central        # or use a managed Postgres

# 3. Configure the API
cp server/.env.example server/.env
#   → set DATABASE_URL, AUTH_SECRET (48+ random chars), SEED_ADMIN_PASSWORD

# 4. Migrate + seed demo data
npm run db:migrate
npm run db:seed                  # add -- --reset to wipe and reseed content

# 5. Run (API on :4000, web on :5173 with /api proxied)
npm run dev
```

Open http://localhost:5173. Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (a SUPER_ADMIN) and visit `/admin`. In development, emails (verification, reset) are printed to the API console.

> ⚠ **Demo data:** seeded members, handles, videos and live streams are placeholders. Replace them with the real Dragonz roster from **Admin → Members** (or run the seed without content and add members manually).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode) + Vite dev server |
| `npm run build` | Production build of the web app → `client/dist` |
| `npm test` | API integration tests against `DATABASE_URL` in `server/.env.test` |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run db:generate -w server` | Generate a new migration after editing `server/src/db/schema.js` |
| `npm run db:seed` | Create super-admin + demo content |

Tests need a separate database: copy `server/.env` to `server/.env.test`, point `DATABASE_URL` at e.g. `dragonz_test`, and set `NODE_ENV=test`, `DISABLE_RATE_LIMIT=true`.

## Production

- Single-origin deployment: `npm run build`, then `NODE_ENV=production node server/src/server.js` serves the SPA and `/api` from one process (put Cloudflare or another CDN/WAF in front; set `TRUST_PROXY=1`).
- Run `npm run db:migrate` on each deploy (idempotent).
- The server refuses to start in production with unsafe settings (mock streaming, console email, non-https `APP_URL`, disabled rate limits).
- Use managed Postgres with automated backups / point-in-time recovery.

## Environment variables

Every variable is documented inline in [`server/.env.example`](server/.env.example) and [`client/.env.example`](client/.env.example). Never commit `.env`.

## Roles

`SUPER_ADMIN` (everything, incl. role changes) · `ADMIN` (members, content, users read, audit) · `MODERATOR` (community) · `CONTENT_MANAGER` (videos, news, events) · `USER`. Permissions live in `server/src/auth/permissions.js` and are enforced server-side.

## Deploying for free

See [docs/DEPLOY.md](docs/DEPLOY.md) — Render + Neon + R2/Supabase + Brevo + cron-job.org, step by step.
