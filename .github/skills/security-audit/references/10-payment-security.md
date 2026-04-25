# Reference 10 — Payment Security (Stripe)

## Files to Read

- `backend/src/modules/payments/payments.routes.js`
- `backend/src/modules/payments/payments.service.js`
- `backend/src/modules/payments/payments.constants.js`
- `backend/src/index.js` — middleware ordering for webhook route
- `frontend/studyhub-app/src/pages/pricing/PricingPage.jsx`
- `frontend/studyhub-app/src/pages/settings/SubscriptionTab.jsx`

---

## Check 10.1 — Stripe Webhook Signature Verification (CRITICAL)

**Rule per CLAUDE.md:** The webhook endpoint MUST use `express.raw()` (NOT `express.json()`) and verify the signature via `stripe.webhooks.constructEvent()`.

**Verify in `backend/src/index.js` — CRITICAL middleware ordering:**

```js
// CORRECT — raw body parser BEFORE global json middleware
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  paymentWebhookLimiter,
  paymentsController.handleWebhook,
)

// express.json() applied AFTER webhook route
app.use(express.json())
```

**If `express.json()` is applied globally before the webhook route, `req.body` is parsed as object and `constructEvent()` will throw because it needs the raw Buffer.**

**Verify in webhook handler:**

```js
// CORRECT
const sig = req.headers['stripe-signature']
const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
```

**Violation:** Webhook stored without signature verification → attacker can forge subscription events → CRITICAL.

---

## Check 10.2 — Webhook Buffer Guard

**Verify the webhook controller checks `Buffer.isBuffer(req.body)`:**

```js
// CORRECT
if (!Buffer.isBuffer(req.body)) {
  return sendError(res, 400, 'Webhook body must be raw buffer', ERROR_CODES.BAD_REQUEST)
}
```

This prevents accidental double-parsing if middleware ordering changes in the future.

---

## Check 10.3 — No Stripe Keys in Frontend Code

**Rule:** `STRIPE_SECRET_KEY` must NEVER appear in frontend code. The publishable key (`pk_live_...` / `pk_test_...`) is acceptable in frontend, but even that should come from the backend via a config endpoint or build-time env var.

**Grep (frontend directory):**

```
STRIPE_SECRET\|sk_live_\|sk_test_
```

Any match → CRITICAL.

---

## Check 10.4 — CSRF on Checkout and Portal Endpoints

**Rule per CLAUDE.md:** CSRF origin check on all payment POST routes.

**Verify in `payments.routes.js`:**

```js
router.post('/checkout/subscription', requireAuth, csrfCheck, paymentCheckoutLimiter, ...)
router.post('/checkout/donation', requireAuth, csrfCheck, paymentCheckoutLimiter, ...)
router.post('/portal', requireAuth, csrfCheck, paymentPortalLimiter, ...)
```

**Webhook route is EXEMPT** from CSRF (it's Stripe's server calling, not a browser).

---

## Check 10.5 — Rate Limiters on Payment Endpoints

**Rule per CLAUDE.md:** All payment endpoints use centralized rate limiters from `rateLimiters.js`.

Required limiters:
| Limiter Name | Endpoint | Limit |
|---|---|---|
| `paymentCheckoutLimiter` | POST checkout | 10/15min per user |
| `paymentPortalLimiter` | POST portal | 10/15min per user |
| `paymentReadLimiter` | GET payment history | 60/min |
| `paymentWebhookLimiter` | POST webhook | 100/min by IP |

**Grep:**

```
paymentCheckoutLimiter\|paymentPortalLimiter\|paymentReadLimiter\|paymentWebhookLimiter
```

Verify all four are defined in `rateLimiters.js` and applied on the correct routes.

---

## Check 10.6 — Donation Amount Bounds Validation

**Rule per CLAUDE.md:** Min $1, max $1000 for donation `unit_amount`.

**Verify in `payments.service.js`:**

```js
// CORRECT
if (amount < 100 || amount > 100000) {
  // cents
  throw new Error('Donation amount out of range')
}
```

**Violation:** No server-side bounds check → attacker can create a $0.01 donation or a $999,999 donation → MEDIUM.

---

## Check 10.7 — Subscription Status Verified Server-Side

**Rule:** Plan feature gates (AI quota, Pro features) must check the subscription status from the `Subscription` table, NOT from a client-supplied value.

**Verify in `getUserPlan()` in `ai.service.js`:**

```js
// CORRECT
const subscription = await prisma.subscription.findFirst({
  where: { userId, status: 'active' },
})
return subscription ? subscription.plan : 'free'
```

**Violation:** Plan level comes from JWT payload without fresh DB lookup → attacker modifies cookie → bypasses all Pro restrictions → HIGH.

---

## Severity Reference for Payment Security Issues

| Issue                                  | OWASP | Severity |
| -------------------------------------- | ----- | -------- |
| Webhook without signature verification | A08   | CRITICAL |
| Stripe secret key in frontend          | A02   | CRITICAL |
| `express.json()` before webhook route  | A08   | CRITICAL |
| No CSRF on checkout/portal             | A01   | HIGH     |
| Plan level from JWT (no DB lookup)     | A01   | HIGH     |
| No rate limiter on checkout            | A05   | MEDIUM   |
| No donation amount bounds check        | A03   | MEDIUM   |
