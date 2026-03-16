# StudyHub

StudyHub is a student-focused collaboration platform for study sheets, notes, announcements, comments, forks, contributions, notifications, verified email, and 2-step verification.

## Project Overview
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL + Prisma
- Auth: cookie-based JWT sessions
- Storage: local Docker volume in development, persistent mounted volume in production

## Critical Team Setup
- Keep all real secrets in local or hosted environment variables only.
- Never commit passwords, tokens, SMTP credentials, database URLs, or production hostnames with secrets embedded.
- Use persistent storage for uploads in production.
- Run smoke and load checks before major deploys.
- Keep the encrypted access vault key offline and separate from this repository.

## Local Development
1. Install dependencies:

```bash
npm --prefix backend install
npm --prefix frontend/studyhub-app install
```

2. Create a local backend `.env` with your own values for:
- `PORT`
- `JWT_SECRET`
- `DATABASE_URL`
- `SHADOW_DATABASE_URL` (required by Prisma for migrations)

3. Run database migrations:

```bash
cd backend
npx prisma migrate dev --name init
```

4. Start the backend:

```bash
npm --prefix backend run dev
```

5. Start the frontend:

```bash
npm --prefix frontend/studyhub-app run dev
```

6. If you run the backend outside Docker in `NODE_ENV=production`, set `UPLOADS_DIR` first so uploads go to a persistent path.

## Docker (Always-On Dev Stack)
Before running Docker, copy the root `.env.example` to `.env` and choose your own local-only values for:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `DATABASE_URL`
- `SHADOW_DATABASE_URL`
- `UPLOADS_DIR`
- `PGADMIN_DEFAULT_EMAIL`
- `PGADMIN_DEFAULT_PASSWORD`

Do not reuse production secrets here, and do not commit the resulting `.env` file.

1. Build and start everything in the background:

```bash
docker compose up -d --build
```

2. Check running services:

```bash
docker compose ps
```

3. Stream logs when needed:

```bash
docker compose logs -f backend frontend db
```

4. Stop services:

```bash
docker compose down
```

5. All services are configured with `restart: unless-stopped`, so they come back automatically after reboot as long as Docker starts on login.
6. In Docker Desktop, turn on **Settings > General > Start Docker Desktop when you log in** to keep Docker always running.

## Production File Storage
- StudyHub refuses accidental ephemeral uploads in production unless you explicitly opt in with `ALLOW_EPHEMERAL_UPLOADS=true`.
- Set `UPLOADS_DIR` to persistent storage before deploying the backend.
- On Railway, mount a Volume at `/data` and use `UPLOADS_DIR=/data/uploads`.
- Feed attachments, sheet attachments, avatars, deletes, and download routes all use the same storage root.
- Railway deployment notes live in [docs/railway-deployment-checklist.md](docs/railway-deployment-checklist.md).

## Analytics and Monitoring
Telemetry is wired with optional providers:

- PostHog (traffic and events)
- Microsoft Clarity (session replay and heatmaps)
- Sentry (frontend and backend errors)

To enable them, copy `.env.example` files and set your keys:

- Root `.env.example` for Docker Compose values
- [frontend/studyhub-app/.env.example](frontend/studyhub-app/.env.example) for frontend local values
- [backend/.env.example](backend/.env.example) for backend local values

Never commit real passwords, API keys, or production URLs into any of those files.

After setting keys for Docker, restart the stack:

```bash
docker compose up -d --build
```

## Password Safety
- User passwords are never stored in plain text.
- Passwords are hashed with bcrypt in the backend.
- You can inspect usernames and password hashes in the database, but never the original passwords.

## Production Admin Bootstrap
- Set `ADMIN_USERNAME` yourself before running `npm run seed:admin`.
- If you leave `ADMIN_PASSWORD` blank, the script generates a one-time password and prints it once in the shell.
- If you set `ADMIN_PASSWORD` yourself, the script does not echo it back.

## Deployment Checks
Run these before a production push:

```bash
npm --prefix frontend/studyhub-app run lint
npm --prefix frontend/studyhub-app run build
npm --prefix backend run load:test
docker exec studyhub-backend-1 sh -lc "cd /app && ADMIN_USERNAME=studyhub_owner ADMIN_PASSWORD=AdminPass123 node scripts/smokeRoutes.js"
```

## Secure Access Vault
- Encrypted team access vault: [docs/project-access-vault.enc.txt](docs/project-access-vault.enc.txt)
- Generate a new vault with [scripts/generateAccessVault.ps1](scripts/generateAccessVault.ps1)
- Decrypt it with [scripts/decryptAccessVault.ps1](scripts/decryptAccessVault.ps1)
- Store the unlock key offline and separate from this repository.
- If the unlock key is ever exposed, rotate production credentials immediately.
- The vault is intended for trusted maintainers only.

## Notes
- Keep secrets only in local `.env` files or your production host secret manager.
- Do not commit credentials, API keys, private connection strings, or plaintext recovery notes.
- For production hosting, keep the backend, database, and upload volume on always-on infrastructure.
