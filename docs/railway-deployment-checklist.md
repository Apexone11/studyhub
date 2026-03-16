# StudyHub Railway Deployment Checklist

This checklist is for Version 1 deployment on Railway with persistent uploads.

## 1. Create Railway services
- Create one Railway project for the backend API.
- Create one Railway project for the frontend, or add the frontend as a second service in the same Railway project.
- Add a Railway PostgreSQL service for the backend database.

## 2. Add persistent upload storage
- Add a Railway Volume to the backend service.
- Mount the Volume at `/data`.
- Set `UPLOADS_DIR=/data/uploads` on the backend service.

Why this matters:
- StudyHub stores avatars, sheet attachments, and feed attachments on disk.
- Without a mounted volume, files can disappear after restart or redeploy.

## 3. Configure backend environment variables
- `NODE_ENV=production`
- `PORT=4000`
- `DATABASE_URL=<Railway PostgreSQL connection string>`
- `DIRECT_DATABASE_URL=<required when DATABASE_URL uses Prisma Accelerate prisma://>`
- `JWT_SECRET=<64-byte random hex string>`
- `FRONTEND_URL=<your frontend production URL>`
- `FRONTEND_URL_ALT=<optional second frontend URL>`
- `UPLOADS_DIR=/data/uploads`
- `EMAIL_USER=<your SMTP username>`
- `EMAIL_PASS=<your SMTP password or app password>`
- `EMAIL_FROM=<the sender email>`
- `EMAIL_SERVICE=<for example gmail>`
- `SENTRY_DSN=<optional>`
- `SENTRY_TRACES_SAMPLE_RATE=0.1`
- `ADMIN_USERNAME=<your admin username>`
- `ADMIN_PASSWORD=<strong admin password>`
- `ADMIN_EMAIL=<admin email>`

## 4. Configure frontend environment variables
- `VITE_POSTHOG_KEY=<optional>`
- `VITE_POSTHOG_HOST=https://us.i.posthog.com`
- `VITE_CLARITY_PROJECT_ID=<optional>`
- `VITE_FRONTEND_SENTRY_DSN=<optional>`
- `VITE_FRONTEND_SENTRY_TRACES_SAMPLE_RATE=0.1`

If the frontend is hosted separately, make sure it points to the deployed backend URL.

## 5. Connect GitHub
- Connect the repo to Railway.
- Point the backend service at `backend/`.
- Point the frontend service at `frontend/studyhub-app/`.
- Keep the existing `railway.toml` files in those folders.

## 6. First deploy checks
- Confirm Railway build logs show `npx prisma generate` during build and `npx prisma migrate deploy` during pre-deploy for the backend.
- Open the backend root URL and confirm it returns the health payload.
- Register a user, verify email delivery, enable 2-step verification, upload a sheet attachment, and download it.
- Restart the backend service once and confirm the uploaded file still exists.

## 7. Security checks before launch
- Use real production secrets, not local `.env.example` placeholders.
- Keep `ALLOW_EPHEMERAL_UPLOADS` unset in production.
- Limit CORS to the real frontend domains.
- Turn on Sentry for backend and frontend if possible.
- Make sure the email inbox used for auth emails has app-password or SMTP security configured.

## 8. Prisma Accelerate on Railway
- Keep `DATABASE_URL` as the normal PostgreSQL URL unless you are intentionally enabling Accelerate.
- If you enable Prisma Accelerate, set `DATABASE_URL` to the `prisma://...` Accelerate URL.
- When using Accelerate, set `DIRECT_DATABASE_URL` to the direct PostgreSQL connection string so Prisma CLI commands and migrations still work.
- StudyHub now routes Prisma CLI commands through `backend/prisma.config.js`, so deploy-time migrations use `DIRECT_DATABASE_URL` when Accelerate is enabled.
- The app runtime only turns on the Accelerate extension when `DATABASE_URL` starts with `prisma://` or `prisma+postgres://`.
- Start with connection pooling only. Do not add query caching to auth, notifications, settings, or personalized feed reads until measured carefully.

## 9. Prisma Optimize
- Prisma Optimize is wired for local development only.
- Set `OPTIMIZE_API_KEY` in a local `.env` file when you want query analysis in development.
- Turn it on only when you are actively recording by setting `OPTIMIZE_ENABLE=true`.
- Leave `OPTIMIZE_ENABLE=false` for normal local development and for any load testing.
- Do not commit `OPTIMIZE_API_KEY`.
- Do not rely on Prisma Optimize as a production performance feature. Use it to find slow queries locally, then ship the query/index fixes.

## 10. 24-7 uptime settings
- Keep `Enable Serverless` turned off for the backend service if you do not want it to sleep after inactivity.
- Keep `Enable Serverless` turned off for the frontend service if you want the site warm at all times.
- Backend deploys now define `healthcheckPath = "/health"` and `restartPolicyType = "ALWAYS"` in `backend/railway.toml`.
- Frontend deploys now define `healthcheckPath = "/"` and `restartPolicyType = "ALWAYS"` in `frontend/studyhub-app/railway.toml`.
- Railway volumes remain required for uploads. Keep the backend volume mounted at `/data` and `UPLOADS_DIR=/data/uploads`.

## 11. Smoke and load checks
- Backend smoke: `docker exec studyhub-backend-1 sh -lc "cd /app && ADMIN_USERNAME=studyhub_owner ADMIN_PASSWORD=AdminPass123 node scripts/smokeRoutes.js"`
- Frontend lint: `npm --prefix frontend/studyhub-app run lint`
- Frontend build: `npm --prefix frontend/studyhub-app run build`
- Frontend bundle report: `npm --prefix frontend/studyhub-app run build:analyze`
- Backend load mix: `npm --prefix backend run load:test`

## 12. Go-live sanity check
- Create a post with an attachment and verify it appears in the feed.
- Expand the post, verify reactions/comments are visible, and confirm the download button only appears when downloads are allowed.
- Fork a sheet, submit a contribution, review it, and confirm notifications appear.
- Confirm account deletion and sheet/post deletion do not leave broken download links behind.
