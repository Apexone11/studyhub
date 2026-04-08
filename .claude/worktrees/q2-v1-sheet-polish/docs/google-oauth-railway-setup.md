# Google OAuth — Railway Production Setup

Google Sign-In is fully implemented in both the backend and frontend code.
The button is hidden on the live site because the environment variables are
not set on Railway. Follow these steps to activate it.

---

## Step 1 — Google Cloud Console: Add Production Redirect URIs

1. Open the Google Cloud Console → **API & Services → Credentials**.
2. Click the OAuth 2.0 Client ID named **Studyhub** (Client ID: `907042990468-…`).
3. Under **Authorized JavaScript origins**, add:
   - `https://getstudyhub.org`
   - `https://www.getstudyhub.org`
   (Keep the existing `https://www.getstudyhub.net` and `http://localhost:5173`.)
4. Under **Authorized redirect URIs**, add:
   - `https://getstudyhub.org`
   - `https://www.getstudyhub.org`
   (Keep the existing `http://localhost:5173`.)
5. Click **Save**. Changes may take 5 minutes to propagate.

---

## Step 2 — Railway: Set Backend Environment Variable

1. Open Railway dashboard → **Studyhub** project → **StudyHub Backend** service.
2. Go to the **Variables** tab.
3. Add (or verify) this variable:

   ```
   GOOGLE_CLIENT_ID=907042990468-v2uh3skincvnbdjlo6ail93pi62r0t7h.apps.googleusercontent.com
   ```

4. Click **Deploy** (or let Railway auto-redeploy).

---

## Step 3 — Railway: Set Frontend Environment Variable

The frontend reads its config from a runtime-config script generated at
container startup. The variable name must start with `VITE_`.

1. Open Railway dashboard → **StudyHub Frontend** service.
2. Go to the **Variables** tab.
3. Add this variable:

   ```
   VITE_GOOGLE_CLIENT_ID=907042990468-v2uh3skincvnbdjlo6ail93pi62r0t7h.apps.googleusercontent.com
   ```

4. Also verify the runtime-config generation. In the frontend Dockerfile or
   start script, ensure the entrypoint writes `window.__STUDYHUB_CONFIG__`
   with `GOOGLE_CLIENT_ID` included. The existing `config.js` already reads:
   ```js
   runtimeConfig.GOOGLE_CLIENT_ID ||
   import.meta.env.VITE_GOOGLE_CLIENT_ID ||
   ''
   ```
   If the frontend uses a static build (no runtime-config), the variable must
   be present at **build time** as `VITE_GOOGLE_CLIENT_ID`.

5. Trigger a redeploy.

---

## Step 4 — Verify

1. Open `https://getstudyhub.org/login` in an incognito window.
2. You should see a **"Sign in with Google"** button above the username/password form.
3. Click it → Google popup → select account → should land on `/feed`.
4. Open `https://getstudyhub.org/register` — Google button should appear there too.
5. Go to **Settings → Security** while logged in — Google link/unlink section should appear.

---

## How It Works (Reference)

| Layer | File | What it does |
|-------|------|--------------|
| Backend lib | `backend/src/lib/googleAuth.js` | Verifies Google ID tokens, user lookup |
| Backend route | `backend/src/routes/auth.js` | `POST /api/auth/google`, `POST /api/auth/google/complete` |
| Backend settings | `backend/src/routes/settings.js` | `POST /api/settings/google/link`, `PATCH /api/settings/google/unlink` |
| Frontend config | `frontend/studyhub-app/src/config.js` | Reads `GOOGLE_CLIENT_ID` from env/runtime |
| Frontend wrapper | `frontend/studyhub-app/src/App.jsx` | `<GoogleOAuthProvider>` wraps app when ID present |
| Login page | `frontend/studyhub-app/src/pages/auth/LoginPage.jsx` | `<GoogleLogin>` button, conditional on ID |
| Register page | `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx` | `<GoogleLogin>` button + course selection flow |
| Settings security | `frontend/studyhub-app/src/pages/settings/SecurityTab.jsx` | Link/unlink Google account |

---

## Security Notes

- Tokens are verified server-side with `google-auth-library` (audience check).
- Email collision protection: if a Google email matches an existing local account,
  the user must log in with their password first and link Google from Settings.
- Google-only accounts must set a password before unlinking Google.
- Rate limited: 20 Google auth attempts per 15 minutes.
