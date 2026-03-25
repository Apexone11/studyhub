# Runbook: Outage (Railway / Availability)

> **When to use:** App is down, returning 502/503, or users can't log in.
> **Last updated:** 2026-03-24

---

## Step 1: Triage (2 min)

### Check Railway Status
- Go to [status.railway.app](https://status.railway.app)
- If Railway itself is degraded → **this is a platform incident, not your code**
- Note: Railway edge incidents can cause intermittent 502s even if your service looks healthy

### Check Your Services
1. **Backend health:** `curl -s https://<backend-domain>/health` → expect `{"status":"ok"}`
2. **Frontend:** `curl -s -o /dev/null -w "%{http_code}" https://<frontend-domain>/` → expect `200`
3. **Railway Dashboard:** check both services for crash loops, OOM kills, or failed deploys

### Check Database
- Railway Dashboard → PostgreSQL service → check connection count, CPU, memory
- If DB is unreachable, the backend health check will fail with a 500

---

## Step 2: Diagnose

### Common Causes and Quick Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Backend 502, health check fails | Crash loop (check Railway logs) | Check logs for startup error, fix, redeploy |
| Backend 502, health check passes intermittently | OOM or resource limits | Check memory usage in Railway metrics |
| Backend starts then dies | `validateSecrets()` failing — missing `JWT_SECRET` | Add/fix `JWT_SECRET` in Railway env vars |
| Frontend 502 | Build failed or `npm start` crashing | Check Railway build logs |
| Everything 502 | Railway platform outage | Wait for Railway to resolve, monitor status page |
| Login broken, other routes work | Auth middleware error | Check Sentry for auth-related 500s |
| DB connection refused | PostgreSQL service down or connection limit hit | Restart PostgreSQL service in Railway |
| Slow responses, timeouts | DB query bottleneck or ClamAV timeout | Check Railway metrics, consider `CLAMAV_DISABLED=true` temporarily |

### Read the Logs
- Railway Dashboard → Backend Service → Deployments → Click latest → View Logs
- Look for: uncaught exceptions, Prisma connection errors, port binding failures
- Sentry Dashboard → filter by last 1 hour → look for spike in errors

---

## Step 3: Fix

### If It's a Bad Deploy
1. Railway Dashboard → Backend Service → Deployments
2. Find the last known-good deployment
3. Click **Rollback** (Railway supports one-click rollback)
4. Wait for health check to pass
5. Verify: `curl https://<backend-domain>/health`

### If It's a Config/Env Issue
1. Railway Dashboard → Backend Service → Variables
2. Fix the variable (e.g., add missing `JWT_SECRET`, fix `DATABASE_URL`)
3. Save → auto-redeploy triggers
4. Watch logs for successful startup

### If It's a DB Issue
1. Railway Dashboard → PostgreSQL service → check if it's running
2. If stopped, click **Restart**
3. If connection limit hit: the backend will retry on next request
4. If data corruption → see [DB Restore Runbook](RUNBOOK_DB_RESTORE.md)

### If It's Railway Platform
1. **Do NOT** spam redeploy — it won't help and can make things worse
2. **Do NOT** rotate secrets or change config during a platform incident
3. Monitor [status.railway.app](https://status.railway.app)
4. Post status message to users (see template below)
5. Railway incidents typically resolve in 15-60 minutes

---

## Step 4: Verify Recovery

1. Health check: `curl https://<backend-domain>/health` → `{"status":"ok"}`
2. Login flow: open the app, log in, verify session works
3. Core feature: create or view a sheet, verify it loads
4. Sentry: confirm error rate has dropped back to baseline
5. Railway metrics: confirm CPU/memory are stable

---

## Step 5: Communicate

### During Outage
> **[StudyHub Status]** We're experiencing service disruptions. Some users may be unable to access StudyHub or log in. We're investigating and will update within 30 minutes.

### After Recovery
> **[StudyHub Status]** Service has been restored as of [time UTC]. All features are working normally. The issue was caused by [brief cause]. We apologize for the inconvenience.

### If Railway Platform Issue
> **[StudyHub Status]** Our hosting provider is experiencing issues that are affecting StudyHub availability. This is outside our control and we're monitoring for resolution. We'll update when service is restored.

---

## What NOT to Do During an Outage

- **Don't redeploy repeatedly** — if the first redeploy didn't fix it, the second won't either. Diagnose first.
- **Don't rotate secrets** — changing `JWT_SECRET` during an outage logs out all users and adds confusion.
- **Don't run migrations** — `prisma migrate deploy` during instability can leave the DB in a partial state.
- **Don't delete Railway services** — you'll lose logs, metrics, and deployment history.
- **Don't panic-push code** — untested hotfixes under pressure often introduce new bugs.

---

## Rollback Checklist

If you need to rollback:

1. [ ] Identify the last known-good deployment in Railway
2. [ ] Click Rollback
3. [ ] Wait for health check to pass (up to 60 seconds)
4. [ ] Verify login + core features work
5. [ ] Check Sentry for new errors
6. [ ] Post recovery status message
7. [ ] Investigate root cause in the failed deployment
