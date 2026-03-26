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

---

## Cycle 52 — Notes Search + Anchor Robustness + Security Hardening (2026-03-25)

### Summary

Added shared notes to global search modal. Built anchor context system for inline comment orphan detection. Completed security audit and fixed 6 CRITICAL/HIGH findings across notes endpoints.

### Changes

| Category | Detail |
|----------|--------|
| Search | Shared notes (private:false) now appear in global SearchModal; no content exposed, only title |
| Anchor | `anchorContext` field stores prefix/suffix for re-matching after edits; frontend orphan badges |
| Security | Content limit 50KB on notes; rate limiters on all note endpoints; noteId cross-validation on comment PATCH/DELETE; anchorContext capped at 1KB |
| Tests | 21 new tests: noteAnchor (14), feed notes (2), search notes (5) |

### Security Fixes

| Severity | Fix |
|----------|-----|
| CRITICAL | Content size limit (50KB) on POST/PATCH /api/notes |
| CRITICAL | Rate limiter added to DELETE /api/notes/:id |
| HIGH | Rate limiter (120 req/min) on GET /api/notes and GET /api/notes/:id |
| HIGH | anchorContext JSON capped at 1KB |
| LOW | Comment PATCH/DELETE validate noteId matches URL params |

### Validation

| Suite | Result |
|-------|--------|
| Backend tests | 439/439 pass (37 files) |
| Frontend lint | Clean |
| Frontend build | Clean |

---

## Cycle S-1 — Frontend Stability Hotfix (2026-03-25)

### Summary

Fixed Railway chunk load failures caused by stale service worker caching and missing cache headers. After each deploy, old cached `index.html` referenced deleted JS chunks, causing `ChunkLoadError` for active users.

### Root Cause

Three compounding issues:
1. **Service worker used cache-first for all static assets** — including `index.html`, so browsers served stale HTML even after deploys
2. **No cache headers** on the custom Node.js static server — browsers and CDN made their own caching decisions
3. **No client-side recovery** — chunk load failures crashed the page with no way to recover

### Changes

| Category | Detail |
|----------|--------|
| Infra | `scripts/start.js` — added `getCacheHeaders()`: `no-cache` for `index.html`/`runtime-config.js`, `immutable` (1yr) for hashed `/assets/`, 1hr for other static files |
| Infra | `public/sw.js` — redesigned from v1 to v2: network-first for HTML navigation, cache-first only for hashed `/assets/`, network-first for everything else; removed pre-caching of `index.html` |
| Frontend | `RouteErrorBoundary.jsx` — added `isChunkLoadError()` detection; auto-refreshes once on chunk failure (sessionStorage flag prevents loops); user-friendly "Update available" UI with "Refresh Page" button if auto-refresh already attempted |

### Files Changed

| File | Change |
|------|--------|
| `frontend/studyhub-app/scripts/start.js` | Cache header logic: immutable for hashed assets, no-cache for HTML |
| `frontend/studyhub-app/public/sw.js` | Network-first for navigation/non-asset; cache-first only for `/assets/` |
| `frontend/studyhub-app/src/components/RouteErrorBoundary.jsx` | Chunk load error detection, auto-refresh, friendly recovery UI |

### Validation

| Suite | Result |
|-------|--------|
| Frontend lint | Clean |
| Frontend build | Clean |

---

## Cycle S-2 — Notes & Comments Content Moderation (2026-03-25)

### Summary

Closed the moderation gap: notes and note comments now go through the same OpenAI text moderation pipeline as feed posts, feed comments, and sheets. Previously, notes and note comments bypassed all content scanning entirely.

### Gap Closed

| Content Type | Before | After |
|-------------|--------|-------|
| Feed posts | Scanned | Scanned |
| Feed comments | Scanned | Scanned |
| Sheets (title/desc/markdown) | Scanned | Scanned |
| **Notes** | **Not scanned** | **Scanned** |
| **Note comments** | **Not scanned** | **Scanned** |

### Scan Points

| Endpoint | Content Type | Text Scanned |
|----------|-------------|-------------|
| `POST /api/notes` | `note` | title + content |
| `PATCH /api/notes/:id` | `note` | title + content (only when title/content changes) |
| `POST /api/notes/:id/comments` | `note_comment` | comment text |

All scans are fire-and-forget (`void scanContent()`) — never block the user's response. Cases appear in the existing admin Moderation > Cases panel with content types `note` and `note_comment`.

### Changes

| Category | Detail |
|----------|--------|
| Backend | `notes.routes.js` — added `scanContent` calls on note create, update (content-change guard), and comment create |
| Backend | `moderationEngine.js` — updated JSDoc to include `note` and `note_comment` content types |
| Tests | 5 new tests in `notes.routes.test.js`: note create scan, update scan, metadata-only skip, moderation-disabled skip, comment scan |

### Files Changed

| File | Change |
|------|--------|
| `backend/src/modules/notes/notes.routes.js` | Import + wire `isModerationEnabled`/`scanContent` at 3 points |
| `backend/src/lib/moderationEngine.js` | JSDoc type union updated |
| `backend/test/notes.routes.test.js` | Added moderation engine mock + 5 content moderation tests |

### S-2 Validation

| Suite | Result |
|-------|--------|
| Backend tests | 444/444 pass (37 files) |
| Frontend build | Clean |

---

## Cycle S-3a — Notes & Comments Pending Review Visibility (2026-03-25)

### Summary

Flagged notes and note comments are now hidden from public surfaces until an admin reviews them. The `moderationStatus` field on notes/comments controls visibility: `clean` (default, visible), `pending_review` (hidden from public, visible to owner/admin), `confirmed_violation` (hidden permanently). Admin case review syncs the status back to the source record.

### Publish-but-hide Flow

1. User creates/edits a note or comment → content is published immediately
2. `scanContent()` runs fire-and-forget → if flagged (score ≥ 0.5), sets `moderationStatus: 'pending_review'`
3. Flagged content is hidden from all public queries (feed, search, profile, shared notes, viewer)
4. Owner can still see their own flagged content
5. Admin reviews case → dismiss restores `clean`, confirm sets `confirmed_violation`

### Schema Changes

| Model | Field Added | Default |
|-------|------------|---------|
| `Note` | `moderationStatus` (TEXT) | `'clean'` |
| `NoteComment` | `moderationStatus` (TEXT) | `'clean'` |

### Visibility Filtering (6 surfaces)

| Surface | File | Filter Applied |
|---------|------|---------------|
| Shared notes list | `notes.routes.js` (GET `/?shared=true`) | `moderationStatus: 'clean'` |
| Single note viewer | `notes.routes.js` (GET `/:id`) | Non-owner blocked if status ≠ `clean` |
| Note comments list | `notes.routes.js` (GET `/:id/comments`) | Non-owner filtered by `moderationStatus: 'clean'` |
| Feed | `feed.list.controller.js` | `moderationStatus: 'clean'` on noteWhere |
| Global search | `search.routes.js` | `moderationStatus: 'clean'` on notes query |
| User profile | `users.routes.js` | `moderationStatus: 'clean'` on shared notes |

### Admin Review Hooks

| Action | `moderationStatus` Sync |
|--------|------------------------|
| Dismiss (false positive) | → `clean` (content restored to public) |
| Confirm (violation) | → `confirmed_violation` (hidden permanently) |

### OpenAI Timeout

Added 10-second `AbortController` timeout to `callOpenAiModeration()`. Prevents fire-and-forget calls from accumulating in memory if the OpenAI API is slow or unresponsive.

### Changes

| Category | Detail |
|----------|--------|
| Schema | `moderationStatus` field added to `Note` and `NoteComment` models |
| Migration | `20260325000005_add_note_moderation_status` |
| Infra | `bootstrapSchema.js` updated for both tables |
| Backend | `moderationEngine.js` — auto-hide on flag (`pending_review`), review sync (dismiss→clean, confirm→confirmed_violation), 10s AbortController timeout |
| Backend | 6 query surfaces updated with `moderationStatus: 'clean'` filtering |
| Tests | `moderationVisibility.test.js` — 8 new tests (scan→pending_review, review→sync) |
| Tests | `notes.routes.test.js` — 4 new visibility tests (pending_review viewer, owner bypass, shared filter, no-own-notes filter) |

### Files Changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | `moderationStatus` field on Note + NoteComment |
| `backend/prisma/migrations/20260325000005_add_note_moderation_status/migration.sql` | ALTER TABLE for both models |
| `backend/src/lib/bootstrapSchema.js` | `moderationStatus` column in Note + NoteComment CREATE TABLE |
| `backend/src/lib/moderationEngine.js` | Auto-hide on flag, review sync, 10s AbortController timeout |
| `backend/src/modules/notes/notes.routes.js` | Visibility filtering on shared list, viewer, comments |
| `backend/src/modules/feed/feed.list.controller.js` | `moderationStatus: 'clean'` in noteWhere |
| `backend/src/modules/search/search.routes.js` | `moderationStatus: 'clean'` in notes search |
| `backend/src/modules/users/users.routes.js` | `moderationStatus: 'clean'` in profile notes |
| `backend/test/moderationVisibility.test.js` | New: 8 tests for scan + review visibility |
| `backend/test/notes.routes.test.js` | 4 new moderation visibility tests |

### S-3a Validation

| Suite | Result |
|-------|--------|
| Backend tests | 456/456 pass (38 files) |
| Frontend lint | Clean |
| Frontend build | Clean |

---

## Cycle S-4 — Reporting + Appeals + Admin Triage (2026-03-25)

### Summary

Full user-facing reporting and appeals system with admin triage queue.
Users can report content/users, view their moderation status, and submit appeals.
Admins get claim/assign workflow with source filtering and super admin dashboard.

### Product Decisions

- **Unified ModerationCase model**: auto-detected, user reports, and admin-created cases all share one model (`source` field distinguishes)
- **Super admin protection**: site owner (resolved via `ADMIN_USERNAME`) cannot be struck, demoted, or deleted
- **Claim workflow**: admins claim cases to avoid duplicate work; super admin can override/view all claims
- **User visibility**: users see their status, strikes, and cases but NOT confidence scores or internal evidence
- **404 for hidden content**: moderation-hidden content returns 404 (no info leakage), lists silently exclude

### Schema Changes

| Change | Detail |
|--------|--------|
| ModerationCase | Added `source`, `reporterUserId`, `reasonCategory`, `excerpt`, `claimedByAdminId`, `claimedAt` |
| ModerationCase relations | Added `reporter` (ModerationReporter), `claimedBy` (ModerationClaimer) |
| ModerationCase indexes | Added `[source, status]`, `[claimedByAdminId]` |
| User model | Added `moderationReports`, `moderationClaims` relations |

### Backend Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/moderation/my-status` | Combined moderation summary for current user |
| GET | `/api/moderation/my-strikes` | User's own strikes |
| GET | `/api/moderation/my-appeals` | User's own appeals |
| POST | `/api/moderation/reports` | Submit user report (rate limited: 10/hr) |
| POST | `/api/moderation/appeals` | Submit appeal (rate limited: 5/15min) |
| GET | `/api/admin/moderation/cases` | List cases with source/claimed filters |
| GET | `/api/admin/moderation/cases/overview` | Super admin dashboard stats |
| GET | `/api/admin/moderation/cases/:id` | Single case with strikes/appeals |
| POST | `/api/admin/moderation/cases/:id/claim` | Claim case (idempotent, 409 if claimed) |
| POST | `/api/admin/moderation/cases/:id/unclaim` | Release claim (claimer or super admin) |
| PATCH | `/api/admin/moderation/cases/:id/review` | Dismiss or confirm case |
| POST | `/api/admin/moderation/strikes` | Issue strike (super admin protected) |

### Frontend Components

| Component | Location | Description |
|-----------|----------|-------------|
| Settings ModerationTab | `pages/settings/ModerationTab.jsx` | My Status, My Cases, My Appeals sections |
| ReportModal | `components/ReportModal.jsx` | Content/user reporting dialog with category selection |
| ActionBlockedModal | `components/ActionBlockedModal.jsx` | Restriction notification with link to settings |
| Admin OverviewSubTab | `pages/admin/OverviewSubTab.jsx` | Super admin dashboard (pending, source breakdown, claims, recent resolved) |
| Admin CasesSubTab | `pages/admin/CasesSubTab.jsx` | Enhanced with source/claimed filters, claim/unclaim, reporter display |

### Report Button Wiring

| Page | Target Type | Integration |
|------|-------------|-------------|
| FeedPage → FeedCard | `post` | Three-dot menu (all users, not just owner) |
| SheetViewerPage | `sheet` | Action bar button |
| NoteViewerPage | `note` | Action bar button |
| UserProfilePage | `user` | Profile header button |

### Backend Support Files

| File | Change |
|------|--------|
| `backend/src/lib/superAdmin.js` | New: resolves super admin ID via `ADMIN_USERNAME`, caches, exports `isSuperAdmin()` |
| `backend/src/lib/moderationEngine.js` | Added `source: 'auto'`, `reasonCategory`, `excerpt` to auto-scan case creation |
| `backend/src/middleware/errorEnvelope.js` | Added `ACCOUNT_RESTRICTED`, `SUPER_ADMIN_PROTECTED` error codes |
| `backend/src/middleware/checkRestrictions.js` | Uses `ACCOUNT_RESTRICTED` code, includes restriction reason |
| `backend/src/modules/admin/admin.users.controller.js` | Super admin protection on role change + delete |
| `backend/src/modules/moderation/moderation.constants.js` | Added `reportLimiter`, `REASON_CATEGORIES` |
| `backend/src/modules/moderation/moderation.user.controller.js` | Rewritten: my-status, reports with validation, self-report prevention |
| `backend/src/modules/moderation/moderation.admin.cases.controller.js` | Rewritten: source/claimed filters, claim/unclaim, overview |
| `backend/prisma/schema.prisma` | Extended ModerationCase with 6 fields, 2 relations, 2 indexes |
| `backend/prisma/migrations/20260325000006_extend_moderation_case_reporting/migration.sql` | New migration |

### UI Conventions

- All inline style colors use CSS custom property tokens (`--sh-*`)
- Status pills updated to use semantic tokens (works in light + dark mode)
- Admin sub-tab bar uses `var(--sh-brand)` / `var(--sh-info-bg)` tokens
- Report modal uses `var(--sh-surface)`, `var(--sh-border)`, `var(--sh-brand)` etc.

### S-4 Validation

| Suite | Result |
|-------|--------|
| Backend tests | 463/463 pass (39 files) |
| Backend lint | Clean (6 pre-existing warnings in unrelated files) |
| Frontend lint | Clean |
| Frontend build | Clean |

---

## Cycle S-5 — Moderation Takedown, Preview & Restore (2026-03-25)

### Summary

Admin case detail now shows the actual reported content inline with deep links. Confirmed-violation content is soft-deleted via ModerationSnapshot (reversible). Owners see a moderation banner on their taken-down content. Visibility filtering hides moderated posts/comments from the feed.

### Schema Changes

| Model | Change |
|-------|--------|
| `FeedPost` | Added `moderationStatus String @default("clean")` |
| `FeedPostComment` | Added `moderationStatus String @default("clean")` |
| `Comment` (sheet comments) | Added `moderationStatus String @default("clean")` |
| `ModerationSnapshot` | New model: `caseId`, `targetType`, `targetId`, `ownerId`, `contentJson` (Json), `attachmentUrl`, `createdAt`, `restoredAt` |
| `ModerationCase` | Added `snapshots ModerationSnapshot[]` relation |

### Backend Changes

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `moderationStatus` to FeedPost, FeedPostComment, Comment; added ModerationSnapshot model |
| `prisma/migrations/20260325000007_add_moderation_takedown/migration.sql` | New migration for above schema |
| `src/lib/bootstrapSchema.js` | Added `moderationStatus` default columns to FeedPost, FeedPostComment, Comment CREATE TABLE stubs |
| `src/lib/moderationEngine.js` | Added `CONTENT_MODEL_MAP`, `HAS_MODERATION_STATUS`; rewrote `reviewCase()` for generic content types; added `createSnapshot()`, `restoreContent()`; `scanContent()` now hides all flagged content types via CONTENT_MODEL_MAP |
| `src/modules/moderation/moderation.admin.cases.controller.js` | Added `GET /cases/:id/preview` — resolves live content by type (post, sheet, note, comments, user) with text, attachments, owner, deep link |
| `src/modules/moderation/moderation.admin.enforcement.controller.js` | Appeal approval now calls `restoreContent(caseId)` to reverse takedowns |
| `src/modules/feed/feed.list.controller.js` | Added `moderationStatus: 'clean'` filter to post feed listing |
| `src/modules/feed/feed.posts.controller.js` | Added owner/admin bypass for moderated posts on `GET /posts/:id` |
| `src/modules/feed/feed.social.controller.js` | Added `moderationStatus: 'clean'` filter to post comments listing |
| `src/modules/feed/feed.service.js` | Added `moderationStatus` field to `formatFeedPostDetail()` |
| `src/modules/sheets/sheets.social.controller.js` | Added `moderationStatus: 'clean'` filter to sheet comments listing |

### Frontend Changes

| File | Change |
|------|--------|
| `src/components/ModerationBanner.jsx` | New: reusable banner for `pending_review` / `confirmed_violation` / `removed_by_moderation` status |
| `src/pages/admin/CasesSubTab.jsx` | Added `ContentPreview` component: inline content preview with title, text, attachments, deep link, moderation status pill; replaced generic "FLAGGED CONTENT" section; added `modStatusPill()` helper |
| `src/pages/admin/ModerationTab.jsx` | Added `casePreview`/`casePreviewLoading` state; `loadCaseDetail()` now fetches preview in parallel; passes preview props to CasesSubTab |
| `src/pages/sheets/SheetViewerPage.jsx` | Added ModerationBanner for owner when sheet status is `removed_by_moderation` |
| `src/pages/notes/NoteViewerPage.jsx` | Added ModerationBanner for owner when note `moderationStatus` is non-clean |

### Moderation Lifecycle

1. **Auto-scan or user report** → ModerationCase created (status: `pending`), content `moderationStatus` set to `pending_review`
2. **Admin reviews case** → `confirm`: snapshot content JSON, set `moderationStatus` to `confirmed_violation` (sheets: `status` to `removed_by_moderation`); `dismiss`: restore `moderationStatus` to `clean`
3. **Owner sees banner** on their content explaining the status and how to appeal
4. **Appeal approved** → `restoreContent()`: restore `moderationStatus` to `clean`, sheet `status` to `published`, mark snapshot as restored, case status to `reversed`
5. **Non-owner/non-admin** sees 404 for any non-clean content

### Content Type Coverage

| Content Type | moderationStatus field | Visibility filter | Owner banner | Admin preview |
|-------------|----------------------|-------------------|--------------|---------------|
| Feed post | Yes | Feed listing + detail | Via moderationStatus | Yes (text + attachments) |
| Feed comment | Yes | Comment listing | N/A (inline) | Yes (text) |
| Sheet | Via `status` field | canReadSheet | Via sheet status | Yes (title + description + attachments) |
| Sheet comment | Yes | Comment listing | N/A (inline) | Yes (text) |
| Note | Yes (pre-existing) | Note listing + detail | Yes | Yes (title + content) |
| Note comment | Yes (pre-existing) | Comment listing | N/A (inline) | Yes (text) |

### S-5 Validation

| Suite | Result |
|-------|--------|
| Backend tests | 463/463 pass (39 files) |
| Backend lint | Clean (6 pre-existing warnings in unrelated files) |
| Frontend lint | Clean |
| Frontend build | Clean |

---

## S5-fix: Appeal UX Overhaul (2026-03-25)

### Problem

The appeal flow was broken from the user's perspective:
- My Cases showed confirmed cases but had **no appeal button**
- My Appeals was empty with **no way to create appeals from cases**
- Users had to guess that appeals lived elsewhere

### Changes

#### Backend

- **`moderation.user.controller.js`** — Expanded appeal eligibility: content owner on a confirmed case OR user with an active strike can now appeal. Previously required a linked strike only.
- **`moderation.user.controller.js`** — `POST /appeals` now accepts `reasonCategory` field, validated against `APPEAL_REASON_CATEGORIES`.
- **`moderation.user.controller.js`** — `GET /my-status` now includes `contentId` in cases and `reasonCategory` in appeals.
- **`moderation.constants.js`** — Added `APPEAL_REASON_CATEGORIES`: `educational_context`, `false_positive`, `not_me`, `content_edited`, `other`.
- **`schema.prisma`** — Added `reasonCategory String?` to Appeal model.
- **Migration `20260325000008`** — `ALTER TABLE Appeal ADD COLUMN reasonCategory`.

#### Frontend

- **`settings/ModerationTab.jsx`** — Complete rewrite of appeal flow:
  - **AppealModal**: Reason category chips with guided hints per category, explanation textarea (20–2000 chars), acknowledgement checkbox.
  - **CasesSection**: Per-case appeal button states — canAppeal → "Appeal Decision", pendingAppeal → status chip, approvedAppeal → success chip, rejected → "Appeal again".
  - **AppealsSection**: Full history with outcome cards showing admin notes and decision dates.
- **`admin/AppealsSubTab.jsx`** — Fixed hardcoded hex colors → CSS tokens. Added `Category` column showing `reasonCategory`. Fixed `strikeId` → `caseId` column reference.

### Appeal Reason Categories

| Category | Guided Hint |
|----------|-------------|
| Educational context | Explain how the content serves a legitimate educational purpose |
| False positive | Describe why the system or reporter flagged this incorrectly |
| Not me / Compromised | If someone else posted using your account, explain the situation |
| Content edited | If you've already fixed the issue, describe what you changed |
| Other | Provide any other context the review team should consider |

---

## S-6: Plagiarism / Content Similarity Detection (2026-03-25)

### Overview

Implemented content fingerprinting and similarity detection so admins can identify potential plagiarism when reviewing moderation cases. The system computes fingerprints on content creation/update and provides on-demand similarity matching in the admin panel.

### Changes

#### Backend — Fingerprinting Engine

- **`lib/contentFingerprint.js`** (NEW) — Pure-JS content fingerprinting with no external deps:
  - `normalizeText()`: Strip HTML tags, punctuation, collapse whitespace, lowercase
  - `exactHash()`: SHA-256 of normalized text
  - `simhash()`: 64-bit SimHash via FNV-1a on 3-word shingles with BigInt arithmetic
  - `hammingDistance()`: Bit-level distance between two hex fingerprints
  - `similarity()`: `1 - (hamming / 64)`, returns 0–1 float

- **`lib/plagiarismService.js`** (NEW) — Content similarity matching service:
  - `updateFingerprint(type, id, text)`: Fire-and-forget compute + store fingerprints
  - `findSimilarContent(type, id)`: Two-phase search — exact hash match, then SimHash brute-force scan (up to 500 items each for sheets and notes)
  - Thresholds: `LIKELY_COPY_THRESHOLD = 0.85`, `SIMILARITY_THRESHOLD = 0.70`

#### Backend — Integration Points

- **`sheets.create.controller.js`** — `void updateFingerprint('sheet', sheet.id, content)` after creation
- **`sheets.update.controller.js`** — `void updateFingerprint('sheet', sheetId, content)` after content update
- **`notes.routes.js`** — `void updateFingerprint('note', note.id, content)` after note create/update
- **`moderation.admin.cases.controller.js`** — `GET /cases/:id/plagiarism` endpoint: fetches reported content fingerprint, runs `findSimilarContent()`, enriches matches with text previews (up to 2000 chars)
- **`lib/bootstrapSchema.js`** — Added `contentHash` and `contentSimhash` ALTER TABLE fallbacks for StudySheet

#### Database

- **`schema.prisma`** — Added `contentHash String?` and `contentSimhash String?` to both `StudySheet` and `Note` models, with indexes on `contentHash` and `contentSimhash` for StudySheet.
- **Migration `20260325000009`** — `ALTER TABLE` statements for both tables.

#### Frontend — Admin Plagiarism Panel

- **`admin/CasesSubTab.jsx`** — Added `PlagiarismPanel` component:
  - "Check for plagiarism" button appears on sheet/note cases
  - Fetches matches from `GET /cases/:id/plagiarism`
  - Expandable match cards showing similarity %, EXACT COPY badge, author, creation date
  - Side-by-side text comparison grid (reported content vs match)
  - `similarityColor()` helper: ≥0.85 → danger, ≥0.70 → warning, else muted
- **`admin/ModerationTab.jsx`** — Threads `apiJson` prop through to CasesSubTab

#### Frontend — Owner Visibility

- **`components/ModerationBanner.jsx`** (NEW) — Reusable banner for content owners:
  - `pending_review` → warning style
  - `confirmed_violation` / `removed_by_moderation` → danger style
  - Renders nothing for `clean` or null
- **`sheets/SheetViewerPage.jsx`** — Shows ModerationBanner for owner when `sheet.status === 'removed_by_moderation'`
- **`notes/NoteViewerPage.jsx`** — Shows ModerationBanner for owner when `note.moderationStatus` is non-clean
- **`feed/feed.service.js`** — Added `moderationStatus` to `formatFeedPostDetail()`

### SimHash Algorithm Details

```
Input text → normalize → extract 3-word shingles
Each shingle → FNV-1a 64-bit hash
Accumulate weighted bit vector (64 positions)
Collapse: bit[i] = weightedSum[i] > 0 ? 1 : 0
Result: 64-bit hex string
```

Similarity = `1 - (hammingDistance / 64)` where hamming distance counts differing bits.

### S5-fix + S-6 Validation

| Suite | Result |
|-------|--------|
| Backend tests | 463/463 pass (39 files) |
| Backend lint | Clean (6 pre-existing warnings in unrelated files) |
| Frontend lint | Clean |
| Frontend build | Clean (562 modules, 279ms) |

---

## S-7: Attachment Moderation Gating — Policy A (2026-03-25)

### Problem

Attachment download and preview endpoints did not respect parent content moderation state. A sheet or post could be hidden by moderation (pending_review, confirmed_violation, quarantined, rejected) but its attached files remained accessible to anyone with the URL.

### Policy

**Policy A (owner/admin bypass):**
- **Owner and admin** can always access attachments — needed for appeals ("show me what I uploaded") and admin review.
- **Everyone else** gets a 404 (no leakage) when the parent content is moderation-hidden.
- `allowDownloads` enforcement is owner/admin-bypassed too, so owners can always retrieve their own files.

### Changes

#### `sheets.downloads.controller.js`

All four endpoints (`GET /:id/download`, `GET /:id/attachment`, `GET /:id/attachment/preview`, `POST /:id/download`) now:
1. Select `userId` alongside existing fields
2. Use `canReadSheet(sheet, req.user)` — returns true for published sheets or owner/admin
3. Return 404 (not 403) for non-visible sheets to avoid leaking moderation state
4. Owner/admin bypass `allowDownloads` restriction

Removed direct `SHEET_STATUS` import — no longer needed since `canReadSheet` encapsulates the logic.

#### `feed.posts.controller.js`

Both endpoints (`GET /posts/:id/attachment`, `GET /posts/:id/attachment/preview`) now:
1. Select `userId` and `moderationStatus`
2. Check `isOwnerOrAdmin` — if not, require `moderationStatus === 'clean'`
3. Return 404 for non-clean posts when requester is not owner/admin
4. Owner/admin bypass `allowDownloads` restriction
5. Preview endpoint no longer checks `allowDownloads` at all (previewing is not downloading)

### Access Matrix

| Parent state | Owner | Admin | Stranger | Anonymous |
|---|---|---|---|---|
| published / clean | download + preview | download + preview | download (if allowed) + preview | download (if allowed) + preview |
| pending_review | download + preview | download + preview | 404 | 404 |
| confirmed_violation | download + preview | download + preview | 404 | 404 |
| quarantined | download + preview | download + preview | 404 | 404 |
| rejected | download + preview | download + preview | 404 | 404 |
| draft | download + preview | download + preview | 404 | 404 |

### Tests

New file: `backend/test/attachmentAccessControl.test.js` (26 tests)
- Sheet access: `canReadSheet` tested against all 5 statuses × 4 user types (owner, admin, stranger, anonymous)
- Post access: `postAttachmentAccessible` tested against 3 moderation states × 4 user types

### S-7 Validation

| Suite | Result |
|-------|--------|
| Backend tests | 489/489 pass (40 files) |
| Backend lint | Clean (6 pre-existing warnings in unrelated files) |
| Frontend lint | Clean |

---

## S-8: Notification Priority Routing + Inbox Controls (2026-03-25)

### Overview

Added priority-based notification routing (high/medium/low) with automatic email delivery for high-priority events, plus inbox management controls (clear read, per-notification delete).

### Changes

#### Database

- **`schema.prisma`** — Added `priority String @default("medium")` to Notification model.
- **Migration `20260325000010`** — `ALTER TABLE "Notification" ADD COLUMN "priority"`.
- **`bootstrapSchema.js`** — Added `priority` column fallback.

#### Backend — Priority-aware notification creation

- **`lib/notify.js`** — Complete rewrite:
  - `createNotification()` now accepts `priority` parameter (`'high'`, `'medium'`, `'low'`; defaults to `'medium'`)
  - Invalid priority values silently default to `'medium'`
  - High-priority notifications trigger fire-and-forget email to the recipient (if they have a verified email)
  - `sendHighPriorityEmail()` renders a branded HTML email with StudyHub styling
  - Exports `VALID_PRIORITIES` for validation
  - Self-notification guard preserved

#### Backend — New endpoint

- **`notifications.routes.js`** — Added `DELETE /api/notifications/read`:
  - Deletes all notifications where `userId = currentUser AND read = true`
  - Returns `{ deleted: count }`
  - Route defined before `/:id` to prevent route collision

#### Backend — High-priority event wiring

| Call site | Event | Priority |
|---|---|---|
| `moderationEngine.js` | User receives a strike | high |
| `htmlDraftWorkflow.js` | High-risk HTML sheet flagged (admin alert) | high |
| `moderation.user.controller.js` | New user report (admin alert) | high |
| `moderation.user.controller.js` | Appeal submitted (admin alert) — **NEW** | high |
| `moderation.admin.enforcement.js` | Restriction lifted | medium (default) |
| `moderation.admin.enforcement.js` | Appeal approved/rejected | medium (default) |
| All other call sites | Stars, comments, follows, forks, etc. | medium (default) |

#### Frontend — Inbox controls

- **`NavbarNotifications.jsx`** — Enhanced dropdown:
  - **X button** per notification (absolute-positioned, hover reveals danger color)
  - **"Clear read"** button in header (only shows when read notifications exist)
  - **"Mark all read"** + **"Clear read"** shown side-by-side
  - **Priority indicator**: high-priority notifications get `!` prefix + red left border (vs blue for normal)
  - `deleteOne()`: optimistic removal + fires `DELETE /api/notifications/:id`
  - `clearRead()`: optimistic filter + fires `DELETE /api/notifications/read`

### Email Routing Policy

| Priority | In-app | Email |
|---|---|---|
| high | Yes | Yes (if user has verified email) |
| medium | Yes | No |
| low | Yes | No |

### Tests

- **`notifications.routes.test.js`** — Added 2 tests for `DELETE /read` endpoint (success + zero-count)
- **`notifyPriority.test.js`** (NEW) — 13 tests: priority field storage, defaults, self-notify skip, email delivery, self-notify guard, dedup guard
- **`notificationPolicy.test.js`** (NEW) — 29 tests: full coverage of `classifyReportPriority`, `classifyAppealPriority`, `classifyEnforcementPriority`

---

## S-8+ : Smart Priority Classification + Anti-Spam (2026-03-25)

### Overview

Enhanced S-8's basic priority routing with context-aware priority classification and email anti-spam rules. Call sites no longer hardcode priority — they pass context (reason category, target type, offender signals) and the policy module decides.

### Priority Policy Module

New file: **`lib/notificationPolicy.js`** — centralises all escalation rules.

#### `classifyReportPriority(ctx)` → `'high'` | `'medium'`

Escalation triggers (any one → high):

| Signal | Condition |
|---|---|
| Severity category | `sexual`, `self_harm`, `violence`, `hate_speech` |
| High-impact surface | Feed post, feed comment |
| Public target | Published sheet or shared note |
| Repeat offender (strikes) | Content owner has ≥ 2 active strikes |
| Repeat offender (cases) | Content owner has ≥ 3 cases in 24 hours |
| System confidence | Auto-detected + HTML risk tier ≥ 2 |
| Plagiarism (public) | Similarity ≥ 95% AND public target |

Everything else → `'medium'` (in-app only).

#### `classifyAppealPriority()` → `'high'`

All appeals are high priority (admin must act).

#### `classifyEnforcementPriority(ctx)` → `'high'` | `'medium'`

Only escalates when a case confirmation triggers a user restriction.

### Anti-Spam Rules (Email Layer)

Built into `lib/notify.js`:

| Rule | Behavior |
|---|---|
| **No self-notify** | If `performerUserId === userId`, email is skipped (in-app still created) |
| **Dedup** | Same `(userId, type, dedupKey)` within 1 hour → email skipped |
| **Burst bundling** | ≥ 3 high events for same user within 2 min → queued, sent as 1 digest email after 10s |

`dedupKey` is set per call site (e.g., `report-sheet-42`, `appeal-17`) to prevent repeat emails for the same target.

### Wiring Changes

#### `moderation.user.controller.js` (reports)

- Now looks up `actorActiveStrikes` and `actorRecentCases` (24h window) via parallel queries
- Checks `isPublicTarget` (sheet status = published, note isShared)
- Calls `classifyReportPriority()` instead of hardcoding `'high'`
- Passes `dedupKey: 'report-{targetType}-{targetId}'`

#### `moderation.user.controller.js` (appeals)

- Calls `classifyAppealPriority()` (always high)
- Passes `dedupKey: 'appeal-{caseId}'`

#### `moderation.admin.enforcement.controller.js`

- Switched from inline `require('../../lib/notify')` to top-level import
- All admin-initiated notifications now pass `performerUserId: req.user.userId` for self-notify guard
- Appeal approve/reject notifications include `linkPath` for user navigation

#### `moderationEngine.js` (strikes)

- Strike notification: remains `priority: 'high'` (user receives email)
- **NEW**: When auto-restriction triggers (≥ 4 active strikes), a second `priority: 'high'` notification is sent: "Your account has been restricted..."

### New Notifications Added

| Event | Recipient | Priority |
|---|---|---|
| Appeal submitted | Admins | high (was missing entirely) |
| Auto-restriction triggered | User | high (new) |

### S-8 + S-8+ Combined Validation

| Suite | Result |
|-------|--------|
| Backend tests | 531/531 pass (42 files) |
| Backend lint | Clean (6 pre-existing warnings in unrelated files) |
| Frontend lint | Clean |
| Frontend build | Clean (562 modules, 292ms) |

---

## S-10.1 — Performance Measurement Instrumentation (2026-03-26)

### Summary

Added standardised request-timing instrumentation to all critical backend endpoints and frontend page-load timing marks. This provides baseline latency data (per-query section timings, slow-query warnings, and frontend time-to-content) to identify and prioritise performance fixes in S-10.2.

### Backend Changes

#### New: `requestTiming.js` utility (`backend/src/lib/requestTiming.js`)
- `timedSection(label, fn)` — wraps any async operation, returns `{ ok, label, data, durationMs }`
- `logTiming(req, { sections, extra })` — standardised `[perf]` log entry with route, userId, total durationMs, per-section timings, and slow-query warnings (≥500ms)
- `startTimer` middleware for stamping `req._timingStart`

#### Instrumented Endpoints

| Endpoint | File | Sections Timed |
|----------|------|----------------|
| `GET /api/search` | `search.routes.js` | sheets, courses, users, notes, visibility (4–5 parallel) |
| `GET /api/sheets/:id` | `sheets.read.controller.js` | sheet-main, likes, dislikes, commentCount, starred, userReaction, contributions (7 sections) |
| `GET /api/notes/:id` | `notes.routes.js` | note-main (1 section) |
| `GET /api/notes/:id/comments` | `notes.routes.js` | note-lookup, comments, count (3 sections) |
| `GET /api/sheets/:id/comments` | `sheets.social.controller.js` | sheet-lookup, comments, count (3 sections) |
| `GET /api/feed/posts/:id/comments` | `feed.social.controller.js` | comments, count (2 sections) |

`GET /api/feed` already had comprehensive timing via `settleSection` (12 sections).

#### Log Format

```
[perf] { route, method, userId, durationMs, queryCount, ...extra, timings: [...], slowSections?: [...] }
```

### Frontend Changes

#### New: `usePageTiming` hook (`frontend/studyhub-app/src/lib/usePageTiming.js`)
- Measures two phases: API latency (fetch start → fetch end) and time-to-content (mount → first render with data)
- Uses `performance.mark/measure` for browser DevTools visibility
- Reports to PostHog via `trackEvent('page_timing', { page, apiLatencyMs, timeToContentMs })`
- Fires once per page load (deduped via ref)

#### Instrumented Pages

| Page | Hook | Marks |
|------|------|-------|
| Feed | `useFeedData.js` | fetchStart → fetchEnd → contentVisible (items arrive) |
| Sheet Detail | `useSheetViewer.js` | fetchStart → fetchEnd → contentVisible (sheet data arrives) |
| Note Detail | `useNoteViewer.js` | fetchStart → fetchEnd → contentVisible (note data arrives) |
| Search Modal | `SearchModal.jsx` | Inline apiLatencyMs + totalResults per query |

### S-10.1 Validation

| Suite | Result |
|-------|--------|
| Backend tests | 531/531 pass (42 files) |
| Backend lint | Clean (6 pre-existing only) |
| Frontend lint | Clean |
| Frontend build | Clean (310ms) |

---

## Hotfix — Missing `ModerationSnapshot.permanentlyDeletedAt` Migration (2026-03-26)

### Problem

The moderation cleanup scheduler (`moderationCleanupScheduler.js`) was crashing on startup:

```
[moderation-cleanup] Scheduler error:
Invalid `prisma.moderationSnapshot.findMany()` invocation:
The column `ModerationSnapshot.permanentlyDeletedAt` does not exist in the current database.
```

The column was added to the Prisma schema during the S-6 moderation cleanup cycle but no migration was created, so the production database never received the column.

### Fix

| File | Change |
|------|--------|
| `prisma/migrations/20260326000001_add_snapshot_permanently_deleted_at/migration.sql` | `ALTER TABLE "ModerationSnapshot" ADD COLUMN "permanentlyDeletedAt" TIMESTAMP(3)` |
| `src/lib/bootstrapSchema.js` | Added `ADD COLUMN IF NOT EXISTS "permanentlyDeletedAt"` safety-net statement |

### Validation (first pass)

| Suite | Result |
|-------|--------|
| Backend tests | 531/531 pass (42 files) |
| Backend lint | Clean (6 pre-existing only) |

---

## Hotfix 2 — Full Schema-vs-Migration Audit (2026-03-26)

### Problem

After the first hotfix deployed, the cleanup scheduler still crashed:

```
The column `ModerationCase.contentPurged` does not exist in the current database.
[moderation-cleanup] Scheduler error:
Invalid `prisma.moderationSnapshot.findMany()` invocation:
```

A full audit of every Prisma schema column against all migration files revealed **4 gaps** — not just the one column:

### Audit Findings

| Priority | Missing Item | Impact |
|----------|-------------|--------|
| CRITICAL | `ModerationLog` table — entire table never created | All moderation audit logging silently failed; admin log/CSV endpoints returned 500 |
| CRITICAL | `ModerationCase.contentPurged` column | Cleanup scheduler query crashed — expired content never purged |
| MODERATE | `StudySheet.rootSheetId` — no bootstrapSchema safety net | Migration exists but has no IF NOT EXISTS guard |
| MODERATE | `SheetCommit.kind` — no bootstrapSchema safety net | Same — migration exists but no safety net |

### Fix

| File | Change |
|------|--------|
| `prisma/migrations/20260326000002_.../migration.sql` | `ALTER TABLE "ModerationCase" ADD COLUMN "contentPurged"` + `CREATE TABLE "ModerationLog"` with all columns, indexes, and FK |
| `src/lib/bootstrapSchema.js` | Added 7 safety-net statements: `contentPurged` column, full `ModerationLog` CREATE TABLE + indexes + FK, `rootSheetId` column, `SheetCommit.kind` column |

### Root Cause

Schema columns and tables were added to `prisma/schema.prisma` during earlier cycles but the corresponding `CREATE TABLE` / `ALTER TABLE` migration SQL was never created. The bootstrapSchema safety net was also not updated to cover these additions.

### Prevention

Memory rule `feedback_fullstack_sync.md` now enforces: every schema change must have all three layers — schema.prisma → migration SQL → bootstrapSchema.js entry.

### Validation

| Suite | Result |
|-------|--------|
| Backend tests | 531/531 pass (42 files) |
| Backend lint | Clean (6 pre-existing only) |
