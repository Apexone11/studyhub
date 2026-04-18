# Settings & Sessions Polish + Geo-Based Login Security

**Date:** 2026-04-17
**Author:** brainstorming session with Abdul
**Status:** draft for review

## 1. Purpose

Improve the user-friendliness of three existing StudyHub surfaces without a large redesign, and add a new geo-aware login security layer that catches account takeovers from unexpected locations.

Target surfaces:

1. **Settings page** — polish only; no IA change.
2. **Free plan identity** — replace generic "F" tile with the StudyHub brand mark.
3. **Sessions tab (Settings > Sessions)** — nicer visual treatment, per-device-type icons, clearer revoke action.
4. **New:** device-trust model + geo-based login risk scoring + new-location email alerts + step-up verification for risky logins.

Non-goals:

- No full settings redesign, no new theming system, no password reset flow changes.
- No passkeys / WebAuthn, no SMS 2FA, no hardware-key support, no device fingerprinting beyond user-agent + device cookie.
- No country allow/deny lists in v1 (user-hostile for travelers; revisit later).

## 2. Existing state (audit summary)

Captured from a full codebase audit on 2026-04-17. Load-bearing facts for this design:

- **Settings page:** `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx` — 11 tabs, 2-column layout, all tokens use `--sh-*` CSS vars, shared primitives in `settingsShared.jsx`.
- **Sessions tab:** `frontend/studyhub-app/src/pages/settings/SessionsTab.jsx` (203 lines) already calls `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`, `DELETE /api/auth/sessions`. Server-side UA parser `parseDeviceLabel()` lives in `backend/src/modules/auth/session.service.js:17-36`.
- **Session model** (`backend/prisma/schema.prisma:2143-2160`): `id, userId, jti, userAgent, ipAddress, deviceLabel, lastActiveAt, expiresAt, revokedAt, createdAt`. IP is stored but not geolocated.
- **Free plan "F" tile:** hardcoded `<div>F</div>` in `SubscriptionTab.jsx:404-412` and `PricingPage.jsx`.
- **Brand mark:** `LogoMark` component already in `frontend/studyhub-app/src/components/Icons.jsx:501-530` — 56×56 SVG, reusable at any size.
- **Icon system:** custom `Icons.jsx` SVGs; no external icon library. Material Symbols is used as a fallback in one spot in SessionsTab — we will replace it with native Icons.jsx SVGs.
- **Security primitives already present:**
  - `SecurityEvent` table (`schema.prisma:2166-2180`) + `logSecurityEvent()` helper.
  - 2FA fields on `User` (not wired for login-step-up).
  - `emailVerificationCode` + `emailVerificationExpiry` fields (reusable for step-up challenge).
  - `failedAttempts` + `lockedUntil` for account lockout.
  - `authLoginLimiter` (10/15min/IP).
- **Security gaps:** no geo-IP lookup; no cross-session anomaly detection; no login history UI; no new-device / new-location alerts.

## 3. Design

### 3.1 Settings page polish (no IA change)

| Change                   | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-tab icons            | Add an icon column to the left sidebar using existing `Icons.jsx` components. Mapping: Profile→`IconProfile`, Security→`IconShield`, Sessions→new `IconMonitor`, Notifications→`IconBell`, Privacy→new `IconEye`, Appearance→new `IconPalette`, Account→`IconUser`, Subscription→`IconSpark`, Referrals→`IconUsers`, Legal→new `IconScroll`, Moderation→`IconFlag`, Leave a Review→`IconStar`. New icons live in the same `Icons.jsx` file, same stylistic family. |
| Active-tab accent        | 3px left accent bar in `--sh-brand` instead of full-pill fill. Keeps current pill for hover. GitHub-style.                                                                                                                                                                                                                                                                                                                                                         |
| SectionCard consistency  | Sessions currently doesn't use `SectionCard`. Port it so headings and actions line up with other tabs.                                                                                                                                                                                                                                                                                                                                                             |
| No token/spacing changes | Existing `--sh-*` variables are respected. No new CSS custom properties.                                                                                                                                                                                                                                                                                                                                                                                           |
| No IA change             | 11 tabs stay in the current order. No tabs added/removed/renamed in this spec.                                                                                                                                                                                                                                                                                                                                                                                     |

### 3.2 Free plan identity

- Replace the hardcoded `F` div in `SubscriptionTab.jsx:404-412` with `<LogoMark />` rendered at 32px inside the existing 48×48 `--sh-soft` tile.
- Replace the equivalent `F` in the Pricing page's Free-plan card the same way.
- Paid plans (`pro_monthly`, `pro_yearly`, `donor`) continue using their `/images/plan-*.png` art — unchanged.

### 3.3 Sessions tab — visual refresh + device icons

**New device-kind derivation** (server-side, `session.service.js`):

```js
// deriveDeviceKind(userAgent): "desktop" | "laptop" | "mobile" | "tablet" | "watch" | "unknown"
// Heuristics:
//   iPad / Android tablet (Android UA without "Mobile") → "tablet"
//   iPhone / Android Mobile / Windows Phone → "mobile"
//   Apple Watch → "watch"
//   Mac / Windows / Linux / CrOS → "laptop" (we can't distinguish desktop vs laptop; pick laptop as default)
//   else → "unknown"
```

Output stored on `Session.deviceKind` (new column, nullable, short string).

**New icon components** in `Icons.jsx`:
`IconDeviceLaptop`, `IconDeviceDesktop`, `IconDeviceMobile`, `IconDeviceTablet`, `IconDeviceWatch`, `IconDeviceUnknown`. All 24×24 viewBox, `currentColor`, same stroke-family as existing icons. No emoji anywhere.

**Browser/OS secondary glyphs:** trademark-safe generic shapes (not the real Chrome/Apple logos) rendered as thin-stroked SVGs next to the text label. Five browsers: Chrome-ish, Safari-ish, Firefox-ish, Edge-ish, generic. Five OSes: Windows-ish, macOS-ish, iOS-ish, Android-ish, Linux-ish.

**Row layout** (card, not table):

```
┌─────────────────────────────────────────────────────────────────────┐
│ [DeviceIcon 48]   MacBook · Chrome on macOS     [This device]       │
│                   Baltimore, MD · US · 104.156.87.55                │
│                   Signed in 2w ago · Last active 3m ago             │
│                                                         [Revoke]    │
└─────────────────────────────────────────────────────────────────────┘
```

- Current device: keep existing blue outline + "This device" chip.
- Non-current devices: prominent `Revoke` button on the right (today's version is too understated).
- Bulk bar ("Sign out all other devices") becomes a sticky footer _within the Sessions tab container_ (not viewport-sticky) when `otherSessions >= 2`.
- Revoke flow: confirm modal → optimistic remove → toast. Reuses existing `DELETE /api/auth/sessions/:id` route.

**User's "auto-remove unless sign back in" behavior** is already the default: a revoked session is gone; when the user signs back in from that browser, it becomes a brand-new session (and — with §3.5 below — triggers the new-device flow).

### 3.4 Device trust model

**New table `TrustedDevice`:**

```prisma
model TrustedDevice {
  id            String    @id @default(cuid())
  userId        Int
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceId      String    // 128-bit random, stored in httpOnly cookie "sh_did"
  label         String    // parsed label, e.g. "Chrome on Windows"
  firstSeenAt   DateTime  @default(now())
  lastSeenAt    DateTime  @default(now())
  lastIp        String?   @db.VarChar(45)
  lastCountry   String?   @db.VarChar(2)    // ISO-3166-1 alpha-2
  lastRegion    String?   @db.VarChar(10)   // ISO-3166-2 subdivision
  trustedAt     DateTime?                   // null = unverified
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())
  sessions      Session[]

  @@unique([userId, deviceId])
  @@index([userId])
}
```

**Session model gains:**

```prisma
model Session {
  // ... existing fields ...
  deviceKind       String?         @db.VarChar(16)   // "laptop" | "mobile" | ...
  country          String?         @db.VarChar(2)
  region           String?         @db.VarChar(10)
  city             String?         @db.VarChar(128)
  riskScore        Int?                              // 0–100 at login time
  trustedDeviceId  String?
  trustedDevice    TrustedDevice?  @relation(fields: [trustedDeviceId], references: [id])
}
```

**Cookie `sh_did`:** httpOnly, secure, sameSite=lax, path=/, 10-year expiry. Set on first successful login that didn't already have one. NOT tied to auth; survives logout so we can still identify the device.

### 3.5 Geo-based login risk layer

**IP → location:** MaxMind GeoLite2-City free DB, loaded in memory via the `maxmind` npm package, refreshed weekly by a cron (`npm run update-geoip-db`). ~70MB on disk. No per-request external API cost. No data leaves our server. (Alternative considered: ipinfo.io free tier 50k/mo — rejected for operational dependency + privacy.)

**Risk scoring** runs in the login controller _after_ password verification but _before_ the session cookie is issued. Signals + weights (constants, tunable):

| Signal                                                                  | Weight |
| ----------------------------------------------------------------------- | ------ |
| `sh_did` cookie missing OR not matched on this user                     | +30    |
| New country vs user's last 10 sessions' countries                       | +40    |
| New region (state/province) vs last 10 sessions                         | +15    |
| Impossible travel (>800 km/h between prior login and now)               | +50    |
| IP flagged anonymous / hosting (MaxMind GeoIP2-Anonymous-IP DB)         | +25    |
| UA family change on same device cookie                                  | +10    |
| 3+ failed password attempts against this userId in last 15 min (any IP) | +20    |

Bands:

- **< 30 "normal":** issue session; write `login.success` SecurityEvent with geo metadata.
- **30–59 "notify":** issue session; send _new-login-location_ email with "This wasn't me" revoke link (one-use signed token, 24h TTL).
- **≥ 60 "challenge":** pend the session; send a 6-digit code via the existing email-verification pipeline; session cookie is only issued after code validates. 3 bad codes → `lockedUntil = now + 15min` (existing mechanism). On success, set `TrustedDevice.trustedAt = now()`.

**Email template** (new): `new-login-location` — device, location, IP, timestamp, CTA buttons "This was me" (no-op, tracked) and "Revoke & reset password".

**User prefs** (new columns on existing `UserPreferences` model at `schema.prisma:776`):

- `alertOnNewCountry` — default `true`.
- `alertOnNewCity` — default `false`.
- `blockAnonymousIp` — default `false` (advanced).

### 3.6 Login activity UI

**Security tab** gains a "Login activity" section:

- Last 30 login events from `SecurityEvent` where `eventType IN ('login.success','login.challenge','login.blocked')`.
- Columns: device, browser/OS, location (city, region, country), IP, timestamp, risk badge (`Normal` / `Reviewed` / `Challenged` / `Blocked`).
- Each row has a "This wasn't me" action that (a) revokes the related session + trusted device and (b) forces a password reset email.
- Powered by a new route: `GET /api/auth/security/login-activity?limit=30`.

### 3.7 Additional cheap wins (Phase 4)

- **Sensitive-action re-auth:** if the current session's `TrustedDevice.trustedAt` is null, require email-code re-verification before change-email / change-password / delete-account endpoints.
- **Panic mode** button on Security tab: one click → revoke all sessions, rotate `sh_did` cookies, force password reset email.
- **Inactive-session sweeper:** cron auto-revokes any session with `lastActiveAt < now - 30 days`.

### 3.8 Explicitly deferred

Tracked here so nothing falls through the cracks:

- Backup codes for step-up (later; not in phases 1–4).
- Passkeys / WebAuthn (separate project).
- Country allow/deny lists (opt-in preference, later).
- Admin geo-abuse dashboard (separate internal project).
- Real-time anomaly ML (phase 4+).

## 4. Data model changes (summary)

New:

- `TrustedDevice` table (see §3.4).
- Fields on `Session`: `deviceKind`, `country`, `region`, `city`, `riskScore`, `trustedDeviceId`.
- Fields on `UserPreferences`: `alertOnNewCountry`, `alertOnNewCity`, `blockAnonymousIp`.

All changes require a new Prisma migration (per CLAUDE.md rule 4). Migration filename: `20260418000001_add_trusted_device_and_geo_fields`.

## 5. API surface changes

| Route                                    | Change                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`                   | Now runs risk scoring, may return `{ status: "challenge", challengeId }` instead of issuing a session cookie. |
| `POST /api/auth/login/challenge`         | New. Body `{ challengeId, code }`. Issues session + marks device trusted on success.                          |
| `GET /api/auth/sessions`                 | Now returns geo fields + `deviceKind` per session.                                                            |
| `DELETE /api/auth/sessions/:id`          | Unchanged path, but also marks the trusted device revoked.                                                    |
| `GET /api/auth/security/login-activity`  | New. Returns last N login events with geo + risk.                                                             |
| `POST /api/auth/security/panic`          | New. Revokes all sessions + rotates cookies + triggers password reset.                                        |
| `GET /api/auth/revoke-link/:token`       | New. Backs the "This wasn't me" email CTA.                                                                    |
| `GET /api/user/prefs/security` + `PATCH` | New. Alert prefs.                                                                                             |

All POST/DELETE routes continue to run through existing auth + CSRF + rate-limit middleware.

## 6. Rollout phases

| Phase  | Scope                                                                                                                     | Ship independently? |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **1a** | Visual polish only (icons per tab, accent bar, Free-plan LogoMark, session row redesign reusing existing data).           | Yes — no migration. |
| **1b** | `TrustedDevice` table + migration + `sh_did` cookie + `deviceKind` + session↔device link. Backend only.                   | Yes — no UX.        |
| **2**  | MaxMind integration + scoring module + `SecurityEvent` enrichment + Login Activity UI.                                    | Yes.                |
| **3**  | New-location email + step-up email challenge + `login/challenge` route + "This wasn't me" revoke link + user alert prefs. | Yes.                |
| **4**  | Sensitive-action re-auth + Panic mode + inactive-session sweeper.                                                         | Yes.                |

Each phase is independently valuable and revertible.

## 7. Risks & open questions

- **MaxMind DB freshness:** stale DB = wrong country attributions. Mitigation: weekly cron + staleness alert if DB older than 21 days.
- **False positives on mobile carriers:** some US carriers route traffic through out-of-state gateways. Mitigation: region mismatch is +15, not a challenge trigger by itself.
- **Legit travel triggering challenges:** the step-up challenge is email-based; if the user's email is itself attacker-controlled, step-up is useless. Panic mode + "This wasn't me" link partly mitigate but a real 2FA factor (phase 5+) is the long-term answer.
- **Cookie stripping:** if a user clears cookies routinely, every login looks like a new device. Weight is only +30, so clearing cookies alone doesn't trigger a challenge — country change + new device together do.
- **Open question:** should we show the MaxMind-derived city/region to the user verbatim ("Baltimore, MD") or coarsen to country only for privacy? Spec currently says city — revisit if legal/privacy has concerns.

## 8. Out of scope reminders

- No redesign of Profile, Notifications, Privacy, Appearance, Account, Referrals, Legal, Moderation, Leave-a-Review tabs beyond the per-tab icon + accent bar.
- No change to the CSS token system.
- No new external dependencies other than `maxmind` npm package + the GeoLite2 DB file.
- No emoji in any of the new UI (per CLAUDE.md rule 8).
