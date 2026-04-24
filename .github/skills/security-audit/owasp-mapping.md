# OWASP Top 10 2021 — StudyHub Mapping

Each OWASP category mapped to StudyHub-specific attack scenarios, defenses, reference files, and grep commands.

---

## A01 — Broken Access Control

**StudyHub Risk: CRITICAL** — Multi-user platform with sheet ownership, admin roles, school scoping.

| Scenario                                     | Location                            | Defense                                        | Reference                     |
| -------------------------------------------- | ----------------------------------- | ---------------------------------------------- | ----------------------------- |
| Unauthenticated API access                   | All routes                          | `requireAuth` middleware                       | `02-authz-rbac.md` §Check 2.1 |
| IDOR: access another user's sheet            | PATCH/DELETE `/api/sheets/:id`      | Owner check `sheet.userId !== req.user.userId` | `02-authz-rbac.md` §Check 2.2 |
| IDOR: read another user's DMs                | GET `/api/messages/:conversationId` | Participant check                              | `02-authz-rbac.md` §Check 2.2 |
| Student calling admin endpoint               | `/api/admin/*`                      | `requireAdmin` (DB-verified)                   | `02-authz-rbac.md` §Check 2.3 |
| Cross-school content mutation                | `/api/sheets?schoolId=X`            | Server-side enrollment check                   | `02-authz-rbac.md` §Check 2.4 |
| Self-learner write from cross-school context | Browse/discovery routes             | Server enforces read-only                      | `02-authz-rbac.md` §Check 2.8 |

**Grep for missing owner checks:**

```
prisma\.\w+\.update\(\{[\s\S]*?where:[\s\S]*?id:
```

Every update must have an owner verification before the Prisma call.

---

## A02 — Cryptographic Failures

**StudyHub Risk: HIGH** — JWT auth, Stripe webhooks, password hashing.

| Scenario                      | Location                        | Defense                      | Reference                            |
| ----------------------------- | ------------------------------- | ---------------------------- | ------------------------------------ |
| Weak JWT_SECRET               | `backend/src/lib/authTokens.js` | Minimum 32 chars, env var    | `01-auth-session.md` §Check 1.2      |
| JWT in localStorage           | Frontend auth                   | HTTP-only cookie only        | `01-auth-session.md` §Check 1.5      |
| Stripe webhook not verified   | `/api/payments/webhook`         | `constructEvent()` with HMAC | `10-payment-security.md` §Check 10.1 |
| ANTHROPIC_API_KEY in frontend | Any frontend file               | Server-only env var          | `15-secrets.md` §Check 15.6          |
| Stripe secret key in frontend | Any frontend file               | Server-only env var          | `15-secrets.md` §Check 15.5          |

**Grep:**

```
sk_live_|sk_test_|ANTHROPIC|JWT_SECRET.*=.*['"][a-z]{1,20}['"]
```

---

## A03 — Injection

**StudyHub Risk: HIGH** — Prisma queries with dynamic inputs, search endpoints.

| Scenario                        | Location           | Defense                                        | Reference                    |
| ------------------------------- | ------------------ | ---------------------------------------------- | ---------------------------- |
| SQL injection via $queryRaw     | Any raw query      | Never use template literals in $queryRaw       | `07-injection.md` §Check 7.1 |
| Dynamic orderBy from user input | Sheet/note listing | Allowlist `['asc','desc']`                     | `07-injection.md` §Check 7.2 |
| Prisma 6.x null syntax crash    | Filter queries     | Use `NOT: [{ field: null }]`                   | `07-injection.md` §Check 7.3 |
| Dynamic model name from user    | Any route          | Never pass user input to Prisma model selector | `07-injection.md` §Check 7.5 |

**Grep:**

```
\$queryRaw\`|queryRawUnsafe\(|prisma\[req\.\|prisma\[.*params
```

---

## A04 — Insecure Design

**StudyHub Risk: MEDIUM** — Flag evaluation, PII in AI pipeline, multi-file sheet isolation.

| Scenario                        | Location                     | Decision                         | Reference                         |
| ------------------------------- | ---------------------------- | -------------------------------- | --------------------------------- |
| Feature flag fail-open          | `backend/src/modules/flags/` | Decision #20: fail-CLOSED        | `11-feature-flags.md` §Check 11.1 |
| AI PII not stripped             | `backend/src/modules/ai/`    | Decision #17: OPEN GAP           | `09-ai-security.md` §Check 9.1    |
| Multi-file sheets same origin   | Sheet renderer               | Decision #13: subdomain required | `06-html-xss.md` §Check 6.8       |
| Video URL embeds (SSRF surface) | Upload routes                | Decision #15: uploads only       | `12-file-upload.md` §Check 12.6   |

---

## A05 — Security Misconfiguration

**StudyHub Risk: HIGH** — CORS, error leakage, missing headers.

| Scenario                        | Location               | Defense                            | Reference                         |
| ------------------------------- | ---------------------- | ---------------------------------- | --------------------------------- |
| CORS wildcard origin            | `backend/src/index.js` | Allowlist from env var             | `16-cors-origin.md` §Check 16.1   |
| Stack trace in error response   | Any error handler      | `sendError()` with generic message | `14-error-leakage.md` §Check 14.2 |
| No global error handler         | `backend/src/index.js` | 4-arg handler registered last      | `14-error-leakage.md` §Check 14.3 |
| process.env undocumented        | Any backend file       | All vars in `.env.example`         | `15-secrets.md` §Check 15.3       |
| Module-level process.env access | Any module             | Use getter function                | `15-secrets.md` §Check 15.4       |

**Grep:**

```
res\.status\(500\)\.json\(\{.*err\.message|res\.status\(500\)\.json\(\{.*err\.stack
```

---

## A06 — Vulnerable and Outdated Components

**StudyHub Risk: MEDIUM** — npm dependency hygiene.

| Scenario                        | Location        | Defense                        | Reference                        |
| ------------------------------- | --------------- | ------------------------------ | -------------------------------- |
| HIGH/CRITICAL npm CVE           | Both workspaces | `npm audit --audit-level=high` | `19-supply-chain.md` §Check 19.1 |
| New dep with postinstall script | `package.json`  | Review scripts before install  | `19-supply-chain.md` §Check 19.2 |
| Unapproved major version bump   | `package.json`  | Founder approval required      | `19-supply-chain.md` §Check 19.3 |
| GitHub URL dep                  | `package.json`  | npm registry only              | `19-supply-chain.md` §Check 19.6 |

---

## A07 — Identification and Authentication Failures

**StudyHub Risk: HIGH** — Login brute force, session fixation, JWT weaknesses.

| Scenario                      | Location               | Defense                               | Reference                        |
| ----------------------------- | ---------------------- | ------------------------------------- | -------------------------------- |
| Brute-force login             | POST `/api/auth/login` | `loginLimiter` rate limiter           | `04-rate-limiting.md` §Check 4.2 |
| Session not cleared on logout | Logout endpoint        | Cookie cleared + JTI revocation check | `01-auth-session.md` §Check 1.7  |
| Role not re-checked post-ban  | All auth routes        | Fresh DB lookup in `requireAuth`      | `01-auth-session.md` §Check 1.1  |
| Weak JWT_SECRET               | `authTokens.js`        | Minimum 32 chars, checked at startup  | `01-auth-session.md` §Check 1.2  |
| Token in URL query string     | Any redirect           | HTTP-only cookie only                 | `01-auth-session.md` §Check 1.5  |

---

## A08 — Software and Data Integrity Failures

**StudyHub Risk: MEDIUM** — AI suggestion tampering, CDN resources.

| Scenario                      | Location                  | Decision                           | Reference                        |
| ----------------------------- | ------------------------- | ---------------------------------- | -------------------------------- |
| AI suggestion lacks HMAC      | `backend/src/modules/ai/` | Decision #18: OPEN GAP             | `09-ai-security.md` §Check 9.2   |
| CDN resource without SRI      | Frontend HTML             | Integrity + crossorigin attributes | `19-supply-chain.md` §Check 19.5 |
| Hand-edited package-lock.json | `package-lock.json`       | Only via `npm install`             | `19-supply-chain.md` §Check 19.4 |

---

## A09 — Security Logging and Monitoring Failures

**StudyHub Risk: MEDIUM** — PII in logs, no structured security event log.

| Scenario                   | Location                | Defense                         | Reference                       |
| -------------------------- | ----------------------- | ------------------------------- | ------------------------------- |
| PII in console.log         | Any backend module      | No `console.log(req.body)` etc. | `20-logging-pii.md` §Check 20.1 |
| Sentry capturing passwords | Sentry init             | `beforeSend` scrubbing          | `20-logging-pii.md` §Check 20.4 |
| PostHog with PII           | Frontend telemetry      | Event properties ID-only        | `20-logging-pii.md` §Check 20.5 |
| No security event log      | `backend/src/lib/`      | `logSecurityEvent()` helper     | `20-logging-pii.md` §Check 20.6 |
| Auth events not logged     | Login/logout/fail paths | `logSecurityEvent` calls        | `20-logging-pii.md` §Check 20.6 |

---

## A10 — Server-Side Request Forgery (SSRF)

**StudyHub Risk: MEDIUM** — Video URL embeds, external URL fetches.

| Scenario                              | Location                      | Decision                                  | Reference                       |
| ------------------------------------- | ----------------------------- | ----------------------------------------- | ------------------------------- |
| Video URL embed (SSRF vector)         | Upload endpoint               | Decision #15: uploads only, no URL embeds | `12-file-upload.md` §Check 12.6 |
| External URL fetch without validation | Any service that fetches URLs | Allowlist or reject non-https             | —                               |
| Google Books API proxy (if proxied)   | Library module                | Verify URL is not user-supplied           | —                               |

**Grep for URL fetch from user input:**

```
fetch\(req\.\|axios\.get\(req\.\|http\.get\(req\.
```

---

## OWASP Risk Summary for StudyHub

| OWASP                         | Risk Level | Open Gaps                                                 |
| ----------------------------- | ---------- | --------------------------------------------------------- |
| A01 Broken Access Control     | CRITICAL   | Cross-school mutation (Decision #2)                       |
| A02 Cryptographic Failures    | HIGH       | None if JWT_SECRET ≥32 chars                              |
| A03 Injection                 | HIGH       | None if no $queryRaw template literals                    |
| A04 Insecure Design           | HIGH       | AI PII (Decision #17), subdomain isolation (Decision #13) |
| A05 Security Misconfiguration | HIGH       | None if CORS + errors correct                             |
| A06 Vulnerable Components     | MEDIUM     | Track with npm audit on each merge                        |
| A07 Auth Failures             | HIGH       | None if fresh DB lookup + rate limits                     |
| A08 Data Integrity            | MEDIUM     | HMAC on AI suggestions (Decision #18)                     |
| A09 Logging/Monitoring        | MEDIUM     | logSecurityEvent not verified                             |
| A10 SSRF                      | MEDIUM     | None if video URL embeds blocked                          |
