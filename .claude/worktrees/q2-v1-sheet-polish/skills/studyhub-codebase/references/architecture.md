# StudyHub Architecture

## Product snapshot

StudyHub is a student collaboration platform centered on course-specific study materials.
The main Version 1 features are:

- account registration and login
- verified email and password reset
- optional 2-step verification by email
- course enrollment and course requests
- study sheet creation, forking, contribution review, and downloads
- feed posts with comments, reactions, mentions, and attachment rules
- notifications, following, and public user profiles
- admin announcements, moderation, and dashboard views

## Stack

- Frontend: React 19, React Router 7, Vite 8
- Backend: Express 5 on Node.js
- Database: PostgreSQL with Prisma ORM
- Uploads: local or mounted storage under `UPLOADS_DIR`
- Deployment: Docker Compose for local development and Railway for hosted deployment
- Observability: Sentry and PostHog integrations are present

## Core domain model

### Users

- `User` stores username, password hash, role, email state, avatar, 2FA state, and lockout fields.
- Roles are mainly `student` and `admin`.
- Cookie-authenticated browser sessions are the primary web auth mechanism.

### Courses and schools

- `School` and `Course` support campus-specific discovery.
- `Enrollment` maps users to courses.
- `RequestedCourse` tracks missing-course requests.

### Study sheets

- `StudySheet` is the main collaborative artifact.
- A sheet belongs to a course and an author.
- Sheets can have optional file attachments.
- `allowDownloads` controls whether download UI and backend download access are allowed.
- Fork chains are modeled through `forkOf`, `forkSource`, and `forkChildren`.
- `SheetContribution` lets a fork owner propose changes back to the upstream sheet owner.

### Feed

- `FeedPost` supports general updates, optional attachments, course association, comments, and reactions.
- `FeedPostComment` and `FeedPostReaction` hold discussion state.
- Mentions trigger notifications.

### Notifications and follows

- `Notification` stores activity messages plus optional `linkPath`.
- `UserFollow` models follower and following relationships.

## Cross-cutting security rules

### Auth and request safety

- Browser auth uses secure cookies and backend auth helpers, not local-only trust.
- `backend/src/middleware/csrf.js` enforces CSRF protection for mutating cookie-authenticated requests.
- `backend/src/index.js` also checks origin or referer for cross-site mutation blocking.
- Many write-heavy or sensitive routes use `express-rate-limit`.

### Upload and download safety

- `backend/src/lib/storage.js` is the source of truth for upload path resolution and cleanup.
- Only files inside managed upload directories should ever be deleted or served.
- Avoid ad-hoc `path.join(...replace('/uploads/', ''))` patterns.
- Do not reintroduce raw `fs.unlinkSync` calls on user-derived paths outside the storage helper.

### Frontend HTML rendering

- Avoid raw `innerHTML`, `outerHTML`, or `dangerouslySetInnerHTML` with untrusted content.
- Use DOMPurify and structured DOM rendering where HTML is needed.

## Runtime behavior

- `backend/src/index.js` mounts all API routes, static uploads, CORS handling, origin checks, CSRF, and health endpoints.
- `backend/src/lib/bootstrap.js` prepares runtime data needed at startup.
- `backend/src/lib/prisma.js` centralizes Prisma client creation and optional Accelerate or Optimize extensions.
- `frontend/studyhub-app/src/App.jsx` lazy-loads routes and protects authenticated pages.
- `frontend/studyhub-app/src/lib/useLivePolling.js` provides visibility-aware polling for refresh-heavy pages.

## Testing and validation

### Frontend

- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix frontend/studyhub-app run build`

### Backend smoke

- Main end-to-end smoke flow lives in `backend/scripts/smokeRoutes.js`
- It covers auth, email verification, 2FA, sheets, feed, uploads, contribution review, and notifications.

### Load and burst checks

- `backend/scripts/loadTraffic.js` runs mixed read and authenticated traffic checks.
- Treat it as the main local pressure test before heavier traffic or deployment changes.
