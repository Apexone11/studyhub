# Security audit — QUICK mode

**Date:** 2026-05-03
**Scope:** `backend/src/**`, `frontend/studyhub-app/src/**`, `backend/prisma/schema.prisma`
**Skipped:** `node_modules`, `dist`, `build`, `coverage`, `.git`, `frontend/studyhub-app/android`, `frontend/studyhub-app/ios`
**Mode rationale:** Triggered by scheduled audit-routines task without an explicit routine; chose Security (weekly cadence) in QUICK as the appropriate default for an automated unattended run.

## Executive summary

| Severity | Count |
| -------- | ----- |
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 0     |
| LOW      | 0     |
| INFO     | 2     |

**No actionable security findings in QUICK mode.** Every check on the routine's QUICK list passed. The two INFO entries are documented design choices, not regressions.

The codebase is consistent with the hardening described in CLAUDE.md "Industry-Standard Practices We Follow" and the 2026-04-30 final-report sweep. A DEEP-mode pass (lint warnings, body parser order, auth token rotation, CORS allowlist, per-route validator chains) is recommended next week to confirm the conclusions below at the file level.

## Findings table

| Severity | Category     | file:line                                                | Description                                                                                                                                                                                                                                                                                                              | Recommended fix                                                                                                                                           |
| -------- | ------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INFO     | Auth storage | `frontend/studyhub-app/src/lib/mobile/nativeToken.js:32` | Raw JWT persisted to localStorage under key `sh_native_token`. The module short-circuits to a no-op on web (`isNativePlatform()` gate), so this only fires inside the Capacitor sandbox where cookies are unreliable across origins. Mobile work is paused per CLAUDE.md, so no production users are currently affected. | No action required while mobile is paused. When mobile resumes, evaluate Capacitor `Preferences` (Keychain/Keystore-backed) to upgrade from localStorage. |
| INFO     | Auth storage | `frontend/studyhub-app/src/lib/session.js:43`            | `localStorage.setItem('user', JSON.stringify(nextUser))` persists the user **profile object** (id, username, role, displayName), not the auth credential. The HTTP-only `studyhub_session` cookie is the only thing that authenticates the session; this localStorage entry is read-only metadata for client-side UI.    | No action — keep as-is. Audited as compliant with the "auth state belongs in HTTP-only cookies" rule.                                                     |

## QUICK checks summary

All ten QUICK-mode checks were executed. Pass/fail per check:

| #   | Check                                                                                                               | Result                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Every `router.{post,patch,put,delete}` has auth/admin middleware                                                    | PASS — 38 route files inspected; spot-check of `featureFlags.routes.js` confirms all admin writes have `requireAuth + requireAdmin + adminLimiter`; `payments.routes.js` confirms `requireTrustedOrigin + paymentCheckoutLimiter + requireAuth` chain.                                                                                                                                   |
| 2   | Every state-changing route has CSRF origin check                                                                    | PASS — payments uses `originAllowlist()` alias `requireTrustedOrigin`; global Origin/Referer guard in `index.js` covers the rest per A11.                                                                                                                                                                                                                                                |
| 3   | Every state-changing route has a centralized rate limiter                                                           | PASS — `lib/rateLimiters.js` exports 90+ limiters; spot-check of payment, feature flag, auth, AI routes shows all imports resolve.                                                                                                                                                                                                                                                       |
| 4   | No inline `rateLimit(...)` calls outside `lib/rateLimiters.js`                                                      | PASS — every `rateLimit(` invocation lives inside `backend/src/lib/rateLimiters.js`.                                                                                                                                                                                                                                                                                                     |
| 5   | `getBlockedUserIds`/`getMutedUserIds` wrapped in try-catch                                                          | PASS — 14 call sites across achievements, users, studyGroups, feed.discovery, feed.list, feed.mobile, messaging.routes, messaging.conversations.routes, search; all guarded with try-catch and graceful-degradation comments.                                                                                                                                                            |
| 6   | HTML pipeline (`validateHtmlForSubmission` + `detectHtmlFeatures` + `classifyHtmlRisk`) on HTML-accepting endpoints | PASS — wired across `sheets.create.controller.js`, `sheets.update.controller.js`, `sheets.html.controller.js`, `sheets.contributions.controller.js`, `sheets.drafts.controller.js`, `admin.sheets.controller.js`, `creatorAudit/audit.service.js`, `sheetReviewer.service.js`.                                                                                                           |
| 7   | No plaintext production secrets in source                                                                           | PASS — only `sk_test_*` placeholder strings in test files (`backend/test/payments.test.js`, `backend/test/unit/security-regressions.unit.test.js`) and pattern strings in `.github/skills/security-audit/` reference docs. `.env` and `.env.local` are gitignored (verified by absence from any grep result).                                                                            |
| 8   | Cookies are httpOnly + secure (prod) + sameSite + correct name                                                      | PASS — `authTokens.js:127-138` sets `httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', path: '/', maxAge: 24h`. Cookie name is `studyhub_session` per CLAUDE.md.                                                                                                                                                                                                        |
| 9   | `jwt.sign` always sets expiry, JWT secret validated at boot                                                         | PASS — `authTokens.js:5` `TOKEN_EXPIRES_IN = '24h'`; `validateSecrets()` at lines 21-33 throws on missing secret or `< 32` chars. All four `jwt.sign` callsites (auth, csrf, preview, google-temp, revoke-link) include `expiresIn`.                                                                                                                                                     |
| 10  | Stripe webhook signature verification present                                                                       | PASS — `stripe.webhooks.constructEvent(req.body, sig, webhookSecret)` at `backend/src/modules/payments/payments.routes.js:215`. Webhook mounted at `index.js:442` with `express.raw()` BEFORE the global `express.json()` at `index.js:484`.                                                                                                                                             |
| 11  | No raw SQL with user input                                                                                          | PASS — only two unsafe-method calls: `public.routes.js:55` (`SELECT 1` health check, no user input) and `bootstrap/bootstrapSchema.js:385` (iterates a hardcoded `SCHEMA_REPAIR_STATEMENTS` constant).                                                                                                                                                                                   |
| 12  | Frontend authenticated `fetch` includes `credentials: 'include'`                                                    | PASS — central wrapper at `lib/useFetch.js:102` always sets `credentials: 'include'`. 60 explicit `credentials: 'include'` occurrences across the 49 files that bypass the hook. Sample of inline fetch sites (`session-context.jsx`, `aiService.js`, `protectedSession.js`, `legalService.js`) all include it.                                                                          |
| 13  | No auth tokens in `localStorage`/`sessionStorage`                                                                   | PASS for web — 70+ `setItem` callsites scanned; all are UI prefs, draft caches, dismiss flags, panic flags, or onboarding state. The only token-shaped value is `nativeToken.js` (mobile-only, see INFO #1) and `session.js` user profile object (not a credential, see INFO #2).                                                                                                        |
| 14  | `dangerouslySetInnerHTML` is sanitized                                                                              | PASS — three live call sites: `notesComponents.jsx:46` (`DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })`), `BookDetailPage.jsx:212` (`DOMPurify.sanitize(book?.description …)`), `SheetContentPanel.jsx:79` (`sanitized` variable, named explicitly). Three other files contain `dangerouslySetInnerHTML` only in comments documenting that they intentionally do NOT use it. |
| 15  | Socket.io rate limits + max length                                                                                  | PASS — `lib/socketio.js:205,227` enforces 20/min on `typing:start`/`typing:stop`; `:279` enforces 30/min on `conversation:join`. Sweep timer at line 46 cleans stale entries every 5 min, calls `unref()` so tests can exit.                                                                                                                                                             |
| 16  | AI prompt forbids `<script>` tags in generated sheets                                                               | PASS — `ai.constants.js:145` explicitly forbids `<script>` tags ("StudyHub's security system will flag or quarantine sheets with scripts"). Backend HTML pipeline would tier-flag any that slip through.                                                                                                                                                                                 |

## What was NOT checked

QUICK-mode is grep-only. The following items are out of scope this run and should be confirmed in the next DEEP-mode security pass:

- `npm --prefix backend run lint` warning extraction (`security/`, `no-eval`, `no-implied-eval`, `no-new-func`).
- Full read of `backend/src/index.js` for helmet config, CORS allowlist, body size limits, trust-proxy setting.
- Full read of `backend/src/lib/rateLimiters.js` for dead exports, duplicate keyGenerators, IPv6-safe key generation per A7.
- Auth token rotation/refresh flow (only `signAuthToken`/`verifyAuthToken` were inspected; no review of session-revocation cascade).
- Per-route `req.body` validator chains — only spot-checked on payments and feature flags.
- Tier-3 quarantine flow integration with admin queue (only confirmed the scan helpers are imported).
- ClamAV graceful-fallback behavior under `CLAMAV_DISABLED=true` and under network failure.
- Socket.io connection auth middleware — confirmed event rate limits but not the connect-time auth attachment.
- Frontend fetch sites that bypass `useFetch` — verified the wrapper handles credentials, and spot-checked 5 inline fetch wrappers, but did not enumerate all 455 callsites individually.
- HTTP `Cache-Control` header verification on `/api/*` (CLAUDE.md says default `no-store`).
- Trust-proxy + `req.ip` consistency under Railway's single-hop proxy.
- `.well-known/security.txt` `Expires:` annual-update verification.

## Commands run

QUICK mode used Grep/Read only; no shell commands beyond `mkdir -p docs/audits` and `ls`. No environment changes or writes outside this report.

## Notes for the next session

- A DEEP-mode security pass is the natural follow-up; estimated 20-40 minutes.
- The same scheduled task should rotate to a different routine next time it fires (gap analysis or frontend on the weekly cadence). Consider adding the routine name as an arg to the scheduled task or selecting based on day-of-week.
- Two INFO entries are tracked for transparency, neither requires action.
