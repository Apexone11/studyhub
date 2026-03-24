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

### HTML Security (Updated 2026-03-23)

**Policy: Accept all HTML → Scan → Classify → Route by risk tier.**

All HTML is accepted at submission. Nothing is auto-blocked based on tag names or features. The security pipeline scans, classifies risk, and routes content through a tier-based workflow:

- **Structural validation** (`validateHtmlForSubmission`): Only rejects empty content and oversized HTML (>350K chars). Does NOT block any HTML features — scripts, iframes, forms, embeds are all accepted.
- **Feature detection** (`detectHtmlFeatures`): Identifies suspicious tags (script, iframe, object, embed, form, link, style, meta, base, applet, svg), inline event handlers, and dangerous URL schemes (javascript:, vbscript:, data:). These become scan findings, not blockers.
- **Behavioral analysis** (`detectHighRiskBehaviors`): Detects obfuscation (String.fromCharCode chains, heavy hex/unicode escaping), hidden redirects (window.location), form exfiltration to external URLs, keylogging patterns, and crypto-miner signatures.
- **Inline JS risk scan** (`scanInlineJsRisk`): Reports network keywords (fetch, XMLHttpRequest, WebSocket) and eval/obfuscation patterns.
- **Risk classification** (`classifyHtmlRisk`): Assigns a tier based on combined findings:
  - **Tier 0 (Clean)**: No suspicious patterns — published immediately
  - **Tier 1 (Flagged)**: Common features detected (scripts, iframes) — published with warning banner, safe preview (scripts disabled)
  - **Tier 2 (High Risk)**: Behavioral patterns detected — routed to admin review queue (`pending_review`)
  - **Tier 3 (Quarantined)**: Reserved for AV/malware detection — preview disabled, admin-only access
- **Dual preview model**: `buildPreviewDocument` (safe — strips all scripts) vs `buildInteractiveDocument` (interactive — preserves inline scripts, strips dangerous tags)
- **CSP headers** on preview documents: `script-src 'unsafe-inline'`, `connect-src 'none'`, `form-action 'none'`, all remote loading blocked
- **Iframe sandbox**: `allow-scripts` only for clean sheets (no same-origin, no popups, no forms, no modals); empty sandbox for flagged sheets
- **Warning gate**: Per-sheet localStorage acknowledgment before loading HTML preview
- **Admin review**: Tier 2+ sheets trigger email alerts + in-app notifications; admin panel shows safe preview, raw HTML, and scan findings

### Attachment Preview Security (Updated 2026-03-23)

- All attachment preview iframes use `sandbox="allow-same-origin"` (no script execution, no popups, no forms)
- `referrerPolicy="no-referrer"` on all preview iframes to prevent origin leakage
- Applied across: FeedCard, SheetViewerSidebar, AttachmentPreviewPage

### Error Message Sanitization (Updated 2026-03-23)

- All frontend error displays use `getApiErrorMessage(data, fallback)` helper
- Prevents raw API error strings (which may contain implementation details) from reaching user UI
- 15 call sites across `useSheetViewer.js`, `useFeedData.js`, `CommentSection.jsx` standardized

### Upload Security
- File type validation (PDF, PNG, JPEG, GIF, WebP)
- 10MB size limit for attachments, 5MB for avatars
- Magic-byte signature verification on all uploads (MIME must match binary signature)
- HTML security scan on sheet content
- Rate limiting: 20 avatar uploads / 40 attachment uploads per 15 minutes per user

### Media Storage Ownership Model (Audited 2026-03-23)

**Directory Structure:**
```
uploads/
├── avatars/        → Public static serving via /uploads/avatars (5min cache, nosniff)
└── attachments/    → Auth-protected download/preview routes only
```

**Path Resolution:**
- Dev (Windows): `backend/uploads/`
- Production (Railway): `/data/uploads/` (persistent volume)
- Custom: `UPLOADS_DIR` env var
- Central module: `backend/src/lib/storage.js`

**Canonical Path Rules:**
| Asset Type | Path Pattern | URL Format | Served Via |
|---|---|---|---|
| Avatar | `uploads/avatars/user-{userId}-{name}-{ts}.ext` | `/uploads/avatars/filename` | Static middleware |
| Sheet attachment | `uploads/attachments/sheet-{name}-{ts}.ext` | `attachment://filename` | Auth download route |
| Post attachment | `uploads/attachments/sheet-{name}-{ts}.ext` | `attachment://filename` | Auth download route |
| HTML content | Database (`StudySheet.content`) | N/A (in DB) | Preview token route |

**Ownership Enforcement:**
- Avatars: User can only update own avatar (userId embedded in filename)
- Sheet attachments: `assertOwnerOrAdmin()` checks sheet ownership before upload
- Post attachments: `assertOwnerOrAdmin()` checks post ownership before upload
- Path traversal blocked: `resolveManagedUploadPath()` validates leaf filenames only

**Cleanup Chain:**
| Trigger | Cleanup Function | Strategy |
|---|---|---|
| Upload failure | `safeUnlinkFile(path)` | Immediate delete of just-uploaded file |
| Signature mismatch | `safeUnlinkFile(path)` | Immediate delete + 400 response |
| Ownership denied | `safeUnlinkFile(path)` | Immediate delete + 403 response |
| Sheet deletion | `cleanupAttachmentIfUnused()` | Ref-count check across StudySheet + FeedPost |
| Post deletion | `cleanupAttachmentIfUnused()` | Ref-count check across StudySheet + FeedPost |
| User deletion | Cascading cleanup | Avatar + all sheet/post attachments cleaned up |
| Avatar replacement | `cleanupAvatarIfUnused()` | Ref-count check across User table |

**Known Design Choices:**
- No automated orphan cleanup scheduler (cleanup is inline during deletion)
- No S3/cloud storage (local filesystem with Railway persistent volume)
- Cleanup failures logged to Sentry but don't block primary operations

### Planned (v1.5.0-beta+)
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

## HTML Security Communication

### User-Facing Language (Updated Cycle 37)

- All HTML is accepted — no features are auto-blocked at submission time
- Security scan findings use constructive framing: "community guidelines" instead of "harmful content"
- Preview labels: "Safe preview" (Tier 1, scripts disabled) and "Interactive sheet" (Tier 0, scripts enabled in sandbox)
- Tier badges: "Flagged" (Tier 1), "Pending Review" (Tier 2), "Quarantined" (Tier 3)
- Quarantine messages include contact support CTA for false positives
- Acknowledgement checkbox explains consequences transparently (warning badge, scripts disabled in preview)
- Admin review panel: "Safe Preview" tab (was "Sanitized Preview")
- Error messages use `getApiErrorMessage()` to prevent API detail leakage

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
