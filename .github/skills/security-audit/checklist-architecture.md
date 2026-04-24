# Architecture Security Checklist

Verify security boundaries and cross-cutting concerns at the architecture level.

---

## Auth Flow — End-to-End Verification

```
Browser
  │
  │  POST /api/auth/login   (credentials in body, rate-limited)
  ▼
Express
  │
  ├─ requireTrustedOrigin   (CSRF origin check — POST route)
  ├─ loginLimiter           (rate limit from rateLimiters.js)
  ├─ Zod body validation    (email, password, schema)
  ├─ bcrypt compare         (password hash)
  ├─ JWT sign               (payload: userId, role — no PII)
  └─ res.cookie('studyhub_session', token, { httpOnly, secure, sameSite:'lax' })

Browser (subsequent requests)
  │
  │  GET /api/<resource>    (cookie auto-sent, + x-csrf-token header on mutations)
  ▼
Express
  │
  ├─ requireAuth middleware
  │   ├─ reads cookie (not Authorization header)
  │   ├─ verifies JWT signature
  │   ├─ fresh DB lookup for user existence + ban check
  │   └─ sets req.user = { userId, role }
  │
  ├─ (mutation routes) CSRF middleware
  │   └─ verifies x-csrf-token header signature
  │
  ├─ (admin routes) requireAdmin
  │   └─ fresh DB lookup — does not trust req.user.role alone
  │
  └─ Controller
```

**Verify each step exists in the actual codebase before approving.**

---

## Security Boundaries — 7 Domains

| #   | Boundary                             | Enforcement Point                                 | Reference                |
| --- | ------------------------------------ | ------------------------------------------------- | ------------------------ |
| B1  | Unauthenticated / Authenticated      | `requireAuth` middleware                          | `01-auth-session.md`     |
| B2  | User / Admin                         | `requireAdmin` middleware (DB-verified)           | `02-authz-rbac.md`       |
| B3  | Own resource / Others' resource      | Owner check `existing.userId !== req.user.userId` | `02-authz-rbac.md`       |
| B4  | School-scoped content / Cross-school | Server-side enrollment verification               | `02-authz-rbac.md`       |
| B5  | User-generated HTML / Rendered DOM   | Scan pipeline (Tier 0-3) + DOMPurify              | `06-html-xss.md`         |
| B6  | User content / AI processing         | PII redaction both ways + HMAC                    | `09-ai-security.md`      |
| B7  | Payment actions / Standard API       | Stripe webhook signature + CSRF + rate limits     | `10-payment-security.md` |

---

## Cross-Cutting Concern Verification Matrix

For each new feature, verify ALL of these are addressed. A missing cell is a gap.

| Concern           | Auth Routes  | Sheet Routes           | Note Routes          | AI Routes        | Payment Routes         | Socket Events          |
| ----------------- | ------------ | ---------------------- | -------------------- | ---------------- | ---------------------- | ---------------------- |
| requireAuth       | public       | required               | required             | required         | required               | socket auth middleware |
| CSRF check        | POST login   | POST/PATCH/DELETE      | POST/PATCH/DELETE    | POST             | POST                   | N/A (separate)         |
| Rate limiting     | loginLimiter | sheetLimiter           | noteLimiter          | aiMessageLimiter | paymentCheckoutLimiter | per-socket             |
| Zod validation    | body         | body+params            | body+params          | body             | body                   | message schema         |
| Owner check       | N/A          | sheetId → sheet.userId | noteId → note.userId | conversationId   | userId match           | room auth              |
| Block/mute filter | N/A          | feed queries           | note search          | N/A              | N/A                    | message delivery       |
| sendError()       | yes          | yes                    | yes                  | yes              | yes                    | N/A (socket error)     |

---

## Threat Model Summary

### T1 — Unauthenticated Data Access

- **Attack:** Access API endpoints without `studyhub_session` cookie
- **Defense:** `requireAuth` on all non-public routes
- **Verify:** Run authenticated endpoints without cookie, expect 401

### T2 — Horizontal Privilege Escalation (IDOR)

- **Attack:** User A reads/mutates User B's resource by guessing IDs
- **Defense:** Owner check before any mutation; school scoping enforced server-side
- **Verify:** PATCH a resource with a different user's JWT, expect 403

### T3 — Vertical Privilege Escalation

- **Attack:** Student calls admin endpoint
- **Defense:** `requireAdmin` with fresh DB check (does not trust JWT role field)
- **Verify:** Call admin endpoint with student JWT, expect 403

### T4 — XSS via Stored HTML

- **Attack:** Upload malicious HTML sheet, victim views it and JS executes
- **Defense:** Tier 0-3 scan pipeline; Tier 3 quarantined; multi-file sheets sandboxed subdomain
- **Verify:** Upload `<script>alert(1)</script>` and observe tier classification

### T5 — CSRF (Cross-Site Request Forgery)

- **Attack:** Third-party site makes state-mutating request using victim's cookie
- **Defense:** `requireTrustedOrigin` or `x-csrf-token` header on all mutations
- **Verify:** POST from a non-allowed origin, expect 403

### T6 — SQL / NoSQL Injection

- **Attack:** Malicious input manipulates Prisma queries
- **Defense:** Parameterized queries only; no `$queryRaw` with user input; allowlist on dynamic fields
- **Verify:** Inject `'; DROP TABLE users; --` into search params

### T7 — Supply Chain / Dependency Compromise

- **Attack:** Malicious npm package runs code via postinstall or runtime
- **Defense:** `npm audit`, dependency restrictions per CLAUDE.md, no unreviewed new deps
- **Verify:** `npm audit --audit-level=high` returns clean

---

## Feature Expansion Security Checklist (Per Feature Track)

When a new feature track starts, verify the corresponding checklist from `docs/internal/audits/2026-04-24-feature-expansion-security-addendum.md`.

| Track                      | Security Addendum Section | Status                                  |
| -------------------------- | ------------------------- | --------------------------------------- |
| School-Scoped Discovery    | §School Track             | Pending                                 |
| Admin Video Announcements  | §Video Track              | Pending                                 |
| Multi-File HTML/CSS Sheets | §Multi-file Track         | Pending (Decision #13 CRITICAL pre-req) |
| Note Review Subsystem      | §Note Review Track        | Pending                                 |

For each track, the required-before-build checklist covers:

- IDOR tests
- Rate limiters
- Sanitization requirements
- Anchor validation
- Audit logs

**Rule:** Do not begin implementation of a track until all required-before-build items are PASSED.
