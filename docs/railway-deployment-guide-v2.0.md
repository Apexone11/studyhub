<!-- markdownlint-disable MD022 MD024 MD026 MD029 MD031 MD032 MD034 MD040 MD060 -->

# StudyHub v2.0 -- Railway Deployment Guide

This guide walks you through deploying all v2.0 changes (encryption, library, pricing, playground, admin analytics, AI updates) to Railway step by step.

---

## Prerequisites

Before you begin, make sure you have:

- A Railway account with an existing StudyHub project (backend service + PostgreSQL database)
- Git installed and your StudyHub repo pushed to GitHub
- Access to the Railway dashboard at https://railway.app

---

## Step 1: Push All Code to GitHub

Open your terminal in the StudyHub project folder and run:

```bash
git add -A
git commit -m "v2.0: encryption, library, pricing, playground, admin analytics, AI updates"
git push origin main
```

If Railway is connected to your GitHub repo, it will auto-detect the push. If not, you will trigger a manual deploy in Step 4.

---

## Step 2: Generate Your Encryption Key

The new field-level encryption system needs a 256-bit (32-byte) key. Run this command in your terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This prints a 64-character hex string. **Copy it immediately** -- you will paste it into Railway in the next step.

Example output (yours will be different):
```
a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

---

## Step 3: Add Environment Variables in Railway

1. Open **https://railway.app** and go to your StudyHub project
2. Click on your **backend service** (the one running your Express API)
3. Click the **Variables** tab (it looks like a list of key-value pairs)
4. Click **+ New Variable** and add:

| Variable Name | Value |
|---|---|
| `FIELD_ENCRYPTION_KEY` | *(paste the 64-char hex string from Step 2)* |

5. Click **Save** or **Add** to confirm

Your existing variables (DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, etc.) should remain untouched.

**Important:** If you ever need to rotate this key later, add the old key as `FIELD_ENCRYPTION_KEY_PREV` before changing `FIELD_ENCRYPTION_KEY`. The system will automatically try both keys when decrypting.

---

## Step 4: Deploy the New Code

### If Railway auto-deploys from GitHub:

After your `git push` in Step 1, Railway should have already started a new deployment. Go to your backend service and check the **Deployments** tab. You should see a new build in progress or recently completed.

### If Railway does NOT auto-deploy:

1. Go to your backend service in Railway
2. Click the **Deployments** tab
3. Click **Deploy** or **Trigger Deploy** (the exact button depends on your setup)
4. Alternatively, go to **Settings > Source** and connect your GitHub repo if not already connected

### Watch the build logs:

1. Click on the active deployment to see build logs
2. Look for `npm install` completing successfully so the frontend and backend dependency trees finish installing cleanly
3. Look for the server starting message (e.g., "Server listening on port...")
4. If the build fails, check the logs for errors and fix them before proceeding

---

## Step 5: Run Database Migrations

Your v2.0 update includes 3 new database migrations that create the library tables, waitlist table, and email hash column. You need to run these on your production database.

### Option A: Using Railway's CLI

If you have the Railway CLI installed:

```bash
railway run npx prisma migrate deploy
```

### Option B: Using Railway's Shell

1. Go to your backend service in Railway
2. Click the **three-dot menu** (top right of the service card) or look for a **Shell** / **Terminal** option
3. In the Railway shell, run:

```bash
npx prisma migrate deploy
```

### Option C: Using the Railway Execute tab

1. Click on your backend service
2. Look for an **Execute** or **Shell** tab
3. Type and run:

```bash
npx prisma migrate deploy
```

### What to expect:

You should see output like:
```
3 migrations found in prisma/migrations

Applying migration `20260401000001_add_library_tables`
Applying migration `20260401000002_add_waitlist_table`
Applying migration `20260401000003_add_email_hash_column`

All migrations have been successfully applied.
```

If you see "already applied" for some migrations, that is fine -- it means they were already run.

---

## Step 6: Encrypt Existing Data

Now that the encryption key is set and migrations are applied, run the one-time encryption script to encrypt existing user emails, messages, and AI messages in your database.

### Using Railway Shell (same method as Step 5):

```bash
node backend/scripts/encryptExistingData.js
```

### What to expect:

```
Starting encryption of existing data...
Processing users... encrypted 42 of 42
Processing messages... encrypted 128 of 128
Processing AI messages... encrypted 67 of 67
Backfilling email hashes... updated 42 of 42
Encryption migration complete!
```

The exact numbers will match your data. If it says "0 of 0" for some categories, that just means you have no records of that type yet.

**Important:** This script is idempotent -- running it twice will not double-encrypt anything. It checks each record before encrypting.

---

## Step 7: Trigger a Final Redeploy

After running migrations and the encryption script, trigger one more redeploy to make sure everything is fresh:

1. Go to your backend service **Deployments** tab
2. Click **Redeploy** on the latest deployment (or push a small commit)

This ensures the server picks up the new database state cleanly.

---

## Step 8: Verify Everything Works

Open your StudyHub app in the browser and check each new feature:

### 8a. Health Check
- Visit your backend URL directly: `https://your-railway-url.up.railway.app/api/health`
- Should return a JSON response with status "ok"

### 8b. Login
- Log in with an existing account
- If login works, encryption is functioning correctly (the middleware is decrypting emails transparently)

### 8c. Library (New)
- Click **Library** in the sidebar
- You should see the catalog page with a search bar and subject chips
- Search for a book (e.g., "Pride and Prejudice")
- Click a book to see its detail page
- Click "Read Online" to open the embedded Google Books reader when a preview is available

### 8d. Pricing Page (New)
- Click **Pricing** in the sidebar
- You should see three tiers: Free, Pro ($4.99/mo), Institution
- Try joining the waitlist with an email -- should show a success message

### 8e. Playground (New)
- Click **Playground** in the sidebar
- Should show the "Coming Soon" page with a dark-themed mock editor

### 8f. Admin Analytics (New)
- Log in as an admin user
- Go to the Admin panel
- Click the **Analytics** tab
- You should see charts for User Growth, Content Activity, AI Usage, Moderation, and Content Breakdown
- Try switching between 7d / 30d / 90d / 1y time periods

### 8g. AI Assistant
- Open the AI bubble or go to the /ai page
- Send a message -- verify the daily limit is now 10 for free users (was 30)
- If you are on a library page, the AI should have book-aware context chips

### 8h. Verify Encryption in Database (Optional)

If you want to confirm data is actually encrypted, use the Railway shell:

```bash
npx prisma studio
```

Or run a raw query:

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.raw = p;
p.\$queryRaw\`SELECT id, email FROM \"User\" LIMIT 3\`.then(r => {
  console.log(r);
  process.exit(0);
});
"
```

Encrypted emails will look like: `v1:ab12cd34...:ef56gh78...:ij90kl12...`

If you see plaintext emails, the encryption script from Step 6 may not have run successfully -- try running it again.

---

## Troubleshooting

### Build fails with "module not found"
- Check that the frontend install completed and `recharts` is present in `frontend/studyhub-app/package.json` under `dependencies`
- Railway runs `npm install` automatically during build

### "relation does not exist" errors
- Migrations have not been applied. Go back to Step 5 and run `npx prisma migrate deploy`

### Login fails after encryption
- Check that `FIELD_ENCRYPTION_KEY` is set correctly in Railway Variables
- The key must be exactly 64 hex characters (no spaces, no quotes around it in Railway)
- Try running the encryption script again (Step 6)

### Library search returns no results
- The Google Books API is external. If you use `GOOGLE_BOOKS_API_KEY`, verify it is configured correctly in Railway Variables.
- Check Railway logs for any network errors when calling the Google Books API
- The first search may be slow (cache is cold), subsequent searches are cached for 1 hour

### Charts show no data on Analytics tab
- This is normal if your database has very few records
- The charts query by time period -- try "1y" (1 year) to capture all data

### Embedded reader is unavailable
- Not all Google Books titles expose embeddable previews
- Check the book detail page. If there is no "Read Online" button, open the title directly on Google Books instead.

---

## Environment Variables Reference

Here is the full list of environment variables your Railway backend service should have:

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Railway) | Yes |
| `JWT_SECRET` | Secret for signing session tokens | Yes |
| `ANTHROPIC_API_KEY` | Claude API key for Hub AI | Yes |
| `FIELD_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM encryption | Yes (new in v2.0) |
| `FIELD_ENCRYPTION_KEY_PREV` | Previous encryption key (only needed during key rotation) | No |
| `NODE_ENV` | Set to "production" | Yes |
| `PORT` | Server port (Railway sets this automatically) | Auto |
| `FRONTEND_URL` | Your frontend URL for CORS | Yes |
| `SENTRY_DSN` | Sentry error tracking (if configured) | No |

---

## Summary

1. Push code to GitHub
2. Generate encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. Add `FIELD_ENCRYPTION_KEY` to Railway Variables
4. Wait for (or trigger) deployment
5. Run `npx prisma migrate deploy` in Railway shell
6. Run `node backend/scripts/encryptExistingData.js` in Railway shell
7. Redeploy once more
8. Verify all features work

You are all set. Send me screenshots as you go through each step and I will help you troubleshoot anything that comes up.
