# StudyHub

StudyHub is a student-focused web app where users can register, log in, and collaborate around course study materials.

## Project Overview
- Frontend built with React and Vite
- Backend API built with Node.js and Express
- PostgreSQL database managed through Prisma
- JWT-based authentication for user sessions

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

## Notes
- Keep secrets only in local `.env` files.
- Do not commit credentials, API keys, or private connection strings.