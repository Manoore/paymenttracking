# Architecture

## Principles
1. **Capture first, structure later.** Anything can be saved quickly into the Inbox and filed later.
2. **One core record, typed extensions.** Every item is a `Capture`. Common fields (who, what, when, where, how much) live at the top level so search, filters and reports work across all types. Each module adds its own sub-document.
3. **Workspace-scoped from day one.** Every record belongs to a workspace and has a creator and a visibility. The MVP has one personal workspace; family sharing adds members, not a rebuild.
4. **Swappable infrastructure.** Files go through a storage interface, search goes through one query builder, and auth tokens follow standard JWT/refresh patterns, so any of these can be hardened later without touching features.

## System

```
 Browser (Vercel, Next.js) ──┐  short-lived access token (memory)
   └─ /api/session/* (Vercel)│  refresh token in httpOnly cookie
                             ▼
 Flutter app ──────────► Render: Express API ───► MongoDB Atlas
   refresh token in          /api/v1/*             captures, schedules, users…
   Keychain/Keystore         /files/:id?sig=…      GridFS bucket "files"
                             /internal/jobs/*  ◄── GitHub Actions cron (reminders)
```

The browser calls Render directly, not through a Vercel proxy, because Vercel
functions cap request and response bodies at about 4.5 MB, which is too small
for phone photos. Images are downscaled on the device before upload (2400px),
and files are served through signed URLs that expire after 1 hour.

## Data model (MongoDB)

| Collection | Purpose |
|---|---|
| `users` | email, bcrypt hash, name, default workspace |
| `workspaces` | `personal` or `family`, owner, default currency |
| `memberships` | (workspace, user, role: owner/editor/viewer) – family sharing hook |
| `refreshtokens` | HMAC of opaque refresh tokens, rotation family, TTL index |
| `captures` | everything saved (see below) |
| `attachments` | file metadata + `storage.{driver,key}`; bytes in GridFS |
| `recurringschedules` | frequency, anchor day, next due date, reminder window |
| `notifications` | in-app reminders (due soon / overdue) |

`Capture`:
```
workspaceId, createdBy, visibility (workspace|private), type, filed (false = Inbox)
title, notes, tags[], category, url, source
counterparty, amountMinor (integer cents), currency, occurredAt, property, trip
payment  { method, confirmationNumber, scheduleId, dueDate }
expense  { project, paymentMethod, reimbursable, reimbursement { organization, status, submittedAt, amountReimbursedMinor, reimbursedAt } }
deposit  { checkNumber, bankAccount, cleared, clearedAt }
attachmentIds[], links[{ captureId, relation }], extractedText, deletedAt (soft delete)
```

**Adding a module** (e.g. Places): add `'place'` to `CAPTURE_TYPES`, add a
`place { address, geo, cuisine }` sub-document, then add form fields and a
screen. Existing records, search, tags, links and attachments work unchanged.

## Security model
- Passwords: bcrypt (cost 12), with a constant-time path for unknown emails. Auth endpoints are rate-limited.
- Access JWT (15 min) plus an opaque refresh token (30 days) that rotates on every use. Reusing an old token outside a 30-second grace window revokes the whole session family.
- Every data query goes through `scope(req)`: workspace membership + visibility + not deleted. MongoDB has no row-level security, so this is the equivalent and is covered by an isolation test.
- Uploads: 15 MB limit, file signatures checked against an allow-list (images, PDF, text), stored privately. Files are served with `nosniff` + a sandbox CSP.
- CORS allow-list, helmet headers, secrets only in env, and log redaction for auth headers, passwords and tokens.
- CSV export guards against spreadsheet formula injection.

## Roadmap / hardening path
| Next | Why |
|---|---|
| Text extraction (OCR) for images/PDFs, feeding `extractedText` | Search inside screenshots; suggest amount/payee for review |
| Move files to Cloudflare R2 / S3 (new `FileStorage` driver) | Atlas storage is costly; lifecycle + backups for files |
| Atlas Search (then vector search) behind the same `q` param | Fuzzy and semantic search ("that hotel near the trail") |
| Family workspace: invite flow + role management UI | Add Archna; roles already enforced by `requireWrite` |
| Android share-sheet intent + iOS share extension | Save from any app in two taps |
| Push notifications (FCM/APNs) alongside email | Reminder delivery on phone |
| Reimbursement PDF packet (summary + receipts) | Submit to work / India Club in one file |
| MFA (TOTP / passkeys), audit log, encrypted field for account numbers | Harden before storing more sensitive data |
