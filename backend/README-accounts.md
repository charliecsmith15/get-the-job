# Real accounts + demo login

This replaces the earlier "separate deployment" idea. There's now one
deployment with real per-account logins — your demo account is simply one
of the accounts, signed in with its own Google account, seeing only its own
(seeded, sample) data.

## What changed

- New `accounts` table; every table (`jobs`, `notes`, `resumes`,
  `context_resources`, `journal_entries`, `interview_questions`,
  `job_analyses`, `preferences`) now has an `"accountId"` column and every
  query is scoped by it.
- The backend verifies the Google ID token from the frontend's existing
  Sign-In button on every `/api/*` request (`backend/server.js`,
  `requireAuth`) instead of trusting an unauthenticated, unscoped API.
  `ALLOWED_EMAILS` (env var) is the real, server-side allowlist now — the
  matching frontend list is just a client-side shortcut for a faster
  "denied" screen.
- `frontend/components/LoginScreen.tsx`, `App.tsx`, and
  `services/api.ts` were updated to capture and send that ID token.

## One-time setup

1. **Create a dedicated Google account for demos** (e.g. a new Gmail), if
   you don't already have one in mind. This is the login you'll hand out
   or use yourself when showing the app — there's no separate
   username/password, just this Google account.

2. **Back up your database**, then open `backend/migrate_to_accounts.sql`
   and replace `REPLACE_WITH_YOUR_DEMO_ACCOUNT_EMAIL@gmail.com` with that
   account's real email. Run the file against your existing database:

   ```bash
   psql "host=127.0.0.1 dbname=jobsearch user=jobsearch" -f backend/migrate_to_accounts.sql
   ```

   This creates your account and the demo account, moves all of today's
   existing data to your account (nothing changes for you), and seeds the
   demo account with sample jobs/notes/resumes/etc.

3. **Add the demo email to both allowlists** — they must match:
   - `backend/cloudbuild.yaml` → `_ALLOWED_EMAILS`
   - `frontend/cloudbuild.yaml` → `_ALLOWED_EMAILS`

4. **Redeploy both services**:

   ```bash
   gcloud builds submit --config backend/cloudbuild.yaml
   gcloud builds submit --config frontend/cloudbuild.yaml
   ```

## How to actually show the demo

Open the app's normal URL and sign in with the dedicated demo Google
account (either you drive it signed in as that account, or share that
account's Google credentials with whoever's viewing it). They'll see only
the seeded sample data — your real data lives under your own account and
is never visible from theirs, and vice versa.

To reset the demo back to a clean state after someone's poked around in
it, just re-run `migrate_to_accounts.sql` — step 7 deletes and re-inserts
only the demo account's rows.

## Still worth knowing

- Google ID tokens expire after about an hour. There's no silent refresh
  yet — if a session goes stale mid-demo, the app will prompt a re-sign-in
  (a 401 from the backend clears the stored token and reloads the page).
  Fine for a live demo; would be worth smoothing out before a wider
  rollout.
- The Vertex AI proxy route is unchanged — it's still gated only by the
  shared `PROXY_HEADER`, not per-account, and still bills every user's AI
  calls to your GCP project under one shared rate limit. Real per-account
  AI cost attribution/limits are a separate piece of work if you go beyond
  a couple of trusted accounts.
- The Chrome extension (`extension/`) still calls `/api/jobs` etc. directly
  and was not updated to send a bearer token — it will start getting 401s
  once this deploys. If you use the extension yourself, it needs the same
  ID-token treatment as the frontend before it'll work again.
