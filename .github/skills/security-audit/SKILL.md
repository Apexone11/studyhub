---
name: security-audit
description: 'Industry-grade security audit skill for StudyHub. Use when: security review, OWASP audit, pen test prep, vulnerability scan, security hardening, auth review, IDOR check, CSRF check, XSS check, rate limit review, injection audit, feature security review, pre-deployment security gate, reviewing new endpoints, checking new components, AI security, payment security, HTML sanitization, block/mute bypass, flag fail-closed, PII leakage, JWT review, cookie flags, RBAC, owner checks, input validation, Zod schema, file upload security, socket.io auth, supply chain audit, env var audit.'
argument-hint: "Scope of audit: 'full', 'backend', 'frontend', 'new-feature: <description>', 'file: <path>', or 'owasp: <category>'"
---

# StudyHub Security Audit Skill

## Purpose

Performs an exhaustive, industry-grade security review of StudyHub code. Produces severity-ranked findings with `file:line` evidence, exact remediation code, and a signed-off audit verdict. Covers all OWASP Top 10 categories plus project-specific threat models.

## When to Invoke

- Before merging any PR that touches auth, payments, AI, or user data
- When adding a new API endpoint or React component
- When reviewing a feature against the roadmap security addendum
- When preparing for production deployment
- When a new dependency is added
- On-demand: `security-audit full`

---

## Audit Execution Protocol

### Phase 0 — Scope Resolution (always run first)

1. Read `CLAUDE.md` (root) for locked decisions and architecture facts
2. Read `.github/instructions/code-review.instructions.md` for project-specific bug patterns
3. Determine audit scope from argument (default: `full`)
4. If scope is `new-feature`, also read the relevant section of `docs/internal/audits/2026-04-24-feature-expansion-security-addendum.md`
5. Load repo memory files for prior findings

### Phase 1 — Static Analysis (run all 20 checks)

Execute every check in [./references/checklist-static.md](./references/checklist-static.md) in order. Each check has:

- **What to grep/read** — exact pattern
- **What constitutes a finding** — severity + evidence format
- **Remediation template** — exact code fix

### Phase 2 — Architecture Review

Run checks from [./references/checklist-architecture.md](./references/checklist-architecture.md):

- Auth flow completeness
- Authorization boundary enforcement
- Cross-cutting concern coverage (block/mute, AI quota, notification caps)

### Phase 3 — OWASP Top 10 Mapping

Map every finding to an OWASP category using [./references/owasp-mapping.md](./references/owasp-mapping.md). A finding without an OWASP category is incomplete.

### Phase 4 — Cross-File Consistency

For every changed or audited file:

1. Find all direct callers (grep imports + usages)
2. Verify callers still conform to the contract
3. Verify test mocks match real response shapes
4. Verify `CLAUDE.md` / `docs/internal/` documentation reflects behavior

### Phase 5 — Report Generation

Produce the [structured report](#output-format) with:

- Severity-ordered findings (CRITICAL → LOW)
- OWASP category for each finding
- `file:line` evidence — never vague references
- Exact remediation code blocks
- Audit verdict: PASS / CONDITIONAL PASS / FAIL

---

## Output Format

```
## Security Audit Report — [scope] — [date]

### Executive Summary
<2-3 sentences: what was audited, risk posture, overall verdict>

### Findings

#### CRITICAL (block deployment)
| # | File:Line | OWASP | Description | Remediation |
|---|-----------|-------|-------------|-------------|

#### HIGH (fix before merge)
| # | File:Line | OWASP | Description | Remediation |

#### MEDIUM (fix in same sprint)
| # | File:Line | OWASP | Description | Remediation |

#### LOW (track as tech debt)
| # | File:Line | OWASP | Description | Remediation |

#### INFORMATIONAL
| # | File:Line | Note |

### Locked Decision Compliance
<For each CLAUDE.md §12 locked decision relevant to this scope: COMPLIANT / VIOLATION + evidence>

### Security Checklist Sign-Off
<Checkbox state for all 20 static checks>

### Verdict
PASS / CONDITIONAL PASS / FAIL — with reasoning
```

---

## 20-Category Static Analysis Checklist

Each category has a dedicated reference doc with grep patterns and remediation templates.

| #   | Category                             | Reference                                                                  |
| --- | ------------------------------------ | -------------------------------------------------------------------------- |
| 1   | Authentication & Session             | [./references/01-auth-session.md](./references/01-auth-session.md)         |
| 2   | Authorization & RBAC                 | [./references/02-authz-rbac.md](./references/02-authz-rbac.md)             |
| 3   | Input Validation & Sanitization      | [./references/03-input-validation.md](./references/03-input-validation.md) |
| 4   | Rate Limiting & DoS Prevention       | [./references/04-rate-limiting.md](./references/04-rate-limiting.md)       |
| 5   | CSRF Protection                      | [./references/05-csrf.md](./references/05-csrf.md)                         |
| 6   | HTML/Content Security & XSS          | [./references/06-html-xss.md](./references/06-html-xss.md)                 |
| 7   | SQL / ORM Injection                  | [./references/07-injection.md](./references/07-injection.md)               |
| 8   | Block/Mute System Integrity          | [./references/08-block-mute.md](./references/08-block-mute.md)             |
| 9   | AI Security (PII, HMAC, Quota)       | [./references/09-ai-security.md](./references/09-ai-security.md)           |
| 10  | Payment Security (Stripe)            | [./references/10-payment-security.md](./references/10-payment-security.md) |
| 11  | Feature Flag Fail-Closed             | [./references/11-feature-flags.md](./references/11-feature-flags.md)       |
| 12  | File Upload Security                 | [./references/12-file-upload.md](./references/12-file-upload.md)           |
| 13  | Real-Time / Socket.io Security       | [./references/13-socketio.md](./references/13-socketio.md)                 |
| 14  | Error Handling & Information Leakage | [./references/14-error-leakage.md](./references/14-error-leakage.md)       |
| 15  | Environment Variables & Secrets      | [./references/15-secrets.md](./references/15-secrets.md)                   |
| 16  | CORS & Origin Policy                 | [./references/16-cors-origin.md](./references/16-cors-origin.md)           |
| 17  | Database Migration Safety            | [./references/17-migration-safety.md](./references/17-migration-safety.md) |
| 18  | Frontend Security Patterns           | [./references/18-frontend.md](./references/18-frontend.md)                 |
| 19  | Supply Chain & Dependencies          | [./references/19-supply-chain.md](./references/19-supply-chain.md)         |
| 20  | Logging, Monitoring & PII            | [./references/20-logging-pii.md](./references/20-logging-pii.md)           |

---

## Severity Definitions

| Severity     | Definition                                                                                                      | Action                       |
| ------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **CRITICAL** | Exploitable without auth, or leads to account takeover, data exfiltration, RCE, or bypasses a security boundary | Block deployment immediately |
| **HIGH**     | Exploitable with standard user auth, leads to privilege escalation, IDOR, or persistent XSS                     | Block merge                  |
| **MEDIUM**   | Exploitable under specific conditions, leads to data leakage, DoS, or security control degradation              | Fix in same sprint           |
| **LOW**      | Defense-in-depth improvement, audit logging gap, documentation missing                                          | Tech debt backlog            |
| **INFO**     | Pattern observation, no exploitability — informational only                                                     | No action required           |

---

## Project-Specific Threat Model

### Critical Security Boundaries

1. **Authentication boundary** — HTTP-only cookie `studyhub_session` + CSRF token `x-csrf-token`
2. **Authorization boundary** — `requireAuth` middleware + DB-fresh role lookup in `requireAdmin`
3. **Content security boundary** — HTML tier classification pipeline (Tier 0-3)
4. **AI boundary** — Per-user daily quota + PII redaction (PII redaction: OPEN GAP — see [./references/09-ai-security.md](./references/09-ai-security.md))
5. **Payment boundary** — Stripe webhook HMAC + `express.raw()` body verification
6. **Flag boundary** — Fail-closed evaluation (`enabled=true` only)
7. **Block boundary** — Bidirectional; try-catch graceful degradation required

### Known Open Gaps (as of 2026-04-24)

These are documented open gaps — not regressions. Track whether they've been closed.

| Gap                                                          | Severity | Reference       | Status        |
| ------------------------------------------------------------ | -------- | --------------- | ------------- |
| AI PII redaction (emails/phones in AI input/output)          | HIGH     | Decision #17    | OPEN          |
| HMAC on AI suggestions                                       | MEDIUM   | Decision #18    | OPEN          |
| AI rate limiter not in `rateLimiters.js` central export      | MEDIUM   | rateLimiters.js | VERIFY        |
| Video upload endpoint security (if added)                    | HIGH     | Decision #15    | NOT YET BUILT |
| Multi-file sheet iframe isolation (`sheets.getstudyhub.org`) | CRITICAL | Decision #13    | NOT YET BUILT |
| Self-learner cross-school mutations blocked server-side      | HIGH     | Decision #2     | VERIFY        |

---

## Locked Decision Compliance Table (CLAUDE.md §12)

Every audit must verify these. A violation is an automatic CRITICAL finding.

| #   | Decision                                             | Check                                                                |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Parallel schools — no `primarySchoolId`              | grep `primarySchoolId` in any new code                               |
| 2   | Cross-school read-only for self-learners             | Any new cross-school mutation endpoint?                              |
| 3   | `teacherOf[]` + `studentOf[]` not `accountType` enum | grep `accountType` as a branching condition                          |
| 4   | Video captions required for official content         | Any new video upload endpoint? Caption field present?                |
| 5   | Max video length 10 min                              | Any new video endpoint? Size/duration validation?                    |
| 6   | Multi-file sheets flat folder v1                     | Any new sheet upload? Folder nesting?                                |
| 7   | Multi-file preview 500ms debounce + pause toggle     | Any new preview component?                                           |
| 8   | Note Review default visibility private               | Any new Note Review feature? Default public?                         |
| 9   | AI summarization trigger 20 highlights               | Any new AI summarization feature? Hard-coded trigger?                |
| 10  | AI Note Review counts global quota                   | Any new AI endpoint? Using global quota counter?                     |
| 13  | Multi-file sheets from `sheets.getstudyhub.org`      | Any multi-file sheet rendering? Subdomain enforced?                  |
| 14  | Enrollment is self-claimed, not security boundary    | Any server-side enrollment verification as auth gate?                |
| 15  | No video URL embeds (SSRF surface)                   | Any new video embed feature? URL embeds blocked?                     |
| 16  | Admins un-blockable, mutable                         | Any new block logic? Admins excluded?                                |
| 17  | AI PII redaction (both input and output)             | Any new AI endpoint? PII stripped?                                   |
| 18  | HMAC on AI suggestions                               | Any AI suggestion endpoint? HMAC present?                            |
| 20  | Flag evaluation fail-closed                          | Any new flag check? Uses `useDesignV2Flags`? Returns false on error? |

---

## Historical Bug Patterns (Must Check Every Audit)

These have caused production incidents. Actively search for regressions.

```
PATTERN 1: Missing credentials: 'include'
  grep: fetch.*${API}.*without credentials: 'include'
  Severity: HIGH
  Test vector: run on split-origin beta stack → silent 401

PATTERN 2: Inline rate limiter
  grep: rateLimit({ in any file EXCEPT rateLimiters.js
  Severity: MEDIUM

PATTERN 3: Unguarded getBlockedUserIds / getMutedUserIds
  grep: getBlockedUserIds|getMutedUserIds
  Check: every call site has try-catch with [] fallback
  Severity: MEDIUM

PATTERN 4: Prisma null syntax (Prisma 6.x)
  grep: { not: null }
  Fix: NOT: [{ field: null }]
  Severity: HIGH (crashes production queries)

PATTERN 5: Search response shape misuse
  grep: data\.users|data\.sheets|data\.notes (from /api/search)
  Fix: data.results.users etc.
  Severity: HIGH (silent undefined crash)

PATTERN 6: Socket.io event string literals
  grep: socket\.(on|emit)\(['"]message:|socket\.(on|emit)\(['"]typing:
  Fix: import from socketEvents.js constants
  Severity: MEDIUM

PATTERN 7: Modal inside animated container (no portal)
  grep: position.*fixed inside AnimatedFadeInUp|anime
  Fix: createPortal(jsx, document.body)
  Severity: LOW (UX bug, not security)

PATTERN 8: Schema model without migration
  Compare: prisma/schema.prisma models vs migrations/*/migration.sql CREATE TABLE
  Severity: CRITICAL (relation does not exist in production)

PATTERN 9: useFetch transform in dep array
  grep: transform.*useCallback|transform.*useEffect
  Severity: MEDIUM (infinite loop)

PATTERN 10: Silent catch wrong shape
  grep: catch.*return {}|catch.*return null (when caller expects array)
  Severity: HIGH (crash: null.slice, {}.map)

PATTERN 11: FLAG_NOT_FOUND fail-open regression
  grep: FLAG_NOT_FOUND.*true|enabled.*true.*default
  Severity: CRITICAL (decision #20 violation)

PATTERN 12: console.log with user data
  grep: console\.log.*req\.body|console\.log.*user\.|console\.log.*email
  Severity: HIGH (PII in logs)
```
