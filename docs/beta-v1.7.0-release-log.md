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
