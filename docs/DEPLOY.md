# Deploy Dragonz Central for free

One path, five free accounts. The website (frontend) and the API (backend) run together as **one** Render service, so you get **one link to share**.

| Step | Service | What it does |
|---|---|---|
| 1 | GitHub | Holds your code (private repo) so Render can build it |
| 2 | Neon | The database (free Postgres) |
| 3 | Supabase | Stores uploaded images (avatars, banners, posts) |
| 4 | Render | Runs the site + API → gives you `https://….onrender.com` |
| 5 | cron-job.org | Wakes the site every 10 min so live checks keep running |

Keep a notepad open **outside** the project folder to paste values into. Never commit it and never share it.

---

## Step 1 — Put the code on GitHub (private)

1. Install **Git for Windows** (git-scm.com → Download → defaults) if `git --version` in the VS Code terminal gives an error. Restart VS Code after installing.
2. Create a free account at github.com if you don't have one.
3. In VS Code open the **Source Control** panel (left bar, branch icon) → **Initialize Repository**.
4. **Before committing, check the file list**: there must be **no `.env`** file in it (only `.env.example`). `node_modules` must not be there either. The `.gitignore` already takes care of this.
5. Type a message like `first deploy` → **Commit** (if asked to stage all changes, choose **Yes**).
6. Click **Publish Branch** → sign in to GitHub → choose **Publish to GitHub private repository**.

## Step 2 — Database: Neon

1. neon.com → sign up → **Create project**: name `dragonz-central`, region **AWS Asia Pacific (Singapore)**.
2. Dashboard → **Connect** → turn **Connection pooling OFF** → copy the connection string:
   `postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   → save it in your notepad as **DATABASE_URL**.

The tables are created automatically when the site starts.

## Step 3 — Images: Supabase Storage

1. supabase.com → sign up → **New project** (any name, region **Southeast Asia (Singapore)** or **South Asia (Mumbai)**, set any DB password — we don't use their DB).
2. **Storage → New bucket** → name `dragonz-media` → switch **Public bucket ON** → Create.
3. **Project Settings → Storage → S3 Connection**:
   - **Endpoint** → `S3_ENDPOINT` (looks like `https://abcd1234.supabase.co/storage/v1/s3`)
   - **Region** → `S3_REGION` (e.g. `ap-southeast-1`)
   - **New access key** → copy **Access key ID** → `S3_ACCESS_KEY_ID` and **Secret access key** → `S3_SECRET_ACCESS_KEY` (shown once!)
4. `S3_BUCKET` = `dragonz-media`
5. `MEDIA_PUBLIC_URL` = `https://abcd1234.supabase.co/storage/v1/object/public/dragonz-media` (same `abcd1234` as the endpoint, no `/` at the end).

## Step 4 — Website + API: Render

1. render.com → **Sign in with GitHub**.
2. **New → Blueprint** → pick your `dragonz-central` repo → Render reads `render.yaml`.
3. Fill in the values it asks for:
   - `APP_URL` → `https://dragonz-central.onrender.com` (if that name is taken Render adds letters — you'll fix it in step 4.6)
   - `DATABASE_URL` → from step 2
   - `YOUTUBE_API_KEY` → same key as in your local `server/.env`
   - `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `MEDIA_PUBLIC_URL` → from step 3
   - `SEED_ADMIN_EMAIL` → your email; `SEED_ADMIN_PASSWORD` → a **new** strong password (12+ characters, not your local one)
4. **Apply**. The first build takes 5–10 minutes. Watch **Logs**; success looks like `✔ migrations applied`, `✔ super-admin created`, `Dragonz Central API listening`.
5. Open the URL shown at the top of the service page. You should see the DRZ home page.
6. If the real URL differs from what you typed for `APP_URL`: **Environment → APP_URL → edit → Save changes** (it redeploys).

## Step 5 — First login + add your crew

1. Open `https://YOUR-APP.onrender.com/login` and sign in with the admin email/password.
2. Render → **Environment** → delete `SEED_ADMIN_PASSWORD` → Save (the account already exists).
3. Admin → Members → add members (photo, bio, YouTube link). Admin → Live integrations → **Sync now**. Admin → Videos → star the videos for the home page.

(The production database starts empty — your local test data is not copied.)

## Step 6 — Keep it awake: cron-job.org

Render's free plan sleeps after 15 minutes without visitors (first visit then takes ~50 s).

1. Render → **Environment** → reveal `CRON_SECRET` → copy it.
2. cron-job.org → free account → **Create cronjob**:
   - URL: `https://YOUR-APP.onrender.com/api/cron/tick`
   - Every **10 minutes**
   - **Advanced → Headers → Add**: key `Authorization`, value `Bearer ` + the CRON_SECRET (a space after Bearer)
3. **Save** → **Test run** → should show **200 OK**.

## Step 7 — Share it 🎉

Your link is `https://YOUR-APP.onrender.com`. Every `git push` (VS Code: Commit → **Sync Changes**) redeploys automatically.

---

## Later (optional)

**Emails** (verification, password reset, live alerts): Render's free plan **blocks SMTP ports**, so use Brevo's HTTPS API. brevo.com → verify a sender (Settings → Senders) → **Settings → SMTP & API → API Keys → Generate a new API key**. In Render → Environment set `EMAIL_PROVIDER=brevo`, `EMAIL_API_KEY=<the API key>`, `EMAIL_FROM="Dragonz Central <your-verified-sender>"`.

**Kick**: add `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` in Render → Environment.

**Custom domain** (e.g. `central.drzofficial.in`): Render → Settings → Custom domains → add the CNAME at your DNS provider → set `APP_URL` to the new address.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Log says `Unsafe production configuration` / `Invalid environment` | It names the exact variable that's missing or wrong. |
| `migration failed` | Re-copy `DATABASE_URL` from Neon with pooling OFF and `?sslmode=require`. |
| Image upload fails | Bucket must be **Public**; check all `S3_*` values; `MEDIA_PUBLIC_URL` without trailing `/`. |
| Can't log in / "Security token missing" | `APP_URL` must exactly match the address bar (https, no trailing `/`). |
| Page takes ~50 s the first time | The free instance was asleep; step 6 keeps this rare. |
