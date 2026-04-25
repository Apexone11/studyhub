# Static Analysis Checklist

Run these checks in order. Mark each Pass / Fail / N-A.

---

## Phase 1 — Static Grep Sweep

| #    | Category                               | Grep Pattern                                                           | File Scope                      | Reference                |
| ---- | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------- | ------------------------ |
| 1.1  | Auth — missing credentials             | `fetch\(\`\$\{API\}.*\`(?![\s\S]*credentials)`                         | `frontend/src/`                 | `01-auth-session.md`     |
| 1.2  | Auth — localStorage tokens             | `localStorage.*token\|localStorage.*jwt\|localStorage.*session`        | `frontend/src/`                 | `01-auth-session.md`     |
| 1.3  | Auth — missing `/api/` prefix          | `\$\{API\}/(?!api/)`                                                   | `frontend/src/`                 | `18-frontend.md`         |
| 1.4  | AUTHZ — missing requireAuth            | `router\.(get\|post\|patch\|delete)\(`                                 | `backend/src/modules/`          | `02-authz-rbac.md`       |
| 1.5  | AUTHZ — no owner check                 | `prisma\.\w+\.update\(\|prisma\.\w+\.delete\(`                         | `backend/src/modules/`          | `02-authz-rbac.md`       |
| 1.6  | Input — no Zod parse                   | `router\.(post\|patch\|put)\(`                                         | `backend/src/modules/`          | `03-input-validation.md` |
| 1.7  | Input — Prisma null syntax             | `field.*:.*\{.*not.*null\}`                                            | `backend/src/`                  | `07-injection.md`        |
| 1.8  | Rate limit — inline limiter            | `rateLimit\(\{`                                                        | `backend/src/modules/`          | `04-rate-limiting.md`    |
| 1.9  | Rate limit — wrong import              | `require.*express-rate-limit\|from.*express-rate-limit`                | `backend/src/modules/`          | `04-rate-limiting.md`    |
| 1.10 | CSRF — payment no origin check         | `router\.post.*checkout\|router\.post.*portal`                         | `backend/src/modules/payments/` | `05-csrf.md`             |
| 1.11 | XSS — dangerouslySetInnerHTML          | `dangerouslySetInnerHTML`                                              | `frontend/src/`                 | `06-html-xss.md`         |
| 1.12 | XSS — no DOMPurify on innerHTML        | `dangerouslySetInnerHTML(?![\s\S]*DOMPurify)`                          | `frontend/src/`                 | `06-html-xss.md`         |
| 1.13 | Injection — $queryRaw template literal | `\$queryRaw\`\|queryRawUnsafe`                                         | `backend/src/`                  | `07-injection.md`        |
| 1.14 | Block/mute — unguarded call            | `await getBlockedUserIds\|await getMutedUserIds`                       | `backend/src/`                  | `08-block-mute.md`       |
| 1.15 | AI — no PII strip                      | `anthropic\|claude\|createMessage`                                     | `backend/src/modules/ai/`       | `09-ai-security.md`      |
| 1.16 | Payment — no constructEvent            | `webhook`                                                              | `backend/src/modules/payments/` | `10-payment-security.md` |
| 1.17 | Flags — fail-open                      | `enabled.*true\|return true`                                           | `backend/src/modules/flags/`    | `11-feature-flags.md`    |
| 1.18 | Upload — no magic byte check           | `mimetype\|mime`                                                       | `backend/src/modules/`          | `12-file-upload.md`      |
| 1.19 | Socket — hardcoded event strings       | `socket\.on\(['"]message:\|socket\.emit\(['"]message:`                 | `frontend/src/`                 | `13-socketio.md`         |
| 1.20 | Error — raw json error                 | `res\.status\(\d{3}\)\.json\(\{.*error`                                | `backend/src/`                  | `14-error-leakage.md`    |
| 1.21 | Secrets — sk_live in frontend          | `sk_live_\|sk_test_`                                                   | `frontend/src/`                 | `15-secrets.md`          |
| 1.22 | CORS — wildcard origin                 | `origin.*['"]\*['"]`                                                   | `backend/src/`                  | `16-cors-origin.md`      |
| 1.23 | Migration — model without table        | (manual: compare schema.prisma models vs migration SQL)                | `backend/prisma/`               | `17-migration-safety.md` |
| 1.24 | Frontend — eval usage                  | `eval\(\|new Function\(\|setTimeout\(['"]`                             | `frontend/src/`                 | `18-frontend.md`         |
| 1.25 | Supply chain — audit                   | `npm audit --audit-level=high`                                         | both workspaces                 | `19-supply-chain.md`     |
| 1.26 | Logging — PII in console.log           | `console\.log.*req\.body\|console\.log.*password\|console\.log.*email` | `backend/src/`                  | `20-logging-pii.md`      |

---

## Phase 2 — Manual Code Review Checks

| #    | Category     | What to Verify                                                     | Reference                            |
| ---- | ------------ | ------------------------------------------------------------------ | ------------------------------------ |
| 2.1  | Auth         | JWT_SECRET ≥ 32 chars enforced at startup                          | `01-auth-session.md` §Check 1.2      |
| 2.2  | Auth         | `requireAuth` middleware wires to DB (not just token decode)       | `01-auth-session.md` §Check 1.1      |
| 2.3  | AUTHZ        | Admin routes call `requireAdmin` (DB verify, not role field trust) | `02-authz-rbac.md` §Check 2.3        |
| 2.4  | AUTHZ        | School/course scoping enforced server-side (IDOR check)            | `02-authz-rbac.md` §Check 2.4        |
| 2.5  | Input        | `clampLimit()` / `clampPage()` used on all paginated endpoints     | `03-input-validation.md` §Check 3.5  |
| 2.6  | CSRF         | `requireTrustedOrigin` on payment checkout + portal                | `05-csrf.md` §Check 5.6              |
| 2.7  | HTML         | Tier classification pipeline active for all HTML ingestion paths   | `06-html-xss.md` §Check 6.1          |
| 2.8  | HTML         | Multi-file sheets served from `sheets.getstudyhub.org` subdomain   | `06-html-xss.md` §Check 6.8          |
| 2.9  | Injection    | Dynamic `orderBy` uses allowlist                                   | `07-injection.md` §Check 7.2         |
| 2.10 | Block/mute   | try-catch with `[]` fallback wraps ALL `getBlockedUserIds` calls   | `08-block-mute.md` §Check 8.1        |
| 2.11 | AI           | PII stripped from both AI input and output                         | `09-ai-security.md` §Check 9.1       |
| 2.12 | AI           | HMAC applied to AI suggestions                                     | `09-ai-security.md` §Check 9.2       |
| 2.13 | Payment      | Stripe webhook uses `express.raw()` BEFORE `express.json()`        | `10-payment-security.md` §Check 10.1 |
| 2.14 | Flags        | `useDesignV2Flags` is only flag consumer (no manual fetch bypass)  | `11-feature-flags.md` §Check 11.2    |
| 2.15 | Upload       | Video length ≤ 10 min enforced server-side                         | `12-file-upload.md` §Check 12.5      |
| 2.16 | Upload       | No video URL embeds accepted (uploads only)                        | `12-file-upload.md` §Check 12.6      |
| 2.17 | Socket       | Room join verifies participant before `socket.join()`              | `13-socketio.md` §Check 13.5         |
| 2.18 | Socket       | Message length enforced on socket path (not just HTTP)             | `13-socketio.md` §Check 13.6         |
| 2.19 | Errors       | Global 4-arg error handler registered last in `index.js`           | `14-error-leakage.md` §Check 14.3    |
| 2.20 | Secrets      | All `process.env.X` documented in `.env.example`                   | `15-secrets.md` §Check 15.3          |
| 2.21 | CORS         | `credentials: true` in CORS config                                 | `16-cors-origin.md` §Check 16.2      |
| 2.22 | CORS         | Allowed origins from env var, not hardcoded                        | `16-cors-origin.md` §Check 16.3      |
| 2.23 | Migration    | Every `schema.prisma` model has `CREATE TABLE` migration           | `17-migration-safety.md` §Check 17.1 |
| 2.24 | Migration    | NOT NULL columns have DEFAULT or staged migration                  | `17-migration-safety.md` §Check 17.2 |
| 2.25 | Supply chain | Dep changes logged in release log with rollback plan               | `19-supply-chain.md` §Check 19.3     |
| 2.26 | Logging      | Sentry `beforeSend` scrubs password/email                          | `20-logging-pii.md` §Check 20.4      |

---

## Phase 3 — Open Security Gaps (Track Closure)

These are known gaps documented in the references. Check if they have been addressed.

| Gap                                            | Severity           | Decision | Reference                      |
| ---------------------------------------------- | ------------------ | -------- | ------------------------------ |
| AI PII redaction not implemented               | HIGH               | #17      | `09-ai-security.md` §Check 9.1 |
| HMAC on AI suggestions not implemented         | MEDIUM             | #18      | `09-ai-security.md` §Check 9.2 |
| Multi-file sheet subdomain isolation not built | CRITICAL (pre-req) | #13      | `06-html-xss.md` §Check 6.8    |
| Self-learner cross-school mutation blocking    | HIGH               | #2       | `02-authz-rbac.md` §Check 2.8  |

---

## Scoring

After completing all checks, score the audit:

| Severity | Count | Max Acceptable                |
| -------- | ----- | ----------------------------- |
| CRITICAL | 0     | 0 — block merge               |
| HIGH     | 0     | 0 — block merge               |
| MEDIUM   | 0     | ≤2 with accepted-debt comment |
| LOW      | 0     | ≤5                            |

**Result:** APPROVE / REQUEST_CHANGES
