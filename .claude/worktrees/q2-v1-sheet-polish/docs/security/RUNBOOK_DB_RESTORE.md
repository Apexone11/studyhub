# Runbook: Database Backup & Restore

> **When to use:** Data corruption, accidental deletion, or need to recover to a known-good state.
> **Last updated:** 2026-03-24

---

## Where Backups Live

**Railway PostgreSQL** provides automatic daily backups:
- Railway Dashboard → PostgreSQL Service → Backups tab
- Retention period depends on your Railway plan
- Backups are point-in-time snapshots of the full database

**What's NOT backed up:**
- Uploaded files (avatars, attachments, school logos) — these live on the Railway volume at `/data/uploads`
- Environment variables — these are in Railway's config, not the database
- Redis/cache state — StudyHub doesn't use Redis, so this isn't a concern

---

## Before You Restore

### Assess the Damage

| Situation | Action |
|-----------|--------|
| A few rows were accidentally deleted | Consider a targeted fix (INSERT/UPDATE) rather than full restore |
| A bad migration corrupted a table | Restore from backup before the migration |
| Full DB is corrupted or unreachable | Create new DB from backup |
| You need to recover a specific user's data | Query the backup DB directly, then copy data to production |

### Stop Writes (Recommended)

To prevent new data from conflicting with the restore:
```
Railway → Backend → Variables → GUARDED_MODE=true → Save
```
This blocks all non-admin writes. Users can still read.

---

## Restore: Railway Dashboard Method

### Step 1: Create New Database from Backup

1. Railway Dashboard → PostgreSQL Service → **Backups** tab
2. Find the backup closest to (but before) the incident timestamp
3. Click **Restore** → this creates a new PostgreSQL instance from that backup
4. Note the new `DATABASE_URL` from the restored instance

### Step 2: Point Backend to Restored Database

1. Railway Dashboard → Backend Service → Variables
2. Update `DATABASE_URL` to the new restored database URL
3. If using Prisma Accelerate, also update `DIRECT_DATABASE_URL`
4. Save → auto-redeploy triggers

### Step 3: Run Migrations

The restored DB may be behind on schema changes if the backup predates recent deploys:

- Railway's `preDeployCommand` runs `npx prisma migrate deploy` automatically on redeploy
- Watch deploy logs to confirm migrations apply cleanly
- If migrations fail: the backup is from before a schema change — you may need to reconcile manually

### Step 4: Verify

1. Health check: `curl https://<backend-domain>/health` → `{"status":"ok"}`
2. Login: verify auth works (sessions are JWT-based, not DB-stored, so existing tokens still work)
3. Data: spot-check a few sheets, users, courses — confirm they match expected state
4. Recent data: anything created AFTER the backup timestamp will be **missing** — this is expected

### Step 5: Disable Guarded Mode

```
Railway → Backend → Variables → Remove GUARDED_MODE → Save
```

---

## Restore: Manual Method (CLI)

If you need more control:

### Step 1: Dump from Backup

```bash
# Get the backup DB connection string from Railway
pg_dump "$BACKUP_DATABASE_URL" --format=custom --file=studyhub_backup.dump
```

### Step 2: Restore to Target

```bash
# Restore to the production DB (or a new instance)
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="$TARGET_DATABASE_URL" \
  studyhub_backup.dump
```

### Step 3: Run Migrations

```bash
cd backend
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate deploy
```

### Step 4: Verify

```bash
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM \"User\";"
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM \"StudySheet\";"
```

---

## Partial Restore (Single Table / Rows)

If you only need to recover specific data:

1. Restore the backup to a **temporary** database (not production)
2. Query the temp DB for the data you need
3. INSERT/UPDATE into production manually
4. Drop the temp database when done

```bash
# Example: recover a deleted user
pg_dump "$BACKUP_DATABASE_URL" --table='"User"' --data-only --format=plain > user_data.sql
# Review user_data.sql, extract the rows you need
# Apply to production with care
```

---

## Post-Restore Verification Checklist

After any restore, walk through this:

1. [ ] Health check passes
2. [ ] User login works (email + Google OAuth)
3. [ ] Sheets page loads with data
4. [ ] Admin panel loads, review queue shows correct items
5. [ ] File uploads still work (uploads are on the volume, not in DB)
6. [ ] No Prisma migration errors in logs
7. [ ] Sentry: no new 500 errors
8. [ ] Guarded Mode disabled (if it was enabled)
9. [ ] Post status message if users were affected

---

## Data Loss Window

**Understand what you lose:**
- Railway daily backups mean up to **24 hours** of data could be lost in the worst case
- Anything created between the last backup and the incident is gone
- User uploads (files) are separate from the DB — a DB restore doesn't affect uploaded files
- JWT sessions are stateless — a DB restore doesn't log users out

**Mitigation:**
- For critical incidents, act fast — the sooner you restore, the smaller the data loss window
- Consider communicating the data loss window to affected users

---

## User Communication

### During Restore
> **[StudyHub Status]** We're performing database maintenance to resolve a data issue. The app will be in read-only mode briefly. We'll update when full access is restored.

### After Restore
> **[StudyHub Status]** Database maintenance is complete. All services are operating normally. Some content created between [start time] and [end time] UTC may need to be re-submitted. We apologize for the inconvenience.

---

## Rollback (Undo the Restore)

If the restore made things worse:

1. You still have the original (pre-restore) database if you created a new instance
2. Point `DATABASE_URL` back to the original database
3. Save → redeploy
4. If you restored in-place (destructive), you'll need another backup from before the restore
