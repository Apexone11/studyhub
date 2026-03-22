# StudyHub Dependency Tracker

Tracks all third-party libraries, their purpose, and update status.

---

## Frontend Dependencies

| Package | Version | Purpose | Added |
|---------|---------|---------|-------|
| react | ^19.2.0 | UI framework | v1.0 |
| react-dom | ^19.2.0 | React DOM rendering | v1.0 |
| react-router-dom | ^7.13.1 | Client-side routing | v1.0 |
| @react-oauth/google | ^0.13.4 | Google OAuth integration | v1.5.0-beta |
| animejs | ^4.3.6 | Animation library | v1.5.0-beta |
| dompurify | ^3.3.3 | HTML sanitization | v1.0 |
| @sentry/react | ^10.43.0 | Error tracking | v1.0 |
| posthog-js | ^1.360.2 | Product analytics | v1.0 |
| react-joyride | ^2.9.3 | Tutorial/onboarding popups | v1.5.0-beta |
| marked | ^17.0.5 | Markdown to HTML rendering | v1.5.0-beta |
| react-easy-crop | ^5.1.2 | Avatar circle crop with zoom | v1.5.0-beta |

## Backend Dependencies

| Package | Version | Purpose | Added |
|---------|---------|---------|-------|
| express | ^5.2.1 | Web framework | v1.0 |
| @prisma/client | ^6.19.2 | Database ORM | v1.0 |
| bcryptjs | ^3.0.3 | Password hashing | v1.0 |
| jsonwebtoken | ^9.0.3 | JWT tokens | v1.0 |
| google-auth-library | ^10.6.2 | Google OAuth verification | v1.5.0-beta |
| nodemailer | ^8.0.2 | Email sending | v1.0 |
| svix | ^1.88.0 | Webhook signature verification | v1.5.0-beta |
| cors | ^2.8.6 | CORS middleware | v1.0 |
| express-rate-limit | ^8.3.1 | Rate limiting | v1.0 |
| helmet | ^8.1.0 | Security headers | v1.0 |
| multer | ^2.1.1 | File uploads | v1.0 |
| sanitize-html | ^2.17.1 | HTML security | v1.0 |
| sharp | ^0.34.5 | Image processing | v1.0 |
| @sentry/node | ^10.43.0 | Error tracking | v1.0 |

## Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| vite | Latest | Build tool |
| vitest | Latest | Unit testing |
| @playwright/test | Latest | E2E testing |
| eslint | Latest | Code linting |
| prisma | ^6.19.2 | Schema management |

---

## Dependency Update Log

| Date | Package | From | To | Reason |
|------|---------|------|----|--------|
| 2026-03-18 | animejs | N/A | ^4.3.6 | v1.5.0-beta animation support |
| 2026-03-18 | @react-oauth/google | N/A | ^0.13.4 | Google OAuth |
| 2026-03-18 | google-auth-library | N/A | ^10.6.2 | Google token verification |
| 2026-03-21 | react-easy-crop | N/A | ^5.1.2 | Avatar circle crop modal |
| 2026-03-21 | marked | ^15.0.0 | ^17.0.5 | Security fixes + HTML preview |
