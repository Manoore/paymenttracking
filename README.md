# Capture Hub (paymenttracking)

A private hub for saving things and finding them later. Finance is the first
module: payment proof, recurring bills, expenses, reimbursements, and check
deposits. The core "capture" model is built to grow into travel ideas, places,
products, and designs.

| Part | Tech | Hosted on |
|---|---|---|
| `backend/` | Node 20, Express 5, TypeScript, Mongoose | Render |
| `web/` | Next.js 16 (App Router), Tailwind 4, responsive + installable PWA | Vercel |
| `mobile/` | Flutter (Android + iOS) | App/Play stores or sideload |
| Database | MongoDB (Atlas); files in GridFS for now | MongoDB Atlas |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model, security model and roadmap.

## Run locally

```bash
# 1. API + local MongoDB (no Docker needed)
cd backend
cp .env.example .env        # then fill JWT secrets; MONGODB_URI below works with dev:db
npm install
npm run dev:db              # terminal 1: MongoDB on 27017 (data in backend/.devdb)
npm run dev                 # terminal 2: API on http://localhost:4000

# 2. Web
cd web
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:3000 – first visit lets you create your account

# 3. Mobile (Android emulator talks to your machine via 10.0.2.2)
cd mobile
flutter pub get
flutter run
```

For the local dev DB use
`MONGODB_URI=mongodb://127.0.0.1:27017/capturehub?replicaSet=testset&directConnection=true`.

Tests: `cd backend && npm test`, `cd mobile && flutter test`.

## Deploy

### 1. MongoDB Atlas
1. Create a cluster. M0 (free, 512 MB) is fine to start; files count toward that, so plan on M10 or moving files to R2/S3 as receipts pile up.
2. **Database Access**: create a user with `readWrite` on the `capturehub` database only, with a long random password.
3. **Network Access**: Render's shared plans have no fixed outbound IP, so you'll need `0.0.0.0/0`. The long password and TLS are what protect it. On paid Render plans, allow-list Render's static outbound IPs instead.
4. Copy the `mongodb+srv://…/capturehub` connection string.

### 2. API on Render
1. Render → **New → Blueprint** → select this repo (uses [`render.yaml`](render.yaml)).
2. When prompted, set `MONGODB_URI`, `CORS_ORIGINS` (your Vercel URL, e.g. `https://capture-hub.vercel.app`) and `WEB_APP_URL`. JWT and cron secrets are generated automatically.
3. Check `https://<service>.onrender.com/health` returns `{"ok":true}`.

### 3. Web on Vercel
1. Vercel → **Add New Project** → import this repo → **Root Directory: `web`**.
2. Environment variable: `NEXT_PUBLIC_API_URL=https://<service>.onrender.com`.
3. Deploy, open the site, and create your account. Sign-up closes automatically after the first account (`ALLOW_SIGNUP=false`).
4. If you add a custom domain later, update `CORS_ORIGINS` on Render.

### 4. Reminders
Add GitHub repo secrets `API_URL` (Render URL) and `CRON_SECRET` (copy from Render env).
[`reminders.yml`](.github/workflows/reminders.yml) runs daily and creates in-app notifications.
For email reminders, also set `RESEND_API_KEY` and `REMINDER_FROM_EMAIL` on Render.

### 4b. Push notifications (optional)
Run `npx web-push generate-vapid-keys` once and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
`VAPID_SUBJECT` (e.g. `mailto:you@example.com`) on Render. Then each person turns them on per device in
**Profile → Notifications**. On iPhone this works after adding the web app to the Home Screen (iOS 16.4+).

### 4c. Document reading (AI, optional)
Each space owner adds their own API key in **Profile → Document reading**: OpenAI, Anthropic (Claude), Google (Gemini),
or any OpenAI-compatible service by URL. Keys are encrypted (AES-256-GCM) with a key derived from
`JWT_REFRESH_SECRET`; set `SECRETS_KEY` (32+ random chars) on Render before you ever rotate JWT secrets.
Readings are cached per file, so the same receipt is never sent twice. A monthly limit caps usage.

### 5. Mobile
```bash
cd mobile
flutter build apk --release --dart-define=API_URL=https://<service>.onrender.com
flutter build ipa --release --dart-define=API_URL=https://<service>.onrender.com   # macOS + Xcode
```

## Backups (do this before storing real records)
Atlas backups cover the database **including GridFS files**, but the free M0 tier has no automated backups.
Until you're on a tier with backups, periodically run `mongodump --uri "$MONGODB_URI"` and keep the
archive somewhere safe (encrypted). Use **Reports → Export CSV** for a human-readable copy.
