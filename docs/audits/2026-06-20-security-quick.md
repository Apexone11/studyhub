# Security Audit — QUICK — 2026-06-20

**Scope:** `backend/src/**`, `frontend/studyhub-app/src/**`, `backend/prisma/schema.prisma`
**Mode:** QUICK (grep-only pattern scan)
**Skipped:** `node_modules`, `dist`, `build`, `coverage`, `.git`, `frontend/studyhub-app/android`, `frontend/studyhub-app/ios`
**Baseline:** CLAUDE.md A-rules + "Industry-Standard Practices We Follow" treated as intentional; not re-flagged.

## Executive summary

- CRITICAL: 0
- HIGH: 1
- MEDIUM: 1
- LOW: 0
- INFO: 2

All 15 checks ran. The newsletter module (the primary new code in this diff) is generally well-implemented: auth gating, originAllowlist, rate limiters, HMAC token signing, sanitize-html on write, DOMPurify on read, idempotent migration, and A7-safe keyGenerators are all present. Two findings relate to this new module: a missing CSRF exception comment (A11) and a secret-validator miscategorization (A9).

## Findings

| #   | Severity | Confidence | Category                      | Location                                                                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Recommended fix                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------- | ---------- | ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | HIGH     | 82         | CSRF / A11                    | `backend/src/modules/newsletter/newsletter.routes.js:36`                | `POST /newsletter/unsubscribe` is a state-changing write (sets `UserPreferences.emailProductUpdates = false`) with no `requireTrustedOrigin` middleware. CLAUDE.md A11 requires per-route CSRF defense-in-depth on all writes. The omission is intentional — RFC 8058 one-click unsubscribe endpoints must accept POSTs from email clients without a browser `Origin` header, so adding `originAllowlist` would break them — but this is not documented in the route file. A future A11-aware maintainer has no signal that the absence is by design.                                                 | Add an inline comment on `newsletter.routes.js:35-36`: `// POST /unsubscribe intentionally omits requireTrustedOrigin. RFC 8058 one-click unsubscribe endpoints must accept unauthenticated POSTs from MUA/email clients that send no Origin header. Security is enforced by HMAC-signed token verification in service.unsubscribeByToken().` No code change required. |
| 2   | MEDIUM   | 90         | Secret validation / A9        | `backend/src/lib/secretValidator.js:49`                                 | `NEWSLETTER_UNSUBSCRIBE_SECRET` is categorized as `RECOMMENDED` in `secretValidator.js`, which emits a warning at boot but does not hard-exit. However, `newsletter.service.js:77-83` (`getUnsubscribeSecret()`) throws a hard runtime error in production when the secret is absent. This means a production deployment starts healthy (no boot failure), but any admin send attempt or user unsubscribe click throws a 500. The service implements the correct fail-closed behaviour internally, but `secretValidator` should match so the misconfiguration surfaces at deploy time, not first use. | Promote `NEWSLETTER_UNSUBSCRIBE_SECRET` from `RECOMMENDED` to `REQUIRED_IN_PRODUCTION` in `secretValidator.js`, mirroring the pattern used for `FRONTEND_URL` (lines 121-125).                                                                                                                                                                                         |
| 3   | INFO     | 90         | XSS / dangerouslySetInnerHTML | `frontend/studyhub-app/src/pages/newsletter/NewsletterIssuePage.jsx:89` | New `dangerouslySetInnerHTML` call site not listed in CLAUDE.md's "XSS prevention" documented call sites. The implementation is correct: `bodyHtml` is computed via `DOMPurify.sanitize(issue.bodyHtml, { USE_PROFILES: { html: true } })` at line 27 before use. No exploitable XSS. The CLAUDE.md documented list needs updating so future auditors do not re-investigate this site.                                                                                                                                                                                                                | Add `NewsletterIssuePage.jsx` to the documented `dangerouslySetInnerHTML` list in CLAUDE.md under the "XSS prevention" subsection of "Industry-Standard Practices We Follow".                                                                                                                                                                                          |
| 4   | INFO     | 85         | Input handling                | `backend/src/modules/newsletter/newsletter.controller.js:103`           | `postUnsubscribe` accepts the unsubscribe `token` from both `req.body.token` and `req.query.token`. The query-string fallback exists to support the `GET /unsubscribe` redirect pipeline (which lands users on the frontend confirmation page, which then POSTs). No security issue — HMAC verification guards both code paths identically. Worth documenting rather than silently maintaining.                                                                                                                                                                                                       | Observation only. If the GET->redirect->POST flow is the only caller that passes `req.query.token` to the POST handler, consider adding a comment confirming this is intentional so the dual-source pattern is not removed as dead code in a future cleanup.                                                                                                           |

## Detailed notes per check

1. **Auth on state-changing routes** — All module routes correctly gate writes behind `requireAuth`/`requireAdmin`. Newsletter admin writes (create, update, publish, unpublish, send, delete) apply both. Public unsubscribe POST is intentionally unauthenticated (RFC 8058). PASS.

2. **CSRF / originAllowlist** — Every module applies `originAllowlist()` at router or route level. Newsletter admin writes apply `requireTrustedOrigin`. The `POST /unsubscribe` omission is the only per-route gap; see finding #1 for rationale. PASS with documentation gap.

3. **Rate limiters on writes** — All newsletter write endpoints use named limiters from `rateLimiters.js`: `newsletterAdminLimiter` (60/min, user-keyed A7-safe), `newsletterSendLimiter` (10/hr, user-keyed A7-safe), `newsletterUnsubscribeLimiter` (30/15min, default IP-keyed per A7). PASS.

4. **Inline rate-limiter definitions** — Zero `rateLimit(` calls outside `lib/rateLimiters.js`. PASS.

5. **Block/mute call guarding** — Every `getBlockedUserIds`/`getMutedUserIds` call in all controllers is wrapped in try-catch with empty-array fallback. PASS.

6. **HTML pipeline** — Sheets, notes, AI routes call `validateHtmlForSubmission`. Newsletter body uses `sanitize-html` on write (admin-only content) plus DOMPurify on read. Not routed through the scan pipeline by design — admin-authored content does not require tier classification. PASS.

7. **Plaintext secrets** — No matches for `sk_live_`, `sk_test_`, `AKIA*`, private key headers, or hardcoded credential string assignments in `backend/src/` or `frontend/studyhub-app/src/`. PASS.

8. **`.gitignore` coverage** — `.env`, `.env.*`, `**/.env`, `**/.env.*` excluded. `.env.example` and `.env.sample` correctly un-excluded. PASS.

9. **Cookie hardening** — `authTokens.js:130-138`: `httpOnly: true`, `secure: isProd`, `sameSite: isProd ? 'none' : 'lax'`. Device cookie mirrors same options. Cookie name is `studyhub_session` as documented. PASS.

10. **JWT expiry** — All five `jwt.sign()` call sites pass `expiresIn`: `authTokens.js:39` (24h), `authTokens.js:74` (24h), `auth.google.controller.js:42` (uses `TEMP_TOKEN_EXPIRES_IN`), `previewTokens.js:16` (configurable, min 60s), `revokeLinkTokens.js:31` (24h). PASS.

11. **Stripe webhook** — `stripe.webhooks.constructEvent` confirmed at `payments.routes.js:239`. PASS.

12. **Raw SQL with interpolation** — `bootstrapSchema.js:385` uses `$executeRawUnsafe` on a hardcoded constant array (no user input). `public.routes.js:55` uses `$queryRawUnsafe('SELECT 1')` as a literal. All `$queryRaw` tagged-template usages (`courseAliasing.js:79`, `waitlist.service.js:75`, `admin.analytics.controller.js` multiples, `admin.growth.controller.js:291`) parameterize values through Prisma's safe tagged-template interpolation. PASS.

13. **Frontend fetch credentials** — `useFetch` always sends `credentials: 'include'` (`lib/useFetch.js:156`). All admin `NewsletterTab.jsx` fetch calls explicitly set `credentials: 'include'`. Public newsletter hooks go through `useFetch`. PASS.

14. **Auth state in localStorage** — `session.js:43` stores user profile data (non-sensitive; JWT is in httpOnly cookie; `csrfToken` stripped before write). `nativeToken.js` stores JWT in localStorage only on Capacitor native — intentional and documented in the file header. PASS.

15. **dangerouslySetInnerHTML** — All CLAUDE.md-documented sites (notesComponents.jsx, BookDetailPage.jsx, SheetContentPanel.jsx) remain DOMPurify-wrapped. New site at `NewsletterIssuePage.jsx:89` is also correctly DOMPurify-wrapped. See finding #3 for the documentation gap. PASS with documentation gap.

## What was NOT checked

- DEEP-only items: helmet configuration detail, rate-limiter dead-code analysis, lint warning sweep, Socket.io per-socket rate limit enforcement, auth token rotation cadence, per-plan AI spend ceiling atomic enforcement, HTML scan tier enforcement deep-dive.
- ClamAV runtime behaviour (requires running the app).
- Live env-var presence in the production Railway environment.
- Prisma schema/migration drift (requires `prisma migrate status`).
- Newsletter send-batching concurrency edge cases (DEEP).
- Any check requiring a running app or database connection.
