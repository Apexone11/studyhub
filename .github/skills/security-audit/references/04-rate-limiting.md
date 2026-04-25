# Reference 04 — Rate Limiting

## Files to Read

- `backend/src/lib/rateLimiters.js` — canonical limiter registry (49+ limiters)
- `backend/src/lib/constants.js` — `WINDOW_1_MIN`, `WINDOW_5_MIN`, `WINDOW_15_MIN`, `WINDOW_1_HOUR`, `WINDOW_1_DAY`
- `backend/src/index.js` — global limiter application
- `backend/src/lib/socketio.js` — per-socket rate limits

---

## Check 4.1 — No Inline Rate Limiters

**Rule (CLAUDE.md):** All rate limiters MUST be defined in `backend/src/lib/rateLimiters.js`. No inline `rateLimit({ windowMs: ..., max: ... })` in route files.

**Grep for inline limiters:**

```
rateLimit\(\s*\{
express-rate-limit.*windowMs
```

If any match appears OUTSIDE `rateLimiters.js`, it is a violation.

**Why:** Inline limiters drift in defaults, are invisible to ops, and create inconsistency across the codebase.

**Violation:**

```js
// WRONG — in any *.routes.js file
import rateLimit from 'express-rate-limit'
const writeLimiter = rateLimit({ windowMs: 60_000, max: 60 })
router.post('/something', writeLimiter, handler)
```

**Correct pattern:**

```js
// CORRECT — import from centralized registry
import { sheetWriteLimiter } from '../../lib/rateLimiters.js'
router.post('/', requireAuth, sheetWriteLimiter, handler)
```

---

## Check 4.2 — Required Limiter Inventory

For each endpoint category, verify the correct limiter is applied:

| Endpoint Category               | Required Limiter                 | Notes                          |
| ------------------------------- | -------------------------------- | ------------------------------ |
| `POST /api/auth/login`          | `authLoginLimiter`               | 15min / 10 attempts            |
| `POST /api/auth/register`       | `authRegisterLimiter`            | 1hr / 8                        |
| `POST /api/payments/checkout/*` | `paymentCheckoutLimiter`         | 15min / 10 per user            |
| `POST /api/payments/portal`     | `paymentPortalLimiter`           | 15min / 10                     |
| `GET /api/payments/*` (reads)   | `paymentReadLimiter`             | 60/min                         |
| `POST /api/payments/webhook`    | `paymentWebhookLimiter`          | 100/min by IP                  |
| Sheet write endpoints           | `sheetWriteLimiter`              | verify name in rateLimiters.js |
| Feed write endpoints            | `feedWriteLimiter`               | verify name                    |
| AI endpoints                    | `aiLimiter` (verify export name) | global + per-user quota        |
| Avatar upload                   | `uploadAvatarLimiter`            | verify name                    |
| `POST /api/messages`            | message write limiter            | 60 req/min                     |

**Verify export names match imports:**

```js
// rateLimiters.js must export all of these
export { ..., authLoginLimiter, authRegisterLimiter, paymentCheckoutLimiter, ... }
```

---

## Check 4.3 — Global Rate Limiter Application

**Verify in `backend/src/index.js`:**

```js
import { globalLimiter } from './lib/rateLimiters.js'
app.use(globalLimiter)
```

**Violation:** No global rate limiter → unbounded requests to any endpoint → MEDIUM

---

## Check 4.4 — Time Window Constants Usage

**Rule:** Rate limiter time windows MUST use named constants from `backend/src/lib/constants.js`.

```js
// CORRECT
import { WINDOW_15_MIN } from '../constants.js'
export const authLoginLimiter = rateLimit({ windowMs: WINDOW_15_MIN, max: 10 })

// WRONG
export const authLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })
```

**Grep for magic number windows:**

```
windowMs:.*\d+\s*\*\s*60
windowMs:.*\d{5,}
```

---

## Check 4.5 — Socket.io Per-Socket Rate Limits

**Location:** `backend/src/lib/socketio.js`

**Verify:**

- Typing events: 20 per minute per socket
- Join events: 30 per minute per socket
- Message events: some limit exists

**What to check:**

```js
// Pattern
const typingEventCount = { ... }
socket.on('typing:start', () => {
  if (typingEventCount[socket.id] > 20) return  // drop event
  // ...
})
```

**Violation:** No per-socket limits → typing/join event spam can block event loop → MEDIUM

---

## Check 4.6 — Rate Limit Key Strategy

**Default:** `express-rate-limit` uses `req.ip` as key. For auth-gated endpoints, per-user keying (by `req.user.userId`) is more accurate.

**Verify for checkout/AI limiter:**

```js
// CORRECT for per-user limiting
const paymentCheckoutLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 10,
  keyGenerator: (req) => req.user?.userId || req.ip, // ← per-user
})
```

**Violation:** Auth-gated endpoint uses only `req.ip` → multiple users sharing IP (university NAT) get penalized together → LOW

---

## Check 4.7 — Webhook Limiter by IP

**Rule:** Stripe webhook limiter MUST use IP-based key (not user-based, since webhooks have no session).

**Verify:**

```js
export const paymentWebhookLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 100,
  keyGenerator: (req) => req.ip,
})
```

---

## Severity Reference for Rate Limiting Issues

| Issue                                      | OWASP | Severity |
| ------------------------------------------ | ----- | -------- |
| Inline rate limiter in route file          | A05   | MEDIUM   |
| No rate limiter on auth login              | A07   | HIGH     |
| No rate limiter on checkout                | A05   | HIGH     |
| No global rate limiter                     | A05   | MEDIUM   |
| No socket per-event limits                 | A05   | MEDIUM   |
| Magic number time windows                  | —     | LOW      |
| IP-only key on user endpoint at university | —     | LOW      |
