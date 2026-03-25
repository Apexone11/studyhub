StudyHub V1.7.0 Release Log

Purpose
- Security hardening cycle: harden auth, uploads, HTML preview, CORS, rate limiting, and sandbox isolation.
- Ship interactive sandbox preview for HTML sheets (owner/admin only).
- All changes validated with regression tests before release.

Version Scope
- v1.7.0 focuses on Cycle 48 (Security Hardening) items 48.2–48.7.
- Internal development tracked in `docs/beta-v1.5.0-release-log.md`; this file is the user-facing v1.7.0 release log.

---

## Cycle 48.2 — Auth & Session Cookie Hardening (2026-03-24)

### Summary

Enforced secure cookie defaults and added secret validation at startup.

### Changes

| Category | Detail |
|----------|--------|
| Security | Cookie flags enforced: `HttpOnly`, `Secure` (prod), `SameSite=None` (prod, required for split-origin deployment), `Path=/api` |
| Security | `validateSecrets()` runs at server startup — rejects missing or short (<32 char) `JWT_SECRET` |
| Security | `trust proxy` already configured for Railway reverse-proxy environment |
| Added | 7 regression tests: cookie flags (dev/prod), logout clearing, validateSecrets (missing/short/valid) |

### Files Changed

| File | Change |
|------|--------|
| `backend/src/lib/authTokens.js` | Added `validateSecrets()` with min-length enforcement |
| `backend/src/index.js` | Call `validateSecrets()` at startup before any other initialization |
| `backend/test/auth.cookies.test.js` | New: 7 tests for cookie security and secret validation |

---

## Cycle 48.3 — Rate Limiting & Abuse Protection (2026-03-24)

### Summary

Audited all 29 existing rate limiters and identified 3 unprotected diff endpoints (computationally expensive, abuse-worthy). Added dedicated `diffLimiter`.

### Changes

| Category | Detail |
|----------|--------|
| Security | New `diffLimiter` (60 req/min) applied to contribution diff and SheetLab diff endpoints |
| Added | 3 regression tests: login 429 after limit, RateLimit headers present, diffLimiter exported |

### Files Changed

| File | Change |
|------|--------|
| `backend/src/modules/sheets/sheets.constants.js` | Added `diffLimiter` rate limiter |
| `backend/src/modules/sheets/sheets.contributions.controller.js` | Applied `diffLimiter` to contribution diff endpoint |
| `backend/src/modules/sheetLab/sheetLab.operations.controller.js` | Applied `diffLimiter` to both SheetLab diff endpoints |
| `backend/test/ratelimit.test.js` | New: 3 rate limiting regression tests |

---

## Cycle 48.4 — CORS & Security Headers (2026-03-24)

### Summary

Audited CORS configuration and security headers. Confirmed strict origin allowlist, Helmet defaults, HSTS, and CSP differentiation between API and preview routes. Added 14 regression tests across 5 categories.

### Changes

| Category | Detail |
|----------|--------|
| Added | 14 regression tests: CORS allowlist (3), CORS deny (3), security headers + HSTS (3), preview vs API CSP (1), static uploads headers (3), origin validation (1) |

### Files Changed

| File | Change |
|------|--------|
| `backend/test/security.headers.test.js` | New: 14 tests for CORS, headers, CSP, and static uploads |

---

## Cycle 48.5 — Upload Security Hardening (2026-03-24)

### Summary

Found and patched SVG XSS gap in admin school-logo uploads. Added magic byte validation, SVG content scanning, and path traversal protection tests.

### Changes

| Category | Detail |
|----------|--------|
| Security | SVG uploads now scanned for XSS vectors: `<script>`, `on*=` handlers, `javascript:`, `<foreignObject>`, `data:text/html`, `<iframe>`, `<embed>`, `<object>` |
| Security | Malicious SVGs rejected with file cleanup; non-SVG uploads validated via magic bytes |
| Added | 27 regression tests: magic bytes (7), SVG safety (9), path traversal (7), MIME allowlist (4) |

### Files Changed

| File | Change |
|------|--------|
| `backend/src/lib/fileSignatures.js` | Added `validateSvgContent()` — SVG XSS content scanner |
| `backend/src/modules/admin/admin.schools.controller.js` | SVG content validation + Array to Set consistency |
| `backend/src/lib/storage.js` | Exported `isManagedLeafFileName`, `isPathWithinRoot` for testing |
| `backend/test/upload.security.test.js` | New: 27 tests for upload security |

---

## Cycle 48.6 — HTML Safety / Preview Hardening (2026-03-24)

### Summary

Audited the 8-layer HTML security pipeline. Found and patched a `javascript:` bypass in form `action` attributes. Added 43-test XSS corpus regression suite.

### Security Fix

`sanitizePreviewHtml()` applied URL scheme filtering to `href`, `src`, and `srcset` but NOT to `action`. This allowed `<form action="javascript:alert(1)">` to pass through unchanged. Fixed by adding `action` to `allowedSchemesAppliedToAttributes`.

### Changes

| Category | Detail |
|----------|--------|
| Fixed | Form `action` attribute now subject to scheme filtering (blocks `javascript:`) |
| Added | 43 XSS corpus tests: sanitization stripping (17), formatting preservation (5), document safety (2), interactive stripping (3), risk classification (5), feature detection (5), runtime validation (6) |

### Files Changed

| File | Change |
|------|--------|
| `backend/src/lib/htmlPreviewDocument.js` | Added `action` to `allowedSchemesAppliedToAttributes` |
| `backend/test/html.security.test.js` | New: 43 XSS corpus regression tests |

---

## Cycle 48.7 — Interactive Sandbox Preview (2026-03-24)

### Summary

Added secure interactive preview mode for HTML sheets. Owner/admin can toggle between safe (scripts disabled) and interactive (scripts run in isolated sandbox). Non-owners always see safe preview only.

### Security Model

| Layer | Safe Preview | Interactive Preview |
|-------|-------------|---------------------|
| Who sees it | Everyone | Owner/admin only |
| iframe sandbox | `""` (all blocked) | `allow-scripts allow-forms` |
| CSP script-src | `'none'` | `'unsafe-inline'` |
| CSP connect-src | `'none'` | `'none'` |
| Cookie access | Blocked (opaque origin) | Blocked (no `allow-same-origin`) |
| Network exfil | Blocked | Blocked |
| Top navigation | Blocked | Blocked |

Key isolation guarantee: omitting `allow-same-origin` from the iframe sandbox forces an **opaque origin**, which means even with scripts enabled, the sandbox cannot read domain cookies, localStorage, or sessionStorage.

### Changes

| Category | Detail |
|----------|--------|
| Security | `html-runtime` endpoint gated to owner/admin for ALL tiers (was only gated for Tier 2+) |
| Added | `canInteract` flag in `html-preview` API response |
| Changed | SheetViewerPage defaults to safe preview, lazy-loads interactive on toggle |
| Changed | SheetHtmlPreviewPage: added safe/interactive toggle for owner/admin |
| Changed | iframe sandbox: `allow-scripts allow-forms` for interactive, empty for safe |
| Added | 21 regression tests for sandbox security properties |

### Files Changed

| File | Change |
|------|--------|
| `backend/src/modules/sheets/sheets.html.controller.js` | Owner/admin gate on `html-runtime`; `canInteract` in `html-preview` response |
| `frontend/studyhub-app/src/pages/preview/SheetHtmlPreviewPage.jsx` | Safe/interactive toggle, lazy runtime loading, fixed sandbox attrs |
| `frontend/studyhub-app/src/pages/sheets/useSheetViewer.js` | Safe-first preview loading, lazy interactive toggle |
| `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx` | Toggle UI for owner/admin, correct sandbox attrs |
| `backend/test/interactive-preview.test.js` | New: 21 sandbox security regression tests |

---

## Validation Summary

| Suite | Result |
|-------|--------|
| Backend tests | 324/324 pass (31 files) |
| Frontend lint | Clean |
| Frontend build | Clean |
| Security tests added | 115 new tests across 5 test files |

### New Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `auth.cookies.test.js` | 7 | Cookie flags, secret validation |
| `ratelimit.test.js` | 3 | Rate limiting, headers |
| `security.headers.test.js` | 14 | CORS, headers, CSP, uploads |
| `upload.security.test.js` | 27 | Magic bytes, SVG XSS, path traversal, MIME |
| `html.security.test.js` | 43 | XSS corpus, sanitization, risk tiers |
| `interactive-preview.test.js` | 21 | Sandbox isolation, CSP, owner gate |

### Version

Both `backend/package.json` and `frontend/studyhub-app/package.json` at version `1.7.0`.

---

## Cycle 49 — Moderation & Review UX Fixes (2026-03-24)

### Summary

Improved admin review panel accuracy and usability: downgraded ClamAV-unavailable false alarms, enriched runtime validation errors with exact line/column/URL locations, and added click-to-jump navigation between findings and raw HTML source.

### Changes

| Category | Detail |
|----------|--------|
| Fixed | ClamAV scanner-unavailable severity downgraded from `high` to `medium` with clear non-blocking message |
| Security | `validateHtmlForRuntime()` now returns `enrichedIssues` with `{ message, line, column, snippet, url?, attribute? }` for every violation |
| Changed | Admin PATCH review endpoint returns `enrichedIssues` on validation failure |
| Changed | Admin GET review-detail endpoint includes `runtimeValidation: { ok, issues, enrichedIssues }` |
| Changed | `RawHtmlView` component: line numbers, amber highlighting for flagged lines, `useRef`+`useEffect` scroll-to-line |
| Changed | `FindingsPanel` component: enriched issues block with clickable "Line N" buttons and exact URLs |
| Changed | `ReviewActionBar` component: approval error banner shows enriched issues with click-to-jump and URL display |
| Changed | `SheetReviewPanel`: wires `scrollToLine`, `submitEnrichedIssues`, `handleJumpToLine` across all sub-components |

### Files Changed

| File | Change |
|------|--------|
| `backend/src/lib/htmlSecurityRules.js` | Added `indexToLineCol()`, `snippetAt()`, `collectMatches()` helpers; rewrote `validateHtmlForRuntime()` to return enriched issues |
| `backend/src/lib/htmlDraftValidation.js` | ClamAV error severity `high` → `medium`, clearer message wording |
| `backend/src/modules/admin/admin.sheets.controller.js` | Review-detail returns `runtimeValidation`; PATCH review returns `enrichedIssues` on failure |
| `backend/test/htmlDraftWorkflow.test.js` | Updated test expectation: ClamAV error severity `high` → `medium` |
| `frontend/studyhub-app/src/pages/admin/SheetReviewDetails.jsx` | `RawHtmlView` rewritten with line numbers + highlighting + scroll; `FindingsPanel` enriched issues block; `ReviewActionBar` error enrichment |
| `frontend/studyhub-app/src/pages/admin/SheetReviewPanel.jsx` | New state (`scrollToLine`, `submitEnrichedIssues`), `handleJumpToLine`, all props wired to sub-components |

### Validation

| Suite | Result |
|-------|--------|
| Backend tests | 324/324 pass (31 files) |
| Frontend lint | Clean |
| Frontend build | Clean |

---

## Cycle 48.8 — Incident Playbook & Runbooks (2026-03-24)

### Summary

Created a complete incident response framework: severity classification, first-5-minutes checklist, and step-by-step runbooks for outages, security incidents, secrets rotation, database restore, and contacts/escalation.

### Documents Created

| File | Purpose |
|------|---------|
| `docs/security/INCIDENT_PLAYBOOK.md` | Front-door document: severity levels (SEV0-3), first 5 minutes checklist, kill switch reference, post-incident process |
| `docs/security/RUNBOOK_OUTAGE.md` | Railway/availability: triage, diagnosis table, common causes, rollback checklist, what NOT to do |
| `docs/security/RUNBOOK_SECURITY.md` | Suspected breach: indicators of compromise, containment actions, evidence capture, investigation steps |
| `docs/security/RUNBOOK_SECRETS_ROTATION.md` | Rotation procedures for JWT_SECRET, Google OAuth, Resend, DB password, OpenAI key with impact/rollback |
| `docs/security/RUNBOOK_DB_RESTORE.md` | Railway backup restore, manual CLI restore, partial restore, post-restore verification checklist |
| `docs/security/CONTACTS.md` | Service dashboards, vendor support links, approval authority, status message templates |

### Key Features

- Kill switch quick reference: `GUARDED_MODE`, `STUDYHUB_HTML_UPLOADS`, `CLAMAV_DISABLED`
- Secrets rotation order: JWT first (stops attacker sessions), then DB, email, OAuth, moderation
- Status message templates: investigating, mitigating, resolved, security notice
- Live drill: simulated Railway outage — all 7 referenced features/endpoints/configs verified present

### Validation (Live Drill)

| Check | Result |
|-------|--------|
| `/health` endpoint exists | PASS |
| `validateSecrets()` called at startup | PASS |
| `GUARDED_MODE` middleware wired | PASS |
| `STUDYHUB_HTML_UPLOADS` kill switch exists | PASS |
| Railway healthcheck config matches | PASS |
| Sentry capture setup matches | PASS |
| No missing env vars/kill switches | PASS |

---

## Sub-cycle 50.0 — AWS KMS Ping Endpoint (2026-03-24)

### Summary

Added AWS KMS SDK and a minimal admin-only status endpoint (`GET /api/admin/kms/status`) to verify AWS credentials and key policy before building Cycle 50 encryption features.

### Changes

| Category | Detail |
|----------|--------|
| Added | `@aws-sdk/client-kms` dependency |
| Added | `backend/src/lib/kmsClient.js` — KMS client factory |
| Added | `backend/src/modules/admin/admin.kms.controller.js` — admin-only KMS status endpoint |
| Changed | `backend/src/modules/admin/admin.routes.js` — mounted KMS controller |

### Endpoint

`GET /api/admin/kms/status` — requires auth + admin. Calls `DescribeKeyCommand` + `GenerateDataKeyCommand` to verify credentials and encrypt path. Returns key metadata on success, error details on failure.

### Validation

| Suite | Result |
|-------|--------|
| Backend tests | 324/324 pass |
| Frontend build | Clean |

---

## Cycle 50.1 — AWS KMS Envelope Encryption Utilities (2026-03-25)

### Summary

Added reusable envelope encryption helpers using AWS KMS + AES-256-GCM. Data keys are generated per-encryption via KMS `GenerateDataKey`, used locally for AES-256-GCM, then zeroed from memory. Only the KMS-encrypted data key is persisted.

### Changes

| Category | Detail |
|----------|--------|
| Added | `backend/src/lib/kmsEnvelope.js` — `encryptField(plaintext)` and `decryptField(payload)` helpers |
| Added | `backend/test/kmsEnvelope.test.js` — 15 tests: roundtrip (5), payload structure (3), tamper detection (3), wrong key (1), error handling (3) |

---

## Cycle 50.2 — PII Vault Table + Data Access Layer (2026-03-25)

### Summary

Created a dedicated encrypted storage area for sensitive user data. The `UserSensitive` table stores envelope-encrypted JSON blobs with per-record data keys. Address fields are explicitly rejected.

### Changes

| Category | Detail |
|----------|--------|
| Added | `UserSensitive` Prisma model (userId unique FK, ciphertext, encryptedDataKey, keyArn) |
| Added | `backend/prisma/migrations/20260325000000_add_user_sensitive_pii_vault/` |
| Added | `backend/src/lib/piiVault.js` — `setUserPII()`, `getUserPII()`, `stripAddressFields()` |
| Added | `backend/test/piiVault.test.js` — 9 tests: address stripping (3), set (2), get (2), roundtrip (2) |
| Security | Address fields (`address`, `streetAddress`, `mailingAddress`, etc.) explicitly rejected/stripped |

---

## Cycle 50.3 — Log Redaction + Sentry Scrubbing (2026-03-25)

### Summary

Added centralized redaction for sensitive fields and configured Sentry `beforeSend` hook to scrub headers, cookies, request bodies, and extras before transmission.

### Changes

| Category | Detail |
|----------|--------|
| Added | `backend/src/lib/redact.js` — `redactObject()`, `redactHeaders()`, `maskEmail()`, `safeRequestContext()` |
| Changed | `backend/src/monitoring/sentry.js` — added `beforeSend` hook scrubbing headers/cookies/body/extras; `captureError` now redacts context before attaching |
| Added | `backend/test/redact.test.js` — 23 tests: email masking (4), object redaction (10), headers (5), safe context (3) |
| Security | Passwords, tokens, cookies, auth headers, PII vault payloads all redacted from Sentry events |

---

## Cycle 50.4 — Sensitive Access Audit Logging (2026-03-25)

### Summary

Added an `AuditLog` table and wired it into PII vault operations. Every vault read/write produces an audit record with actor metadata but no plaintext PII.

### Changes

| Category | Detail |
|----------|--------|
| Added | `AuditLog` Prisma model (event, actorId, actorRole, targetUserId, route, method, indexed) |
| Added | `backend/prisma/migrations/20260325000001_add_audit_log/` |
| Added | `backend/src/lib/auditLog.js` — `recordAudit()` helper |
| Changed | `backend/src/lib/piiVault.js` — `setUserPII` and `getUserPII` now accept actor context and fire audit records |
| Added | `backend/test/auditLog.test.js` — 7 tests: record creation (3), vault integration (3), failure isolation (1) |

---

## Cycle 50.5 — Gate KMS Status Endpoint (2026-03-25)

### Summary

Gated the debug-style `/api/admin/kms/status` endpoint behind `ENABLE_KMS_STATUS=true` (defaults to disabled/404 in production).

### Changes

| Category | Detail |
|----------|--------|
| Changed | `backend/src/modules/admin/admin.kms.controller.js` — added env var gate middleware |

---

## Cycle 51.1 — Remote Asset Allowlist for AI-Generated HTML (2026-03-25)

### Summary

Added a domain-based allowlist so Google Fonts stylesheets and font files pass validation, while all other remote assets (scripts, images, arbitrary CDNs) remain blocked. This fixes the most common failure for ChatGPT/Claude-generated HTML sheets.

### Security Model

| Asset Type | Rule |
|-----------|------|
| `<link rel="stylesheet">` from `fonts.googleapis.com` | Allowed (https only) |
| Font files from `fonts.gstatic.com` | Allowed (https only) |
| External `<script src="...">` from ANY domain | Blocked |
| `http://` URLs (even allowed hosts) | Blocked |
| `javascript:`, `data:text/html` | Blocked |
| All other remote URLs | Blocked |

### Changes

| Category | Detail |
|----------|--------|
| Changed | `backend/src/lib/htmlSecurityRules.js` — added `ALLOWED_STYLESHEET_HOSTS`, `ALLOWED_FONT_HOSTS`, `isAllowedRemoteUrl()`; remote asset regex now captures full URLs; allowlisted URLs filtered before flagging |
| Added | `backend/test/remoteAllowlist.test.js` — 21 tests: allowlist function (9), Google Fonts pass (3), scripts blocked (2), non-allowlisted blocked (3), mixed (1), config (2), javascript: (1) |

---

## Validation Summary (Cycles 50.1–51.1)

| Suite | Result |
|-------|--------|
| Backend tests | 399/399 pass (36 files) |
| Frontend build | Clean |

### New Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `kmsEnvelope.test.js` | 15 | Envelope encryption roundtrip, tamper detection, error handling |
| `piiVault.test.js` | 9 | Address stripping, vault CRUD, roundtrip |
| `redact.test.js` | 23 | Email masking, object/header redaction, safe request context |
| `auditLog.test.js` | 7 | Audit record creation, vault integration, failure isolation |
| `remoteAllowlist.test.js` | 34 | Allowlist function, Google Fonts, CDN CSS, script blocking, mixed assets |

---

## Cycle 51.2 — Expand Remote Stylesheet Allowlist (2026-03-25)

### Summary

Expanded the remote asset allowlist to support Bootstrap, Tailwind, and Font Awesome CSS from `cdnjs.cloudflare.com` and `cdn.jsdelivr.net`. CDN hosts require `.css` file extension — `.js` files from these hosts remain blocked.

### Security Model

| Host | CSS (.css) | JS (.js) | Fonts | Other |
|------|-----------|---------|-------|-------|
| `fonts.googleapis.com` | Allowed | Blocked | N/A | Blocked |
| `fonts.gstatic.com` | N/A | N/A | Allowed | Blocked |
| `cdnjs.cloudflare.com` | Allowed | Blocked | Blocked | Blocked |
| `cdn.jsdelivr.net` | Allowed | Blocked | Blocked | Blocked |
| `unpkg.com` | Blocked | Blocked | Blocked | Blocked |

### Changes

| Category | Detail |
|----------|--------|
| Changed | `backend/src/lib/htmlSecurityRules.js` — added `cdnjs.cloudflare.com`, `cdn.jsdelivr.net` to stylesheet hosts; added `CSS_PATH_REQUIRED_HOSTS` enforcing `.css` extension for CDN hosts |
| Changed | `backend/test/remoteAllowlist.test.js` — expanded from 21 to 34 tests covering CDN CSS pass, CDN JS block, path validation, enriched issues |

---

## Security Hardening Pass — Checkmarx-style Audit Fixes (2026-03-25)

### Summary

Addressed 7 security findings from static analysis audit of Cycles 50.1–51.2 code.

### Fixes Applied

| Finding | Severity | File | Fix |
|---------|----------|------|-----|
| Ciphertext split without validation | HIGH | `piiVault.js` | Added segment count check before destructuring |
| JSON.parse without error handling | MEDIUM-HIGH | `piiVault.js` | Wrapped in try/catch, throws generic error |
| Shallow address field filtering | MEDIUM | `piiVault.js` | Deep recursive stripping with depth limit |
| KMS error info disclosure | MEDIUM | `admin.kms.controller.js` | Generic "KMS service error" response, details only in Sentry |
| Missing ARN format validation | HIGH | `kmsEnvelope.js` | Added `arn:aws:kms:` prefix check |
| maskEmail edge case | LOW-MEDIUM | `redact.js` | Strict 2-part split validation |
| Audit log field flooding | LOW-MEDIUM | `auditLog.js` | Added truncation limits (event: 256, route: 2048, role: 64) |
| Weak .css path validation | MEDIUM | `htmlSecurityRules.js` | Changed to `/\.css(?:\?|#|$)/` boundary regex |
| URL extraction regex overly broad | LOW-MEDIUM | `htmlSecurityRules.js` | Tightened character class to `[^\s"'<>)]*` |

### Validation

| Suite | Result |
|-------|--------|
| Backend tests | 413/413 pass (36 files) |
| Frontend build | Clean |

---

## Cycle 51.3 — Rename-safe Sheet Updates (2026-03-25)

### Summary

Title/description-only updates on sheets no longer re-run the HTML security pipeline or flip moderation status. Previously, renaming a published HTML sheet set its status to `pending_review`, causing 404s for non-owners.

### Root Cause

`resolveNextSheetStatus()` was called unconditionally on every update. For HTML sheets this always returned `PENDING_REVIEW` — even when only the title changed.

### Changes

| Category | Detail |
|----------|--------|
| Fixed | `sheets.update.controller.js` — wrapped status transition + HTML validation in `contentChanged` guard; metadata-only updates preserve existing status |
| Added | 5 regression tests: title-only HTML, title-only MD, description-only, content change triggers review, non-owner readability after rename |

### Validation

| Suite | Result |
|-------|--------|
| Backend tests | 418/418 pass (36 files) |
| New tests added | 5 in sheet.workflow.integration.test.js |

---

## Cycle 51.4 — Notes Sharing + Permissions + Viewer UI (2026-03-25)

### Summary

Added public note sharing with download control. Shared notes are viewable at `/notes/:id` by anyone. Owners can toggle `allowDownloads` to let visitors download the markdown. Private notes return 404 to non-owners.

### Changes

| Category | Detail |
|----------|--------|
| Schema | Added `allowDownloads` field to Note model |
| Backend | `GET /api/notes/:id` with `optionalAuth` — public-readable shared notes, private notes 404 for non-owners |
| Backend | `GET /api/notes?shared=true` — lists all public notes across users |
| Backend | `PATCH /api/notes/:id` accepts `allowDownloads`; auto-resets when making note private |
| Frontend | `NoteViewerPage` — read-only viewer with markdown preview, author link, course badge, download button |
| Frontend | `NoteEditor` — added allowDownloads toggle (visible only when note is shared) |
| Frontend | `useNotesData` — allowDownloads state, auto-save integration, `?select=` URL param for "Open in Editor" flow |
| Frontend | `App.jsx` — `/notes/:id` route (public, not wrapped in PrivateRoute) |

### Validation

| Suite | Result |
|-------|--------|
| Backend tests | 418/418 pass (36 files) |
| Frontend lint | Clean |
| Frontend build | Clean |

---

## Cycle 51.5 — Notes Inline Comments: Data Model + Backend API (2026-03-25)

### Summary

Added inline comment system for notes. Comments optionally anchor to text selections via `anchorText`/`anchorOffset`. Note owners can resolve comments. Notifications and @mention support included.

### API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/notes/:id/comments` | optionalAuth | List comments; respects note privacy |
| `POST /api/notes/:id/comments` | requireAuth + verified | Create comment with optional anchor |
| `PATCH /api/notes/:id/comments/:commentId` | requireAuth | Resolve/unresolve (note owner or admin) |
| `DELETE /api/notes/:id/comments/:commentId` | requireAuth | Delete (comment author, note owner, or admin) |

### Changes

| Category | Detail |
|----------|--------|
| Schema | `NoteComment` model with anchor fields, resolved flag, cascade deletes |
| Migration | `20260325000003_add_note_comments` — create table, index, foreign keys |
| Backend | 4 comment endpoints on notes router with rate limiting, notifications, @mentions, activity tracking |
| Infra | `bootstrapSchema.js` + `deleteUserAccount.js` updated for NoteComment |
| Frontend | `useNoteComments.js` hook — load, post, resolve, delete comments via API |
| Frontend | `NoteCommentSection.jsx` — expandable thread with @mentions, anchor badges, resolve/reopen, delete |
| Frontend | `NoteViewerPage.jsx` — wired comment section on shared notes |
| Frontend | `features/notes/index.js` — exported useNoteComments |

### Validation

| Suite | Result |
|-------|--------|
| Backend tests | 418/418 pass (36 files) |
| Frontend lint | Clean |
| Frontend build | Clean |

---

## Cycle 51.5 Phase C — Notes in Feed (2026-03-25)

### Summary

Shared notes now appear in the feed alongside posts, sheets, and announcements. A "notes" filter tab lets users browse only notes. Note cards link to `/notes/:id`.

### Changes

| Category | Detail |
|----------|--------|
| Backend | Feed endpoint queries shared notes (`private: false`) with search support |
| Backend | `formatNote()` in feed service; note comment counts via `noteComment.groupBy` |
| Frontend | 'notes' filter added to FILTERS; FeedCard renders note cards with purple badge, "Read note" link, comment count |

### Files Changed

| File | Change |
|------|--------|
| `backend/src/modules/feed/feed.service.js` | Added `formatNote()` |
| `backend/src/modules/feed/feed.list.controller.js` | Notes primary + secondary sections |
| `frontend/studyhub-app/src/pages/feed/feedConstants.js` | Added 'notes' to FILTERS |
| `frontend/studyhub-app/src/pages/feed/FeedCard.jsx` | Note-type card rendering |

### Validation

| Suite | Result |
|-------|--------|
| Backend tests (all) | 418/418 pass (36 files) |
| Frontend lint | Clean |
| Frontend build | Clean |
