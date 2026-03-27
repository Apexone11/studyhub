# Runbook: Secrets Rotation

> **When to use:** A secret may be compromised, or you need to rotate credentials as a precaution.
> **Last updated:** 2026-03-24

---

## Secrets Inventory

| Secret | Location | Rotation Impact |
|--------|----------|-----------------|
| `JWT_SECRET` | Railway Backend env vars | **All users logged out** — every active session invalidated |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console + Railway Backend env vars | Google OAuth login broken until updated in both places |
| `RESEND_API_KEY` | Resend dashboard + Railway Backend env vars | Email delivery stops until updated |
| `RESEND_WEBHOOK_SECRET` | Resend dashboard + Railway Backend env vars | Webhook signature validation fails until updated |
| `DATABASE_URL` | Railway auto-injected (PostgreSQL service) | Backend can't connect to DB until updated |
| `OPENAI_API_KEY` | OpenAI dashboard + Railway Backend env vars | Content moderation disabled (non-blocking — moderation is fire-and-forget) |

---

## Rotating JWT_SECRET

**Impact:** All active user sessions are immediately invalidated. Every user must log in again. No data loss.

### Steps

1. **Generate a new secret** (64-char hex minimum):
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

2. **Update in Railway:**
   - Railway Dashboard → Backend Service → Variables
   - Find `JWT_SECRET` → paste new value → Save
   - Railway auto-redeploys

3. **Wait for health check:**
   - Watch Railway deploy logs for successful startup
   - `validateSecrets()` runs at boot — if the new secret is too short (<32 chars), the server won't start

4. **Verify:**
   - `curl https://<backend-domain>/health` → `{"status":"ok"}`
   - Open the app → you should be logged out → log in again → verify session works

### Rollback
If the new secret causes issues (shouldn't happen, but just in case):
- Set `JWT_SECRET` back to the old value in Railway → Save
- Users who logged in with the new secret will be logged out again
- **Only roll back if you're certain the old secret isn't compromised**

---

## Rotating Google OAuth Credentials

**Impact:** Google OAuth login broken during the rotation window (typically < 2 min).

### Steps

1. **Google Cloud Console:**
   - Go to [console.cloud.google.com](https://console.cloud.google.com)
   - APIs & Services → Credentials → OAuth 2.0 Client IDs
   - Click your StudyHub client → **Create new secret** (don't delete the old one yet)

2. **Update Backend:**
   - Railway Dashboard → Backend Service → Variables
   - Update `GOOGLE_CLIENT_ID` (if changed) and `GOOGLE_CLIENT_SECRET`
   - Save → auto-redeploy

3. **Update Frontend** (if client ID changed):
   - Railway Dashboard → Frontend Service → Variables
   - Update `VITE_GOOGLE_CLIENT_ID`
   - Save → triggers rebuild (frontend env vars are baked at build time)

4. **Verify:**
   - Open app → try Google OAuth login → should work
   - Check Sentry for any auth-related errors

5. **Delete old secret:**
   - Back in Google Cloud Console → delete the old client secret
   - This ensures the old secret can't be used anymore

### Rollback
- Restore the old secret in Railway → Save
- If you already deleted the old secret in Google Console, you'll need to use the new one

---

## Rotating Resend API Key

**Impact:** Email delivery stops until the new key is active. Non-blocking for core app functionality.

### Steps

1. **Resend Dashboard:**
   - Go to [resend.com/api-keys](https://resend.com/api-keys)
   - Create a new API key with the same permissions
   - Copy the key (shown only once)

2. **Update Backend:**
   - Railway Dashboard → Backend Service → Variables
   - Update `RESEND_API_KEY` → Save → auto-redeploy

3. **Verify:**
   - Trigger a test email (e.g., password reset flow)
   - Check Resend dashboard for delivery

4. **Revoke old key:**
   - Resend Dashboard → API Keys → delete the old key

### Rollback
- If the new key doesn't work, restore the old key in Railway (if not yet revoked in Resend)

---

## Rotating Resend Webhook Secret

**Impact:** Webhook events from Resend will fail signature validation until updated.

### Steps

1. **Resend Dashboard:**
   - Webhooks → your endpoint → rotate signing secret
   - Copy the new secret

2. **Update Backend:**
   - Railway Dashboard → Backend Service → Variables
   - Update `RESEND_WEBHOOK_SECRET` → Save

3. **Verify:**
   - Trigger an email → check that the webhook delivery succeeds (Resend shows delivery status)

---

## Rotating Database Password

**Impact:** Backend loses DB connection until updated. **SEV1 — do this during low traffic.**

### Steps

1. **Railway Dashboard → PostgreSQL Service:**
   - Settings → Generate new password (or use Railway's credential rotation)
   - Copy the new `DATABASE_URL`

2. **Update Backend:**
   - Railway Dashboard → Backend Service → Variables
   - Update `DATABASE_URL` (and `DIRECT_DATABASE_URL` if using Prisma Accelerate)
   - Save → auto-redeploy

3. **Verify:**
   - Watch deploy logs — Prisma should connect successfully
   - `curl https://<backend-domain>/health` → `{"status":"ok"}`
   - Test a DB-dependent route (e.g., load sheets page)

### Rollback
- If the backend can't connect, check the `DATABASE_URL` format
- Railway PostgreSQL URLs follow: `postgresql://user:password@host:port/dbname`
- The old password may still work briefly after rotation (depends on Railway's implementation)

---

## Rotating OpenAI API Key

**Impact:** Content moderation disabled until updated. Non-blocking — moderation is async fire-and-forget.

### Steps

1. **OpenAI Dashboard:**
   - [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - Create new key → copy

2. **Update Backend:**
   - Railway Dashboard → Backend Service → Variables
   - Update `OPENAI_API_KEY` → Save

3. **Revoke old key** in OpenAI dashboard

---

## Confirming Rotation Worked

After any rotation:

1. [ ] Health check passes: `curl https://<backend-domain>/health`
2. [ ] Login works (email + password)
3. [ ] Google OAuth works (if rotated)
4. [ ] Email delivery works (if rotated) — trigger a password reset
5. [ ] No new errors in Sentry in the 5 minutes after rotation
6. [ ] Post status update if users were affected (logged out, etc.)

---

## Emergency: Multiple Secrets Compromised

If you suspect multiple secrets were exposed (e.g., `.env` file leaked):

1. **Activate Guarded Mode:** `GUARDED_MODE=true` → blocks writes while you rotate
2. **Rotate in this order:**
   - `JWT_SECRET` (logs out all users, stops any active attacker sessions)
   - `DATABASE_URL` (if DB credentials were in the leak)
   - `RESEND_API_KEY` (prevents attacker from sending emails as you)
   - `GOOGLE_CLIENT_SECRET`
   - `OPENAI_API_KEY`
3. **Verify each one** before moving to the next
4. **Disable Guarded Mode** when done
5. **Post status message** explaining the forced logout
6. Follow [Security Runbook](RUNBOOK_SECURITY.md) for full investigation
