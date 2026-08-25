# Get the Job — Chrome Extension

Save a job posting from any webpage straight into your Get the Job board. The
popup form posts directly to the same backend the web app uses
(`POST /api/jobs`), so saved jobs show up in the app immediately.

## Install (unpacked, for now — not published to the Chrome Web Store)

1. Open `chrome://extensions`.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select this `extension/` folder.
4. Click the extension's icon, then "Open settings" (or right-click the icon
   → Options) and set:
   - **Backend API base URL** — the same URL configured under
     *Developer API → SQL Backend Connection* in the web app
     (e.g. `https://your-backend.run.app/api`).
   - **Allowed Google accounts** — same list as the web app's
     `ALLOWED_EMAILS` env var. Defaults to the app's own default
     (`charlie@workbench-data.com, rankin@workbench-data.com`).
5. Saving settings will prompt you to grant the extension permission to
   reach that backend host — accept it.

## Using it

Click the extension icon on any job posting page, fill in / adjust the
pre-filled title and URL, and hit "Save to Get the Job."

## How auth works (and its limits)

The web app itself has no real server-side authentication today — sign-in is
a client-side Google Identity Services check against an email allowlist, and
`/api/*` has no auth middleware (see `backend/server.js`); the only gate is a
CORS origin allowlist. This extension matches that same posture rather than
inventing new security the rest of the app doesn't have:

- The popup reads the **email of the currently signed-in Chrome profile**
  (`chrome.identity.getProfileUserInfo`) and checks it against the
  extension's configured allowlist before showing the job form. This is a
  UX guard, not cryptographic verification — same trust level as the web
  app's client-side check.
- The backend's CORS allowlist was extended to accept `chrome-extension://`
  origins so the popup can call `POST /api/jobs` (see `backend/server.js`).
  This doesn't reduce security versus today: the API has no auth either way,
  and CORS only constrains browser `fetch`, not direct requests (e.g. curl).

If you want real security later, the natural next step is adding server-side
verification (a Google ID token check or a shared API key) to `/api/*` in
`backend/server.js` — at that point the extension would need to attach a
credential to its requests too.

## Files

- `manifest.json` — MV3 manifest.
- `popup.html` / `popup.js` / `popup.css` — the job-card form shown when you
  click the extension icon.
- `options.html` / `options.js` — settings page (backend URL, allowlist).
- `common.js` — shared config/storage helpers and the `POST /api/jobs` call,
  matching the `Job` shape in `frontend/types.ts` and `backend/schema.sql`.
- `icons/` — extension icons, generated to match the web app's brand colors.
