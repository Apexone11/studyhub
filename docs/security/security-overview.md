# StudyHub Security Overview

This document tracks security measures, policies, and the algorithm protection strategy.

---

## Authentication Security

### Current State
- **Password hashing**: bcryptjs with default salt rounds
- **JWT tokens**: jsonwebtoken for session management
- **Google OAuth**: google-auth-library for token verification
- **Rate limiting**: express-rate-limit on auth endpoints (10 attempts/15min)
- **Account lockout**: failedAttempts tracking with lockedUntil timestamp
- **CORS**: Origin whitelist with auto www/non-www expansion

### CSRF Protection
- **CSRF tokens**: Signed JWT bound to authenticated user, validated via `x-csrf-token` header
- **Auth bootstrap exclusion**: `/api/auth/login`, `/api/auth/google`, `/api/auth/register` skip CSRF checks (these routes establish sessions and cannot have a valid CSRF token yet)

### Email Verification Enforcement (2026-03-21)
- **Grace period**: 3 days from `user.createdAt` — all features available during grace
- **After grace**: Unverified users blocked from write actions (comments, uploads, drafts, submit-review, fork, contributions, notes)
- **Allowed without verification**: Browse, read, view, search, star, react
- **Response**: 403 with `code: 'EMAIL_NOT_VERIFIED'`
- **Guarded routes**: 9 endpoints in sheets.js + 2 in notes.js

### Removed
- Two-step verification (2FA) - Removed in v1.5.0-beta Cycle 8
- Email verification login gate - Removed in v1.5.0-beta Cycle 13, replaced with post-login soft-gate with 3-day grace period (2026-03-21)

---

## Content Security

### HTML Security (Updated 2026-03-21)

- **Submission validation** (`validateHtmlForSubmission`): Blocks all scripts, forbidden tags (script, iframe, object, embed, form, link, style, meta, base, applet, svg)
- **Runtime validation** (`validateHtmlForRuntime`): Allows inline scripts, blocks `<script src>`, remote assets (http/https in src/href/srcset), CSS url()/@import, `<base>`, `<meta refresh>`
- **Risk scanning** (`scanInlineJsRisk`): Reports network keywords (fetch, XMLHttpRequest, WebSocket) and eval/obfuscation patterns — flags but does not block
- **Dual document model**: `buildPreviewDocument` (sanitized, strips all scripts) vs `buildInteractiveDocument` (preserves inline scripts, strips dangerous tags)
- **CSP headers** on runtime documents: `script-src 'unsafe-inline'`, `connect-src 'none'`, `form-action 'none'`, all remote loading blocked
- **Iframe sandbox**: `allow-scripts` only (no same-origin, no popups, no forms, no modals)
- **Warning gate**: Per-sheet localStorage acknowledgment before loading interactive HTML
- **Admin review**: High-risk sheets trigger email alerts + in-app notifications to admins
- DOMPurify sanitization on preview HTML content
- sanitize-html on backend for additional validation

### Upload Security
- File type validation (PDF, PNG, JPEG, GIF, WebP)
- 10MB size limit
- Sharp for image processing (strips EXIF data)
- HTML security scan on sheet content

### Planned (v1.5.0-beta+)
- MIME + magic-byte verification
- Quarantine path for suspicious uploads
- AV/CDR pipeline for risky file classes

---

## Algorithm Protection (TOP SECRET)

### Overview
The StudyHub algorithms (moderation, provenance, recommendation) are proprietary and must be protected from tampering, theft, or unauthorized access.

### Protection Layers
1. **Encryption**: AES-256-GCM for provenance tokens
2. **Access Control**: Admin + explicitly trusted team only for decryption
3. **Obfuscation**: Production builds minified and tree-shaken
4. **Audit Trail**: All algorithm parameter changes logged with timestamps
5. **Separation of Concerns**: Algorithm logic isolated from frontend exposure

### Who Can Modify Algorithms
- **Owner (Abdul)**: Full access, final authority
- **AI Assistant**: With explicit owner approval and detailed explanation
- **No one else**: Algorithm code is not open for contribution

### Tamper Detection
- Provenance manifest with content hashing
- Tamper cases routed to moderation queue
- Unauthorized modification attempts logged and flagged

---

## Moderation Security

### Strike Model
- Global strike system with 90-day decay
- Strike 1: Warning
- Strike 2: Warning + 12-hour restriction
- Strike 3: Quarantine content + admin review
- Strike 4: Auto-delete account + admin incident report (hard delete + anonymized evidence kept for 90 days)

### Content Scanning
- Primary: OpenAI Moderation API
- Fallback: TF.js backend worker process
- 3-tier confidence: High (auto-enforce), Medium (review queue), Low (allow + monitor)

---

## Infrastructure Security

### Headers (Helmet)
- Content-Security-Policy
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Strict-Transport-Security

### Dependencies
- Regular npm audit checks
- No known vulnerabilities at time of writing
- Prisma ORM prevents SQL injection

### Environment Variables
- All secrets stored in environment variables
- No secrets in code repository
- Railway environment for production secrets

---

## Incident Response

### Severity Matrix
- **Critical (P0)**: Production down, data breach, account takeover -> Fix within 1 hour
- **High (P1)**: Security vulnerability, data loss risk -> Fix within 24 hours
- **Medium (P2)**: Significant bug, feature broken -> Fix within 1 week
- **Low (P3)**: Minor issue, cosmetic -> Fix in next release cycle
