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

### Removed
- Two-step verification (2FA) - Removed in v1.5.0 Cycle 8
- Email verification gate - Being removed in v1.5.0 (Google handles verification)

---

## Content Security

### HTML Scanner
- Forbidden tags: script, iframe, object, embed, form, link, style, meta, base, applet, svg
- DOMPurify sanitization on all user HTML content
- sanitize-html on backend for additional validation

### Upload Security
- File type validation (PDF, PNG, JPEG, GIF, WebP)
- 10MB size limit
- Sharp for image processing (strips EXIF data)
- HTML security scan on sheet content

### Planned (v1.5.0+)
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
- Strike 4: Auto-delete account + admin incident report (hard delete + anonymized evidence 90 days)

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
