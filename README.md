# StudyHub

StudyHub is a student-focused web app where users can register, log in, and collaborate around course study materials.

## Project Overview
- Frontend built with React and Vite
- Backend API built with Node.js and Express
- PostgreSQL database managed through Prisma
- Cookie-based JWT authentication for user sessions

## Main User Flow
1. Create an account and select enrolled courses during registration
2. Log in — lands on the activity feed (`/feed`)
3. Browse and search study sheets (`/sheets`)
4. View a sheet with rendered Markdown, table of contents, and reading progress
5. Star sheets, fork them with a custom title, or download as `.md`
6. Upload your own sheets directly through the site (`/sheets/upload`)

## Algorithms

### Course Recommendation Engine
Collaborative filtering — finds users with similar enrollments and
recommends courses they take that you don't have yet. Falls back to
globally popular courses for new users with no enrollments.

`GET /api/courses/recommendations` — returns top 6 recommendations with scores

### Missing Course Tracker  
When a user submits a course not in our database, it gets logged with
a request count. Once a course hits **3 requests** it is auto-flagged
for admin review and added to the next seed cycle.

`POST /api/courses/request` — submit an unknown course  
`GET  /api/courses/requested` — admin view of all requested courses

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

## Docker (Always-On Dev Stack)
Before running Docker, copy the root `.env.example` to `.env` and choose your own local-only values for:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `DATABASE_URL`
- `SHADOW_DATABASE_URL`
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

## Database Admin UI (pgAdmin)
StudyHub now includes pgAdmin in Docker for viewing tables, users, and records.

1. Open pgAdmin at `http://localhost:5050`
2. Sign in with the values from your local root `.env`:
	- Email: `PGADMIN_DEFAULT_EMAIL`
	- Password: `PGADMIN_DEFAULT_PASSWORD`
3. Add a server in pgAdmin:
	- Host: `db`
	- Port: `5432`
	- Username: `studyhub`
	- Password: `POSTGRES_PASSWORD`
	- Database: `studyhub`

## Analytics and Monitoring
Telemetry is now wired in the app with optional providers:
- PostHog (traffic/events)
- Microsoft Clarity (session replay/heatmaps)
- Sentry (frontend + backend errors)

To enable them, copy `.env.example` files and set your keys:
- Root `.env.example` (Docker Compose values)
- `frontend/studyhub-app/.env.example` (frontend local values)
- `backend/.env.example` (backend local values)

Never commit real passwords, API keys, or production URLs into any of those files.

After setting keys for Docker, restart the stack:

```bash
docker compose up -d --build
```

## Password Safety
- User passwords are never stored in plain text.
- Passwords are hashed with bcrypt in the backend.
- You can view usernames and password hashes in the database, but never the original passwords.

## Production Admin Bootstrap
- Set `ADMIN_USERNAME` yourself before running `npm run seed:admin`.
- If you leave `ADMIN_PASSWORD` blank, the script will generate a one-time password and print it once in the shell.
- If you set `ADMIN_PASSWORD` yourself, the script will not echo it back.

## Notes
- Keep secrets only in local `.env` files.
- Do not commit credentials, API keys, or private connection strings.
