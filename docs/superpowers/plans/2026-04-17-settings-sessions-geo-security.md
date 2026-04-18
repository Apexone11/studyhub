# Settings & Sessions Polish + Geo-Based Login Security — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish settings + sessions + free-plan identity (Phase 1a, pure frontend), then add a device-trust model (1b), geo-IP risk scoring with login activity UI (2), new-location email alerts + step-up challenge (3), and hardening extras (4).

**Architecture:** Frontend polish reuses the existing `Icons.jsx` + `settingsShared.jsx` primitives — no new dependencies, no token/spacing changes. Backend adds a new `TrustedDevice` table linked from `Session`, a long-lived httpOnly `sh_did` device cookie, a MaxMind GeoLite2 offline lookup module, and a risk-scoring module that gates the login controller. Email step-up reuses the existing `emailVerificationCode` pipeline. All phases ship independently.

**Tech Stack:** React 19, React Router 7, Vite 8 (frontend); Node 20, Express 5, Prisma 6 (PostgreSQL), Vitest + Supertest (backend); new deps: `maxmind` npm package + GeoLite2-City & GeoIP2-Anonymous-IP MMDB files (downloaded separately).

**Spec:** [docs/superpowers/specs/2026-04-17-settings-sessions-geo-security-design.md](../specs/2026-04-17-settings-sessions-geo-security-design.md)

---

## File Structure

### Phase 1a — Frontend polish (no backend, no migration)

- **Modify** `frontend/studyhub-app/src/components/Icons.jsx` — add `IconMonitor`, `IconPalette`, `IconScroll`, `IconUser` (nav icons for Sessions, Appearance, Legal, Account) and `IconDeviceLaptop`, `IconDeviceDesktop`, `IconDeviceMobile`, `IconDeviceTablet`, `IconDeviceWatch`, `IconDeviceUnknown` (session device icons). 10 new components, all 24×24 viewBox, `currentColor`.
- **Modify** `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx` — extend `NAV_TABS` with an `icon` field, render icon next to label, add 3px `--sh-brand` left accent bar on active tab.
- **Modify** `frontend/studyhub-app/src/pages/settings/SubscriptionTab.jsx` — replace the hardcoded `<div>F</div>` (lines 404–412) with `<LogoMark size={32} />` inside the same 48×48 `--sh-soft` tile.
- **Modify** `frontend/studyhub-app/src/pages/pricing/PricingPage.jsx` — add a small `<LogoMark size={32} />` badge at the top of the Free plan card, above `c.tierLabel`.
- **Rewrite** `frontend/studyhub-app/src/pages/settings/SessionsTab.jsx` — card layout with 48px device icon on the left, prominent `Revoke` button with confirm modal, sticky bulk-bar when `otherSessions >= 2`. Drop the `material-symbols-rounded` fallback. Use the new `IconDevice*` components via a `deviceIconFor(kindOrLabel)` resolver.
- **Create** `frontend/studyhub-app/src/pages/settings/ConfirmDialog.jsx` — small inline modal via `createPortal`, used for revoke confirm. Reuses `Button` from `settingsShared`.

### Phase 1b — Device identity (backend only, no UX change beyond sessions endpoint returning new fields)

- **Modify** `backend/prisma/schema.prisma` — add `TrustedDevice` model; add `deviceKind`, `country`, `region`, `city`, `riskScore`, `trustedDeviceId` to `Session`; add `alertOnNewCountry`, `alertOnNewCity`, `blockAnonymousIp` to `UserPreferences`.
- **Create** `backend/prisma/migrations/20260418000001_add_trusted_device_and_geo_fields/migration.sql` — full idempotent-safe SQL for the new table + columns + indexes.
- **Modify** `backend/src/modules/auth/session.service.js` — add exported `deriveDeviceKind(ua)` function; extend `createSession()` to accept `deviceId`, `deviceKind`; update `getActiveSessions()` to return new geo fields.
- **Create** `backend/src/modules/auth/trustedDevice.service.js` — `findOrCreateDevice({userId, deviceId, label, ip})`, `markTrusted(deviceId)`, `revokeDevice(deviceId)`, `getUserDevices(userId)`.
- **Create** `backend/src/lib/deviceCookie.js` — `getOrSetDeviceId(req, res)` reads/sets the httpOnly `sh_did` cookie (128-bit random, 10y).
- **Modify** `backend/src/modules/auth/auth.login.controller.js` — wire `getOrSetDeviceId` + `findOrCreateDevice` into the successful login path.
- **Modify** `backend/src/modules/auth/auth.session.controller.js` — update `DELETE /sessions/:id` handler to also revoke the `TrustedDevice`; update `GET /sessions` payload to include geo + device kind.
- **Create** `backend/src/modules/auth/session.service.test.js` — unit tests for `deriveDeviceKind` + `parseDeviceLabel`.
- **Create** `backend/src/modules/auth/trustedDevice.service.test.js` — unit tests.

### Phase 2 — Geo lookup + risk scoring + login activity UI

- **Modify** `backend/package.json` — add `maxmind` dep.
- **Create** `backend/src/lib/geoip.service.js` — lazy-load of MaxMind readers for `GeoLite2-City.mmdb` and `GeoIP2-Anonymous-IP.mmdb`; `lookup(ip)` returns `{ country, region, city, isAnonymous, lat, lon }` or `null`.
- **Create** `backend/scripts/updateGeoipDb.js` — fetches MaxMind GeoLite2 + Anonymous-IP DBs using `MAXMIND_LICENSE_KEY` env var; writes to `backend/geoip/`.
- **Modify** `backend/package.json` — add `"update-geoip-db": "node scripts/updateGeoipDb.js"` script.
- **Create** `backend/src/modules/auth/riskScoring.service.js` — pure function `scoreLogin({ user, deviceId, ip, ua, geo, recentSessions, failedAttemptsInWindow })` returns `{ score, signals }`.
- **Create** `backend/src/modules/auth/riskScoring.service.test.js` — unit tests covering each signal and the banding.
- **Modify** `backend/src/modules/auth/auth.login.controller.js` — call `geoip.lookup()` + `scoreLogin()`, attach `{country,region,city,riskScore}` to the new session row, write enriched `SecurityEvent`. Phase 2 acts only on the "normal" band (score <30); 30+ handling lands in Phase 3.
- **Modify** `backend/src/modules/auth/auth.session.controller.js` — new route `GET /security/login-activity`.
- **Create** `backend/src/modules/auth/login.activity.controller.js` — route handler for the new endpoint.
- **Modify** `backend/src/lib/rateLimiters.js` — add `loginActivityLimiter` (30/5min).
- **Modify** `frontend/studyhub-app/src/pages/settings/SecurityTab.jsx` — add "Login activity" `SectionCard` with rows showing device/location/risk badge + "This wasn't me" button (button wires in Phase 3).
- **Modify** `frontend/studyhub-app/src/pages/settings/SessionsTab.jsx` — render the new `country`/`region`/`city` fields from the sessions response.
- **Create** `backend/scripts/cron/geoipRefresh.cron.js` — weekly cron entry.

### Phase 3 — New-location email + step-up challenge + user alert prefs

- **Create** `backend/prisma/migrations/20260420000001_add_login_challenge/migration.sql` — new `LoginChallenge` table (`id`, `userId`, `pendingDeviceId`, `codeHash`, `attempts`, `expiresAt`, `consumedAt`, `createdAt`).
- **Modify** `backend/prisma/schema.prisma` — add `LoginChallenge` model.
- **Create** `backend/src/modules/auth/loginChallenge.service.js` — `create`, `verify`, `incrementAttempts`.
- **Create** `backend/src/emails/templates/newLoginLocation.js` — HTML + plaintext template.
- **Create** `backend/src/emails/templates/loginChallengeCode.js` — HTML + plaintext template.
- **Modify** `backend/src/modules/auth/auth.login.controller.js` — implement bands 30–59 (send email) and ≥60 (return `{ status: 'challenge', challengeId }` + email code).
- **Create** `backend/src/modules/auth/login.challenge.controller.js` — `POST /login/challenge` handler.
- **Modify** `backend/src/modules/auth/auth.routes.js` — wire new route.
- **Create** `backend/src/lib/revokeLinkTokens.js` — signed one-use tokens for "This wasn't me" CTA.
- **Create** `backend/src/modules/auth/revokeLink.controller.js` — `GET /revoke-link/:token`.
- **Modify** `backend/src/modules/auth/auth.session.controller.js` — add "This wasn't me" action on login-activity rows.
- **Create** `backend/src/modules/users/prefs.security.controller.js` — `GET`/`PATCH /api/user/prefs/security`.
- **Modify** `backend/src/modules/users/index.js` (or equivalent barrel) — wire new controller.
- **Create** `frontend/studyhub-app/src/pages/login/LoginChallengePage.jsx` — 6-digit code entry page.
- **Modify** `frontend/studyhub-app/src/pages/login/LoginPage.jsx` — detect `status: 'challenge'` and redirect to `/login/challenge/:id`.
- **Modify** `frontend/studyhub-app/src/App.jsx` (or wherever routes live) — register `/login/challenge/:id` route.
- **Modify** `frontend/studyhub-app/src/pages/settings/SecurityTab.jsx` — new "Security alerts" `SectionCard` with 3 toggles + wire "This wasn't me".

### Phase 4 — Re-auth on sensitive actions + panic mode + inactive sweeper

- **Create** `backend/src/middleware/requireTrustedDevice.js` — middleware that calls `requireAuth` + checks `req.sessionJti` → `Session.trustedDevice.trustedAt != null`; if not, returns 403 `{ error: 'reauth-required' }`.
- **Modify** `backend/src/modules/settings/settings.controller.js` (and/or account controller where change-email / change-password / delete-account live) — apply `requireTrustedDevice` middleware.
- **Create** `backend/src/modules/auth/panic.controller.js` — `POST /security/panic`.
- **Modify** `backend/src/modules/auth/auth.session.controller.js` — mount panic route (or create sibling route file).
- **Modify** `frontend/studyhub-app/src/pages/settings/SecurityTab.jsx` — "Danger Zone — Panic Mode" section with confirm modal + one-click revoke all + force password reset.
- **Modify** `frontend/studyhub-app/src/pages/settings/AccountTab.jsx`, `SecurityTab.jsx` — when a `reauth-required` 403 is returned, open the existing email-code modal, retry on success.
- **Create** `backend/scripts/cron/inactiveSessionSweep.cron.js` — daily cron revoking sessions with `lastActiveAt < now - 30 days`.
- **Modify** `backend/package.json` — register cron script.

---

## Task Sequence Overview

Phase 1a is standalone frontend and can ship first. Phase 1b lands the data model and populates it on new logins (backfill isn't needed — old sessions keep `NULL` device links and degrade gracefully). Phase 2 consumes the model and exposes the UI. Phase 3 turns on enforcement. Phase 4 is hardening.

**Testing convention:** for new pure functions, write a Vitest unit test first (red), then minimal implementation (green). For UI, write the component with a Playwright spec after the implementation (it's a UX-polish phase; exhaustive TDD on inline styles is low-value).

**Commit cadence:** commit at the end of each task (numbered below). The user asked "don't commit until you finish the job" — interpret "the job" as each coherent task; we still commit after each green test / each working feature. No WIP commits mid-task.

**Validation commands** (run at end of each phase):

```bash
npm --prefix frontend/studyhub-app run lint
npm --prefix frontend/studyhub-app run build
npm --prefix backend run lint
npm --prefix backend test
```

---

## Phase 1a — Frontend Polish

### Task 1a.1: Add 4 new nav icons to Icons.jsx

**Files:**

- Modify: `frontend/studyhub-app/src/components/Icons.jsx`

- [ ] **Step 1: Open `Icons.jsx` and append these 4 icons after `IconHeart` (current last export at line ~634)**

```jsx
// Monitor — desktop / sessions tab icon
export function IconMonitor({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <rect
        x="3"
        y="4"
        width="18"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <line
        x1="8"
        y1="20"
        x2="16"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="16"
        x2="12"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  )
}

// Palette — appearance tab
export function IconPalette({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path
        d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 0-4 2 2 0 0 1 2-2h3a5 5 0 0 0 5-5 10 10 0 0 0-10-9z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="7.5" cy="10.5" r="1.3" fill="currentColor" />
      <circle cx="12" cy="7.5" r="1.3" fill="currentColor" />
      <circle cx="16.5" cy="10.5" r="1.3" fill="currentColor" />
    </Svg>
  )
}

// Scroll — legal tab
export function IconScroll({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path
        d="M4 5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v13a3 3 0 0 0 3 3H8a3 3 0 0 1-3-3V8H3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="8"
        y1="8"
        x2="15"
        y2="8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="12"
        x2="15"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="16"
        x2="13"
        y2="16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  )
}

// User — account tab (simple person silhouette, distinct from IconProfile's fork-ish motif)
export function IconUser({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path
        d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  )
}
```

- [ ] **Step 2: Run the frontend linter**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS (no new warnings).

### Task 1a.2: Add 6 device-type icons to Icons.jsx

**Files:**

- Modify: `frontend/studyhub-app/src/components/Icons.jsx`

- [ ] **Step 1: Append these 6 device icons at the end of the file**

```jsx
// Device: laptop (default for Win/Mac/Linux/CrOS)
export function IconDeviceLaptop({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <rect
        x="4"
        y="5"
        width="16"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <path
        d="M2 19h20l-1.5 1.5H3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

// Device: desktop tower
export function IconDeviceDesktop({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <rect
        x="3"
        y="4"
        width="18"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <line
        x1="8"
        y1="20"
        x2="16"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="16"
        x2="12"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  )
}

// Device: mobile (phone)
export function IconDeviceMobile({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <rect
        x="7"
        y="2"
        width="10"
        height="20"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <line
        x1="11"
        y1="18"
        x2="13"
        y2="18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  )
}

// Device: tablet
export function IconDeviceTablet({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <rect
        x="4"
        y="3"
        width="16"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <circle cx="12" cy="18" r="0.8" fill="currentColor" />
    </Svg>
  )
}

// Device: watch
export function IconDeviceWatch({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path
        d="M8 8l1-5h6l1 5M8 16l1 5h6l1-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

// Device: unknown (generic question-mark tile)
export function IconDeviceUnknown({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <path
        d="M10 10a2 2 0 1 1 2.5 1.9c-.3.1-.5.4-.5.7V14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </Svg>
  )
}
```

- [ ] **Step 2: Run lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS.

### Task 1a.3: Add per-tab icons + accent bar to SettingsPage sidebar

**Files:**

- Modify: `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`

- [ ] **Step 1: Update the imports block (top of file, around line 8–32)**

Add this import after the existing component imports:

```jsx
import {
  IconProfile,
  IconShield,
  IconMonitor,
  IconBell,
  IconEye,
  IconPalette,
  IconUser,
  IconSpark,
  IconUsers,
  IconScroll,
  IconFlag,
  IconStar,
} from '../../components/Icons'
```

- [ ] **Step 2: Replace the `NAV_TABS` definition (currently lines 34–47) with this version that includes an `icon` field**

```jsx
const NAV_TABS = [
  { id: 'profile', label: 'Profile', icon: IconProfile },
  { id: 'security', label: 'Security', icon: IconShield },
  { id: 'sessions', label: 'Sessions', icon: IconMonitor },
  { id: 'notifications', label: 'Notifications', icon: IconBell },
  { id: 'privacy', label: 'Privacy', icon: IconEye },
  { id: 'appearance', label: 'Appearance', icon: IconPalette },
  { id: 'account', label: 'Account', icon: IconUser },
  { id: 'subscription', label: 'Subscription', icon: IconSpark },
  { id: 'referrals', label: 'Referrals', icon: IconUsers },
  { id: 'legal', label: 'Legal', icon: IconScroll },
  { id: 'moderation', label: 'Moderation', icon: IconFlag },
  { id: 'review', label: 'Leave a Review', icon: IconStar },
]
```

- [ ] **Step 3: Replace the `NAV_TABS.map((item) => ...)` button body inside the `<nav>` (currently lines 390–415) with this version**

The changes: render the icon alongside the label, and add a 3px `--sh-brand` left accent bar on the active tab by introducing a wrapper `<span>` for the bar.

```jsx
{
  NAV_TABS.map((item) => {
    const Icon = item.icon
    const active = tab === item.id
    return (
      <button
        key={item.id}
        type="button"
        className="settings-nav-btn"
        onClick={() => setTab(item.id)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          textAlign: 'left',
          padding: '10px 14px 10px 16px',
          marginBottom: 4,
          borderRadius: 10,
          border: 'none',
          background: active ? 'var(--sh-surface)' : 'transparent',
          color: active ? 'var(--sh-heading)' : 'var(--sh-muted)',
          fontSize: 14,
          fontWeight: active ? 700 : 500,
          cursor: 'pointer',
          boxShadow: active ? 'var(--shadow-sm)' : 'none',
          fontFamily: 'inherit',
        }}
      >
        {active && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: 6,
              bottom: 6,
              width: 3,
              borderRadius: 2,
              background: 'var(--sh-brand)',
            }}
          />
        )}
        <Icon size={18} />
        <span>{item.label}</span>
      </button>
    )
  })
}
```

- [ ] **Step 4: Run lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS.

- [ ] **Step 5: Run the frontend build**

```bash
npm --prefix frontend/studyhub-app run build
```

Expected: build completes; no new warnings about unused imports.

### Task 1a.4: Replace the "F" tile with LogoMark in SubscriptionTab

**Files:**

- Modify: `frontend/studyhub-app/src/pages/settings/SubscriptionTab.jsx`

- [ ] **Step 1: Add `LogoMark` import at the top of the file**

Find the existing import block and add:

```jsx
import { LogoMark } from '../../components/Icons'
```

- [ ] **Step 2: Replace lines 404–412 (the hardcoded `F` tile)**

Replace:

```jsx
<div
  style={{
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'var(--sh-soft)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 800,
    color: 'var(--sh-muted)',
    flexShrink: 0,
  }}
>
  F
</div>
```

With:

```jsx
<div
  style={{
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'var(--sh-soft)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  }}
  aria-label="StudyHub Free plan"
>
  <LogoMark size={32} />
</div>
```

- [ ] **Step 3: Lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS.

### Task 1a.5: Add LogoMark to PricingPage Free plan card

**Files:**

- Modify: `frontend/studyhub-app/src/pages/pricing/PricingPage.jsx`

- [ ] **Step 1: Add `LogoMark` import near the top**

```jsx
import { LogoMark } from '../../components/Icons'
```

- [ ] **Step 2: In the `tier === 'free'` branch (around line 311), inject the LogoMark badge as the first child of the outer div, before the existing `<span style={c.tierLabel}>Free</span>`**

```jsx
if (tier === 'free') {
  return (
    <div style={{ ...c.card, ...(isFreeUser ? {} : { opacity: 0.65 }) }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'var(--sh-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
        overflow: 'hidden',
      }} aria-label="StudyHub Free plan">
        <LogoMark size={32} />
      </div>
      <span style={c.tierLabel}>Free</span>
      {/* ... rest unchanged */}
```

Keep the rest of the free card body exactly as-is.

- [ ] **Step 3: Lint + build**

```bash
npm --prefix frontend/studyhub-app run lint
npm --prefix frontend/studyhub-app run build
```

Expected: PASS.

### Task 1a.6: Create ConfirmDialog.jsx

**Files:**

- Create: `frontend/studyhub-app/src/pages/settings/ConfirmDialog.jsx`

- [ ] **Step 1: Create the file with this content**

```jsx
import { createPortal } from 'react-dom'
import { Button } from './settingsShared'
import { FONT } from './settingsState'

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
  busy = false,
}) {
  if (!open) return null
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        fontFamily: FONT,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--sh-surface)',
          border: '1px solid var(--sh-border)',
          borderRadius: 14,
          padding: 22,
          maxWidth: 420,
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 17, color: 'var(--sh-heading)' }}>{title}</h3>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
          {body}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button
            secondary
            disabled={busy}
            onClick={onCancel}
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            {cancelLabel}
          </Button>
          <Button
            danger={danger}
            disabled={busy}
            onClick={onConfirm}
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 2: Lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS.

### Task 1a.7: Rewrite SessionsTab with device icons + confirm modal + card layout

**Files:**

- Modify: `frontend/studyhub-app/src/pages/settings/SessionsTab.jsx`

- [ ] **Step 1: Replace the entire file with this version**

```jsx
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { Button, Message, SectionCard } from './settingsShared'
import { FONT } from './settingsState'
import { Skeleton } from '../../components/Skeleton'
import { ConfirmDialog } from './ConfirmDialog'
import {
  IconDeviceLaptop,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDeviceWatch,
  IconDeviceUnknown,
} from '../../components/Icons'

function iconForSession(session) {
  // Phase 1a: derive from deviceLabel string because deviceKind
  // isn't sent by the server yet (that lands in Phase 1b).
  const kind = session.deviceKind || inferKindFromLabel(session.deviceLabel)
  switch (kind) {
    case 'laptop':
      return IconDeviceLaptop
    case 'desktop':
      return IconDeviceDesktop
    case 'mobile':
      return IconDeviceMobile
    case 'tablet':
      return IconDeviceTablet
    case 'watch':
      return IconDeviceWatch
    default:
      return IconDeviceUnknown
  }
}

function inferKindFromLabel(label) {
  const lc = (label || '').toLowerCase()
  if (lc.includes('ios') && lc.includes('ipad')) return 'tablet'
  if (lc.includes('android') && !lc.includes('mobile')) return 'tablet'
  if (lc.includes('ios') || lc.includes('android') || lc.includes('iphone')) return 'mobile'
  if (
    lc.includes('windows') ||
    lc.includes('macos') ||
    lc.includes('linux') ||
    lc.includes('chromeos')
  )
    return 'laptop'
  return 'unknown'
}

export default function SessionsTab() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState(null)
  const [actionMsg, setActionMsg] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null) // session object or 'all'

  const fetchSessions = useCallback(async () => {
    try {
      setError('')
      const res = await fetch(`${API}/api/auth/sessions`, { credentials: 'include' })
      if (!res.ok) throw new Error('Could not load sessions.')
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch (err) {
      setError(err.message || 'Failed to load sessions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  async function doRevoke(sessionId) {
    setRevoking(sessionId)
    setActionMsg(null)
    try {
      const res = await fetch(`${API}/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not revoke session.')
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      setActionMsg({ type: 'success', text: 'Device signed out.' })
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message })
    } finally {
      setRevoking(null)
      setConfirmTarget(null)
    }
  }

  async function doRevokeAll() {
    setRevoking('all')
    setActionMsg(null)
    try {
      const res = await fetch(`${API}/api/auth/sessions`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not revoke sessions.')
      }
      setSessions((prev) => prev.filter((s) => s.isCurrent))
      setActionMsg({ type: 'success', text: 'All other devices signed out.' })
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message })
    } finally {
      setRevoking(null)
      setConfirmTarget(null)
    }
  }

  if (loading) {
    return (
      <SectionCard title="Active Sessions" subtitle="Devices currently signed in to your account.">
        <Skeleton width="100%" height={72} style={{ marginBottom: 10 }} />
        <Skeleton width="100%" height={72} style={{ marginBottom: 10 }} />
        <Skeleton width="100%" height={72} />
      </SectionCard>
    )
  }

  if (error) {
    return (
      <SectionCard title="Active Sessions" subtitle="Devices currently signed in to your account.">
        <Message tone="error">{error}</Message>
        <Button
          onClick={() => {
            setLoading(true)
            fetchSessions()
          }}
        >
          Retry
        </Button>
      </SectionCard>
    )
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent)

  return (
    <SectionCard title="Active Sessions" subtitle="Devices currently signed in to your account.">
      {actionMsg && (
        <Message tone={actionMsg.type === 'success' ? 'success' : 'error'}>
          {actionMsg.text}
        </Message>
      )}

      {sessions.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--sh-muted)' }}>Only this device is signed in.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sessions.map((session) => {
          const Icon = iconForSession(session)
          const isCurrent = !!session.isCurrent
          return (
            <div
              key={session.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                padding: '16px 18px',
                borderRadius: 14,
                border: `1px solid ${isCurrent ? 'var(--sh-brand)' : 'var(--sh-border)'}`,
                background: isCurrent
                  ? 'var(--sh-brand-bg, rgba(99,102,241,0.06))'
                  : 'var(--sh-surface)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--sh-soft)',
                  color: isCurrent ? 'var(--sh-brand)' : 'var(--sh-muted)',
                  flexShrink: 0,
                }}
              >
                <Icon size={26} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--sh-text)',
                      fontFamily: FONT,
                    }}
                  >
                    {session.deviceLabel || 'Unknown device'}
                  </span>
                  {isCurrent && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'var(--sh-brand)',
                        color: '#fff',
                      }}
                    >
                      This device
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-muted)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginBottom: 2,
                  }}
                >
                  {formatLocation(session) && <span>{formatLocation(session)}</span>}
                  {session.ipAddress && (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{session.ipAddress}</span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-muted)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <span>Signed in {formatRelative(session.createdAt)}</span>
                  <span>Last active {formatRelative(session.lastActiveAt)}</span>
                </div>
              </div>

              {!isCurrent && (
                <Button
                  danger
                  disabled={revoking === session.id}
                  onClick={() => setConfirmTarget(session)}
                  style={{
                    fontSize: 12,
                    padding: '8px 14px',
                    whiteSpace: 'nowrap',
                    alignSelf: 'center',
                  }}
                >
                  {revoking === session.id ? 'Revoking…' : 'Revoke'}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {otherSessions.length >= 2 && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--sh-muted)' }}>
            {otherSessions.length} other devices signed in.
          </span>
          <Button
            danger
            disabled={revoking === 'all'}
            onClick={() => setConfirmTarget('all')}
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            Sign out all other devices
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmTarget === 'all'}
        title="Sign out all other devices?"
        body={`This will revoke ${otherSessions.length} sessions. Each device will need to sign in again.`}
        confirmLabel="Sign out all"
        danger
        busy={revoking === 'all'}
        onConfirm={doRevokeAll}
        onCancel={() => setConfirmTarget(null)}
      />

      <ConfirmDialog
        open={confirmTarget && confirmTarget !== 'all'}
        title="Sign this device out?"
        body={
          confirmTarget && confirmTarget !== 'all'
            ? `This will revoke ${confirmTarget.deviceLabel || 'the device'}. It will need to sign in again to access your account.`
            : ''
        }
        confirmLabel="Sign out"
        danger
        busy={confirmTarget && revoking === confirmTarget.id}
        onConfirm={() => confirmTarget && confirmTarget !== 'all' && doRevoke(confirmTarget.id)}
        onCancel={() => setConfirmTarget(null)}
      />
    </SectionCard>
  )
}

function formatLocation(session) {
  const parts = []
  if (session.city) parts.push(session.city)
  if (session.region) parts.push(session.region)
  if (session.country) parts.push(session.country)
  return parts.join(', ')
}

function formatRelative(dateStr) {
  if (!dateStr) return 'unknown'
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
```

Note: `session.deviceKind`, `country`, `region`, `city` will be `undefined` until Phase 1b/2 ship. The code degrades gracefully — falls back to `inferKindFromLabel` and hides empty location strings.

- [ ] **Step 2: Lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS.

- [ ] **Step 3: Build**

```bash
npm --prefix frontend/studyhub-app run build
```

Expected: PASS.

### Task 1a.8: Manual verification + commit Phase 1a

- [ ] **Step 1: Start the dev server**

```bash
npm --prefix frontend/studyhub-app run dev
```

- [ ] **Step 2: Open `/settings` in the browser. Verify:**

- Each left-sidebar tab shows an icon to the left of its label.
- Clicking a tab shows a 3px blue left accent bar, and the selection state still highlights the pill.
- Switch to the Subscription tab. The Free-plan tile shows the StudyHub LogoMark, not an "F".
- Switch to the Sessions tab. Sessions show as cards with a 48px device icon. Clicking Revoke opens a confirm modal, not an immediate revoke. Cancel closes it.
- Navigate to `/pricing`. The Free plan card shows a small LogoMark badge at the top.
- Toggle dark mode (Appearance tab). All new tokens still read correctly.

If any of these fail, open the browser console for errors, fix, and re-verify before committing.

- [ ] **Step 3: Stop dev server, commit Phase 1a**

```bash
git add \
  frontend/studyhub-app/src/components/Icons.jsx \
  frontend/studyhub-app/src/pages/settings/SettingsPage.jsx \
  frontend/studyhub-app/src/pages/settings/SubscriptionTab.jsx \
  frontend/studyhub-app/src/pages/settings/SessionsTab.jsx \
  frontend/studyhub-app/src/pages/settings/ConfirmDialog.jsx \
  frontend/studyhub-app/src/pages/pricing/PricingPage.jsx
git commit -m "$(cat <<'EOF'
feat(settings): polish settings/sessions UI; Free plan uses LogoMark

Phase 1a of the settings+sessions+geo-security work:
- Add 10 new SVG icons to Icons.jsx (4 nav, 6 device types)
- Per-tab icons in Settings sidebar + 3px accent bar on active tab
- Replace "F" tile with LogoMark in SubscriptionTab + PricingPage
- Redesign SessionsTab with 48px device icons, card layout, confirm modal
- Sticky bulk "Sign out all other devices" bar when 2+ other sessions

No backend changes. Degrades gracefully when server has not yet populated
deviceKind/country/region/city (lands in Phase 1b/2).

Spec: docs/superpowers/specs/2026-04-17-settings-sessions-geo-security-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Update the beta release log**

Append a section titled "Phase 1a — settings polish" to `docs/beta-v2.0.0-release-log.md` (or create it if missing) with a 2–3 bullet summary.

---

## Phase 1b — Device identity backend

### Task 1b.1: Prisma migration + schema update

**Files:**

- Create: `backend/prisma/migrations/20260418000001_add_trusted_device_and_geo_fields/migration.sql`
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Write the migration SQL**

Create the directory and file with this content:

```sql
-- CreateTable TrustedDevice
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastIp" VARCHAR(45),
    "lastCountry" VARCHAR(2),
    "lastRegion" VARCHAR(10),
    "trustedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedDevice_userId_deviceId_key" ON "TrustedDevice"("userId", "deviceId");
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Session
ALTER TABLE "Session" ADD COLUMN "deviceKind" VARCHAR(16);
ALTER TABLE "Session" ADD COLUMN "country" VARCHAR(2);
ALTER TABLE "Session" ADD COLUMN "region" VARCHAR(10);
ALTER TABLE "Session" ADD COLUMN "city" VARCHAR(128);
ALTER TABLE "Session" ADD COLUMN "riskScore" INTEGER;
ALTER TABLE "Session" ADD COLUMN "trustedDeviceId" TEXT;
ALTER TABLE "Session" ADD CONSTRAINT "Session_trustedDeviceId_fkey" FOREIGN KEY ("trustedDeviceId") REFERENCES "TrustedDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Session_trustedDeviceId_idx" ON "Session"("trustedDeviceId");

-- AlterTable UserPreferences
ALTER TABLE "UserPreferences" ADD COLUMN "alertOnNewCountry" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreferences" ADD COLUMN "alertOnNewCity"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserPreferences" ADD COLUMN "blockAnonymousIp"  BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Update `schema.prisma` — add the `TrustedDevice` model next to `Session` (after line 2160)**

```prisma
model TrustedDevice {
  id            String    @id @default(cuid())
  userId        Int
  deviceId      String
  label         String
  firstSeenAt   DateTime  @default(now())
  lastSeenAt    DateTime  @default(now())
  lastIp        String?   @db.VarChar(45)
  lastCountry   String?   @db.VarChar(2)
  lastRegion    String?   @db.VarChar(10)
  trustedAt     DateTime?
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  sessions Session[]

  @@unique([userId, deviceId])
  @@index([userId])
}
```

- [ ] **Step 3: Update the `Session` model to add the 6 new fields and the `TrustedDevice` relation**

In the `Session` model block (line 2143), add after `createdAt`:

```prisma
  deviceKind       String?        @db.VarChar(16)
  country          String?        @db.VarChar(2)
  region           String?        @db.VarChar(10)
  city             String?        @db.VarChar(128)
  riskScore        Int?
  trustedDeviceId  String?
  trustedDevice    TrustedDevice? @relation(fields: [trustedDeviceId], references: [id])
```

Also add `@@index([trustedDeviceId])`.

- [ ] **Step 4: Update `UserPreferences` model (line 776) — add 3 boolean fields after `fontSize`**

```prisma
  alertOnNewCountry    Boolean @default(true)
  alertOnNewCity       Boolean @default(false)
  blockAnonymousIp     Boolean @default(false)
```

- [ ] **Step 5: Add the back-relation on `User`**

Find the `User` model, add `trustedDevices TrustedDevice[]` to its relations list.

- [ ] **Step 6: Generate the Prisma client**

```bash
npm --prefix backend exec -- prisma generate
```

Expected: generates without error.

- [ ] **Step 7: Verify the migration compiles (dry-run against local dev DB)**

```bash
npm --prefix backend exec -- prisma migrate dev --name add_trusted_device_and_geo_fields --create-only
```

(We use `--create-only` because we already wrote the SQL manually. If Prisma rejects our schema, fix it here.)

Expected: migration is recognized; no drift errors.

### Task 1b.2: deriveDeviceKind() + tests

**Files:**

- Modify: `backend/src/modules/auth/session.service.js`
- Create: `backend/src/modules/auth/session.service.test.js`

- [ ] **Step 1: Write the test FIRST**

Create `session.service.test.js`:

```js
const { describe, it, expect } = require('vitest')
const { deriveDeviceKind, parseDeviceLabel } = require('./session.service')

describe('deriveDeviceKind', () => {
  it('returns "tablet" for iPad user-agent', () => {
    expect(deriveDeviceKind('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) ...')).toBe('tablet')
  })
  it('returns "tablet" for Android without Mobile token', () => {
    expect(deriveDeviceKind('Mozilla/5.0 (Linux; Android 14; Pixel Tablet) ...')).toBe('tablet')
  })
  it('returns "mobile" for iPhone', () => {
    expect(deriveDeviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) ...')).toBe('mobile')
  })
  it('returns "mobile" for Android Mobile', () => {
    expect(deriveDeviceKind('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit Mobile')).toBe(
      'mobile',
    )
  })
  it('returns "watch" for Apple Watch', () => {
    expect(deriveDeviceKind('Mozilla/5.0 (Apple Watch) ...')).toBe('watch')
  })
  it('returns "laptop" for Windows desktop', () => {
    expect(deriveDeviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('laptop')
  })
  it('returns "laptop" for macOS', () => {
    expect(deriveDeviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari')).toBe(
      'laptop',
    )
  })
  it('returns "unknown" for empty UA', () => {
    expect(deriveDeviceKind('')).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run the test — it should fail (function not exported)**

```bash
npm --prefix backend exec -- vitest run src/modules/auth/session.service.test.js
```

Expected: FAIL — `deriveDeviceKind is not a function`.

- [ ] **Step 3: Add the function to `session.service.js`**

After `parseDeviceLabel` (around line 36), add:

```js
function deriveDeviceKind(ua) {
  if (!ua) return 'unknown'
  if (/Apple Watch|Watch OS/i.test(ua)) return 'watch'
  if (/iPad/i.test(ua)) return 'tablet'
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet'
  if (/iPhone|iPod|Windows Phone/i.test(ua)) return 'mobile'
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return 'mobile'
  if (/Macintosh|Mac OS|Windows|Linux|CrOS/i.test(ua)) return 'laptop'
  return 'unknown'
}
```

And add `deriveDeviceKind` to the `module.exports` block at the bottom.

- [ ] **Step 4: Run the test — should pass**

```bash
npm --prefix backend exec -- vitest run src/modules/auth/session.service.test.js
```

Expected: PASS (8 tests).

### Task 1b.3: trustedDevice.service.js

**Files:**

- Create: `backend/src/modules/auth/trustedDevice.service.js`
- Create: `backend/src/modules/auth/trustedDevice.service.test.js`

- [ ] **Step 1: Write the service**

```js
const prisma = require('../../lib/prisma')

async function findOrCreateDevice({ userId, deviceId, label, ip, country, region }) {
  if (!userId || !deviceId) return null

  const existing = await prisma.trustedDevice.findUnique({
    where: { userId_deviceId: { userId, deviceId } },
  })

  if (existing) {
    // Refresh lastSeen info; clear revokedAt if we see this device again
    return prisma.trustedDevice.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        lastIp: ip || existing.lastIp,
        lastCountry: country || existing.lastCountry,
        lastRegion: region || existing.lastRegion,
        label: label || existing.label,
        revokedAt: null,
      },
    })
  }

  return prisma.trustedDevice.create({
    data: {
      userId,
      deviceId,
      label: label || 'Unknown device',
      lastIp: ip,
      lastCountry: country,
      lastRegion: region,
    },
  })
}

async function markTrusted(id) {
  return prisma.trustedDevice.update({
    where: { id },
    data: { trustedAt: new Date() },
  })
}

async function revokeDevice(id) {
  return prisma.trustedDevice.update({
    where: { id },
    data: { revokedAt: new Date() },
  })
}

async function getUserDevices(userId) {
  return prisma.trustedDevice.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: 'desc' },
  })
}

module.exports = { findOrCreateDevice, markTrusted, revokeDevice, getUserDevices }
```

- [ ] **Step 2: Write the unit test**

```js
const { describe, it, expect, beforeEach, vi } = require('vitest')

vi.mock('../../lib/prisma', () => ({
  default: {
    trustedDevice: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

const prisma = require('../../lib/prisma')
const svc = require('./trustedDevice.service')

describe('trustedDevice.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('findOrCreateDevice creates when none exists', async () => {
    prisma.trustedDevice.findUnique.mockResolvedValue(null)
    prisma.trustedDevice.create.mockResolvedValue({ id: 'x1' })
    await svc.findOrCreateDevice({ userId: 1, deviceId: 'd1', label: 'Chrome' })
    expect(prisma.trustedDevice.create).toHaveBeenCalled()
  })

  it('findOrCreateDevice updates when exists', async () => {
    prisma.trustedDevice.findUnique.mockResolvedValue({ id: 'x1', lastIp: null })
    prisma.trustedDevice.update.mockResolvedValue({ id: 'x1' })
    await svc.findOrCreateDevice({ userId: 1, deviceId: 'd1', ip: '1.2.3.4' })
    expect(prisma.trustedDevice.update).toHaveBeenCalled()
  })

  it('revokeDevice sets revokedAt', async () => {
    prisma.trustedDevice.update.mockResolvedValue({ id: 'x1' })
    await svc.revokeDevice('x1')
    expect(prisma.trustedDevice.update).toHaveBeenCalledWith({
      where: { id: 'x1' },
      data: { revokedAt: expect.any(Date) },
    })
  })
})
```

- [ ] **Step 3: Run the tests**

```bash
npm --prefix backend exec -- vitest run src/modules/auth/trustedDevice.service.test.js
```

Expected: PASS (3 tests).

### Task 1b.4: `sh_did` cookie helper

**Files:**

- Create: `backend/src/lib/deviceCookie.js`

- [ ] **Step 1: Write the helper**

```js
const crypto = require('crypto')

const COOKIE_NAME = 'sh_did'
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000

function generateDeviceId() {
  return crypto.randomBytes(16).toString('hex') // 128 bits
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: TEN_YEARS_MS,
  }
}

/**
 * Get the device ID from the request cookie, or set a new one on the response.
 * Returns the device ID string.
 */
function getOrSetDeviceId(req, res) {
  let deviceId = req.cookies?.[COOKIE_NAME]
  if (!deviceId || typeof deviceId !== 'string' || deviceId.length !== 32) {
    deviceId = generateDeviceId()
    res.cookie(COOKIE_NAME, deviceId, cookieOptions())
  }
  return deviceId
}

function rotateDeviceId(res) {
  const deviceId = generateDeviceId()
  res.cookie(COOKIE_NAME, deviceId, cookieOptions())
  return deviceId
}

module.exports = { getOrSetDeviceId, rotateDeviceId, COOKIE_NAME }
```

- [ ] **Step 2: Lint**

```bash
npm --prefix backend run lint
```

Expected: PASS.

### Task 1b.5: Wire createSession to accept deviceId/deviceKind + link TrustedDevice

**Files:**

- Modify: `backend/src/modules/auth/session.service.js`

- [ ] **Step 1: Extend `createSession` signature**

Replace the existing `createSession` with:

```js
async function createSession({
  userId,
  userAgent,
  ipAddress,
  deviceId,
  trustedDeviceId,
  country,
  region,
  city,
  riskScore,
}) {
  const jti = generateJti()
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)
  const deviceLabel = parseDeviceLabel(userAgent)
  const deviceKind = deriveDeviceKind(userAgent)

  const session = await prisma.session.create({
    data: {
      userId,
      jti,
      userAgent: userAgent ? userAgent.slice(0, 512) : null,
      ipAddress: ipAddress ? ipAddress.slice(0, 45) : null,
      deviceLabel: deviceLabel.slice(0, 100),
      deviceKind,
      country: country ? country.slice(0, 2) : null,
      region: region ? region.slice(0, 10) : null,
      city: city ? city.slice(0, 128) : null,
      riskScore: Number.isFinite(riskScore) ? riskScore : null,
      trustedDeviceId: trustedDeviceId || null,
      expiresAt,
    },
  })

  return { jti, sessionId: session.id }
}
```

- [ ] **Step 2: Extend `getActiveSessions` `select` to include the new fields**

```js
select: {
  id: true,
  deviceLabel: true,
  deviceKind: true,
  ipAddress: true,
  country: true,
  region: true,
  city: true,
  lastActiveAt: true,
  createdAt: true,
  jti: true,
},
```

### Task 1b.6: Update GET /sessions response to include new fields

**Files:**

- Modify: `backend/src/modules/auth/auth.session.controller.js`

- [ ] **Step 1: Extend the mapped session response (lines 55–62) to include geo + deviceKind**

```js
const mapped = sessions.map((s) => ({
  id: s.id,
  deviceLabel: s.deviceLabel,
  deviceKind: s.deviceKind,
  ipAddress: s.ipAddress,
  country: s.country,
  region: s.region,
  city: s.city,
  lastActiveAt: s.lastActiveAt,
  createdAt: s.createdAt,
  isCurrent: s.jti === currentJti,
}))
```

### Task 1b.7: Update DELETE /sessions/:id to revoke the TrustedDevice

**Files:**

- Modify: `backend/src/modules/auth/session.service.js` — make `revokeSession` also revoke the linked trusted device.

- [ ] **Step 1: Replace `revokeSession`**

```js
async function revokeSession(sessionId, userId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { trustedDevice: true },
  })
  if (!session || session.userId !== userId) return null
  if (session.revokedAt) return session

  await prisma.$transaction([
    prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    }),
    ...(session.trustedDevice
      ? [
          prisma.trustedDevice.update({
            where: { id: session.trustedDevice.id },
            data: { revokedAt: new Date() },
          }),
        ]
      : []),
  ])

  return prisma.session.findUnique({ where: { id: sessionId } })
}
```

### Task 1b.8: Wire it all into the login controller

**Files:**

- Modify: `backend/src/modules/auth/auth.login.controller.js`

- [ ] **Step 1: After successful password verification, but before `createSession`, resolve the device identity**

Pseudocode to insert (adapt to the actual control flow in that file):

```js
const { getOrSetDeviceId } = require('../../lib/deviceCookie')
const { findOrCreateDevice } = require('./trustedDevice.service')
const { parseDeviceLabel } = require('./session.service')

// ... after credentials verified ...
const deviceId = getOrSetDeviceId(req, res)
const ua = req.get('user-agent') || ''
const trusted = await findOrCreateDevice({
  userId: user.id,
  deviceId,
  label: parseDeviceLabel(ua),
  ip: req.ip,
})

// Pass trustedDeviceId to createSession:
const { jti, sessionId } = await createSession({
  userId: user.id,
  userAgent: ua,
  ipAddress: req.ip,
  trustedDeviceId: trusted?.id,
})
```

Wrap the `findOrCreateDevice` call in try/catch with graceful degradation (per CLAUDE.md rule 10 for block/mute pattern — same philosophy here since TrustedDevice is new and may not yet be migrated on some envs).

- [ ] **Step 2: Run the full backend test suite**

```bash
npm --prefix backend test
```

Expected: PASS. Fix any regressions before moving on.

### Task 1b.9: Commit Phase 1b

- [ ] **Step 1: Git add + commit**

```bash
git add \
  backend/prisma/migrations/20260418000001_add_trusted_device_and_geo_fields/migration.sql \
  backend/prisma/schema.prisma \
  backend/src/modules/auth/session.service.js \
  backend/src/modules/auth/trustedDevice.service.js \
  backend/src/modules/auth/session.service.test.js \
  backend/src/modules/auth/trustedDevice.service.test.js \
  backend/src/lib/deviceCookie.js \
  backend/src/modules/auth/auth.login.controller.js \
  backend/src/modules/auth/auth.session.controller.js

git commit -m "$(cat <<'EOF'
feat(auth): TrustedDevice model + sh_did cookie + deviceKind (Phase 1b)

Backend-only. Frontend already reads deviceKind/country/region/city from
the /sessions endpoint (defaults to null until this phase lands).

- Migration 20260418000001 adds TrustedDevice table, 6 cols on Session,
  3 prefs cols on UserPreferences
- deriveDeviceKind() derives laptop/desktop/mobile/tablet/watch/unknown
- trustedDevice.service: findOrCreate, markTrusted, revoke, list
- sh_did cookie (httpOnly, 10y) identifies devices across sessions
- revokeSession also revokes the linked TrustedDevice

Spec: docs/superpowers/specs/2026-04-17-settings-sessions-geo-security-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Deploy migration to production (after code deploy)**

```bash
# On Railway
npm --prefix backend exec -- prisma migrate deploy
```

---

## Phase 2 — Geo lookup + risk scoring + login activity UI

### Task 2.1: Add `maxmind` dep + geoip service

**Files:**

- Modify: `backend/package.json`
- Create: `backend/src/lib/geoip.service.js`

- [ ] **Step 1: Install maxmind**

```bash
npm --prefix backend install maxmind
```

- [ ] **Step 2: Write `geoip.service.js`**

```js
const path = require('path')
const { open } = require('maxmind')

const DB_DIR = process.env.GEOIP_DB_DIR || path.join(__dirname, '..', '..', 'geoip')
const CITY_DB = path.join(DB_DIR, 'GeoLite2-City.mmdb')
const ANON_DB = path.join(DB_DIR, 'GeoIP2-Anonymous-IP.mmdb')

let cityReader = null
let anonReader = null
let loadPromise = null

async function load() {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    try {
      cityReader = await open(CITY_DB)
    } catch {
      cityReader = null
    }
    try {
      anonReader = await open(ANON_DB)
    } catch {
      anonReader = null
    }
  })()
  return loadPromise
}

async function lookup(ip) {
  if (!ip) return null
  await load()
  if (!cityReader) return null
  try {
    const city = cityReader.get(ip)
    if (!city) return null
    const anon = anonReader ? anonReader.get(ip) : null
    return {
      country: city.country?.iso_code || null,
      region: city.subdivisions?.[0]?.iso_code || null,
      city: city.city?.names?.en || null,
      lat: city.location?.latitude || null,
      lon: city.location?.longitude || null,
      isAnonymous: !!(anon?.is_anonymous || anon?.is_tor_exit_node || anon?.is_hosting_provider),
    }
  } catch {
    return null
  }
}

module.exports = { lookup }
```

### Task 2.2: DB download script

**Files:**

- Create: `backend/scripts/updateGeoipDb.js`
- Modify: `backend/package.json` — add `"update-geoip-db": "node scripts/updateGeoipDb.js"`

- [ ] **Step 1: Write the script**

```js
// Downloads GeoLite2-City and GeoIP2-Anonymous-IP MMDB using MAXMIND_LICENSE_KEY.
// Usage: MAXMIND_LICENSE_KEY=... node scripts/updateGeoipDb.js
const fs = require('fs')
const path = require('path')
const https = require('https')
const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)

const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY
if (!LICENSE_KEY) {
  console.error('MAXMIND_LICENSE_KEY env var is required')
  process.exit(1)
}

const DB_DIR = path.join(__dirname, '..', 'geoip')
fs.mkdirSync(DB_DIR, { recursive: true })

const EDITIONS = ['GeoLite2-City', 'GeoIP2-Anonymous-IP']

function download(url, outFile) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outFile)
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return download(res.headers.location, outFile).then(resolve, reject)
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
      })
      .on('error', reject)
  })
}

async function run() {
  for (const edition of EDITIONS) {
    const url = `https://download.maxmind.com/app/geoip_download?edition_id=${edition}&license_key=${LICENSE_KEY}&suffix=tar.gz`
    const tarFile = path.join(DB_DIR, `${edition}.tar.gz`)
    console.log(`Downloading ${edition}...`)
    await download(url, tarFile)
    console.log(`Extracting ${edition}...`)
    await execAsync(`tar -xzf "${tarFile}" -C "${DB_DIR}"`)
    // Find extracted mmdb file and move it to a stable path
    const dirs = fs
      .readdirSync(DB_DIR)
      .filter((d) => d.startsWith(edition) && fs.statSync(path.join(DB_DIR, d)).isDirectory())
    for (const d of dirs) {
      const mmdb = fs.readdirSync(path.join(DB_DIR, d)).find((f) => f.endsWith('.mmdb'))
      if (mmdb) {
        fs.renameSync(path.join(DB_DIR, d, mmdb), path.join(DB_DIR, `${edition}.mmdb`))
        fs.rmSync(path.join(DB_DIR, d), { recursive: true })
      }
    }
    fs.unlinkSync(tarFile)
  }
  console.log('GeoIP DBs updated at', DB_DIR)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Add `.gitignore` entry**

Append to `backend/.gitignore`:

```
geoip/*.mmdb
geoip/*.tar.gz
```

### Task 2.3: riskScoring.service.js + tests

**Files:**

- Create: `backend/src/modules/auth/riskScoring.service.js`
- Create: `backend/src/modules/auth/riskScoring.service.test.js`

- [ ] **Step 1: Write the test first (covering each signal)**

(Full test file with one `it()` per signal/band. Pattern: construct a `ctx` object and assert `scoreLogin(ctx).score` hits the expected band.)

Signals + weights (from spec §3.5):

- Unknown device: +30
- New country: +40
- New region: +15
- Impossible travel: +50
- Anonymous IP: +25
- UA family change on same device cookie: +10
- 3+ failed attempts against user in 15min: +20

- [ ] **Step 2: Implement the pure function**

```js
const WEIGHTS = {
  UNKNOWN_DEVICE: 30,
  NEW_COUNTRY: 40,
  NEW_REGION: 15,
  IMPOSSIBLE_TRAVEL: 50,
  ANON_IP: 25,
  UA_FAMILY_CHANGE: 10,
  FAILED_ATTEMPTS: 20,
}

const SPEED_KMH_LIMIT = 800
const EARTH_KM = 6371

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1),
    dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a))
}

function scoreLogin({
  deviceKnown,
  geo,
  recentSessions = [],
  uaFamilyChanged,
  anonymousIp,
  failedAttempts15m = 0,
}) {
  const signals = []
  let score = 0

  if (!deviceKnown) {
    score += WEIGHTS.UNKNOWN_DEVICE
    signals.push('unknown_device')
  }

  const pastCountries = recentSessions.map((s) => s.country).filter(Boolean)
  const pastRegions = recentSessions.map((s) => s.region).filter(Boolean)
  if (geo?.country && pastCountries.length > 0 && !pastCountries.includes(geo.country)) {
    score += WEIGHTS.NEW_COUNTRY
    signals.push('new_country')
  }
  if (geo?.region && pastRegions.length > 0 && !pastRegions.includes(geo.region)) {
    score += WEIGHTS.NEW_REGION
    signals.push('new_region')
  }

  // Impossible travel
  const last = recentSessions[0]
  if (
    last &&
    last.lat != null &&
    last.lon != null &&
    geo?.lat != null &&
    geo?.lon != null &&
    last.createdAt
  ) {
    const hours = (Date.now() - new Date(last.createdAt).getTime()) / 3.6e6
    if (hours > 0) {
      const km = haversineKm(last.lat, last.lon, geo.lat, geo.lon)
      if (km / hours > SPEED_KMH_LIMIT) {
        score += WEIGHTS.IMPOSSIBLE_TRAVEL
        signals.push('impossible_travel')
      }
    }
  }

  if (anonymousIp) {
    score += WEIGHTS.ANON_IP
    signals.push('anonymous_ip')
  }
  if (uaFamilyChanged) {
    score += WEIGHTS.UA_FAMILY_CHANGE
    signals.push('ua_change')
  }
  if (failedAttempts15m >= 3) {
    score += WEIGHTS.FAILED_ATTEMPTS
    signals.push('failed_attempts')
  }

  let band = 'normal'
  if (score >= 60) band = 'challenge'
  else if (score >= 30) band = 'notify'

  return { score, band, signals }
}

module.exports = { scoreLogin, WEIGHTS }
```

- [ ] **Step 3: Run tests, iterate until green**

```bash
npm --prefix backend exec -- vitest run src/modules/auth/riskScoring.service.test.js
```

### Task 2.4: Plug scoring into login controller (normal band only)

**Files:**

- Modify: `backend/src/modules/auth/auth.login.controller.js`

- [ ] **Step 1: Call `geoip.lookup(req.ip)` and `scoreLogin()`, attach results to `createSession`**

Guard everything in try/catch with graceful degradation. Pass `riskScore`, `country`, `region`, `city` to `createSession`. Write an enriched `SecurityEvent` (`login.success`) with `{ score, band, signals, country, region, city, deviceId }`.

- [ ] **Step 2: For Phase 2 only, always issue the session regardless of band (Phase 3 enables the 30+ actions).**

### Task 2.5: Login activity endpoint

**Files:**

- Create: `backend/src/modules/auth/login.activity.controller.js`
- Modify: `backend/src/modules/auth/auth.routes.js` (or session.controller) to mount it
- Modify: `backend/src/lib/rateLimiters.js` — add `loginActivityLimiter` (30/5min)

- [ ] **Step 1: Controller returns the last 30 `SecurityEvent` rows where `eventType IN ('login.success','login.challenge','login.blocked')`, projecting `{id, eventType, createdAt, metadata.country, metadata.region, metadata.city, metadata.deviceLabel, ipAddress, metadata.riskScore, metadata.band}`.**

- [ ] **Step 2: Run backend lint + test**

### Task 2.6: Frontend — Login activity section in SecurityTab

**Files:**

- Modify: `frontend/studyhub-app/src/pages/settings/SecurityTab.jsx`

- [ ] **Step 1: Fetch from `/api/auth/security/login-activity?limit=30` via `useFetch`**

- [ ] **Step 2: Render rows in a new `SectionCard` titled "Login activity" with: device label, city/region/country, IP (small), relative timestamp, risk badge (`Normal`/`Reviewed`/`Challenged`/`Blocked` using color tokens), and a "This wasn't me" button (placeholder `onClick` for Phase 3).**

- [ ] **Step 3: Build + lint**

### Task 2.7: Commit Phase 2

```bash
git add \
  backend/package.json \
  backend/package-lock.json \
  backend/.gitignore \
  backend/src/lib/geoip.service.js \
  backend/src/modules/auth/riskScoring.service.js \
  backend/src/modules/auth/riskScoring.service.test.js \
  backend/src/modules/auth/login.activity.controller.js \
  backend/src/modules/auth/auth.login.controller.js \
  backend/src/modules/auth/auth.routes.js \
  backend/src/lib/rateLimiters.js \
  backend/scripts/updateGeoipDb.js \
  frontend/studyhub-app/src/pages/settings/SecurityTab.jsx

git commit -m "feat(auth): geo lookup + risk scoring + login activity UI (Phase 2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — New-location email + step-up challenge + user alert prefs

### Task 3.1: LoginChallenge migration + model

**Files:**

- Create: `backend/prisma/migrations/20260420000001_add_login_challenge/migration.sql`
- Modify: `backend/prisma/schema.prisma`

SQL:

```sql
CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "pendingDeviceId" TEXT NOT NULL,
    "codeHash" VARCHAR(128) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LoginChallenge_userId_idx" ON "LoginChallenge"("userId");
CREATE INDEX "LoginChallenge_expiresAt_idx" ON "LoginChallenge"("expiresAt");
ALTER TABLE "LoginChallenge" ADD CONSTRAINT "LoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Prisma model mirrors the table. Code hash is SHA-256 of the 6-digit code. Expiry 15 minutes.

### Task 3.2: loginChallenge.service.js

**Files:**

- Create: `backend/src/modules/auth/loginChallenge.service.js`

API: `createChallenge({ userId, pendingDeviceId })` returns `{ id, code }`. `verifyChallenge({ id, code })` returns `{ ok, remaining, userId, pendingDeviceId }`.

### Task 3.3: Email templates

**Files:**

- Create: `backend/src/emails/templates/newLoginLocation.js`
- Create: `backend/src/emails/templates/loginChallengeCode.js`

Each exports `{ subject, html, text }` builder functions that accept a payload object. Follow whatever existing email-template pattern the codebase uses (check `backend/src/emails/` to match style).

### Task 3.4: Login controller bands 30–59 and ≥60

**Files:**

- Modify: `backend/src/modules/auth/auth.login.controller.js`

- Band 30–59: issue session as before, but fire-and-forget send `newLoginLocation` email with a signed revoke link.
- Band ≥60: do NOT issue session. Create a `LoginChallenge`, send `loginChallengeCode` email, return `{ status: 'challenge', challengeId: id }` (HTTP 200).

### Task 3.5: POST /login/challenge

**Files:**

- Create: `backend/src/modules/auth/login.challenge.controller.js`
- Modify: `backend/src/modules/auth/auth.routes.js`

Accepts `{ challengeId, code }`. On success: consume the challenge, mark `TrustedDevice.trustedAt = now()`, create the session, set cookies, return the usual login payload.

### Task 3.6: Revoke-link route

**Files:**

- Create: `backend/src/lib/revokeLinkTokens.js` — signed one-use tokens (reuse the JWT signing key with a distinct `aud`).
- Create: `backend/src/modules/auth/revokeLink.controller.js` — `GET /revoke-link/:token`. Revokes the session + trusted device, shows a success page template.

### Task 3.7: User prefs endpoints

**Files:**

- Create: `backend/src/modules/users/prefs.security.controller.js`
- Modify: wherever user-prefs routes are mounted

`GET /api/user/prefs/security` → `{ alertOnNewCountry, alertOnNewCity, blockAnonymousIp }`. `PATCH /api/user/prefs/security` → same shape.

### Task 3.8: Frontend — login challenge page

**Files:**

- Create: `frontend/studyhub-app/src/pages/login/LoginChallengePage.jsx`
- Modify: `frontend/studyhub-app/src/pages/login/LoginPage.jsx` — detect `status: 'challenge'` response, navigate to `/login/challenge/:id`.
- Modify: route table to register `/login/challenge/:id`.

LoginChallengePage has a 6-digit code input, auto-focus, resend button (rate-limited), error state for wrong code, lockout banner.

### Task 3.9: Frontend — Security alerts prefs + "This wasn't me"

**Files:**

- Modify: `frontend/studyhub-app/src/pages/settings/SecurityTab.jsx`

- Add a "Security alerts" `SectionCard` with 3 `ToggleRow` instances bound to the new prefs endpoint.
- Wire the existing "This wasn't me" button (Phase 2 placeholder) to `DELETE /api/auth/sessions/:id` + `POST /api/auth/security/request-password-reset`.

### Task 3.10: Tests + commit Phase 3

Integration tests: login challenge happy path, wrong code, lockout after 3 fails, expired challenge.

---

## Phase 4 — Re-auth on sensitive actions + panic mode + inactive sweeper

### Task 4.1: requireTrustedDevice middleware

**Files:**

- Create: `backend/src/middleware/requireTrustedDevice.js`

```js
const prisma = require('../lib/prisma')

module.exports = async function requireTrustedDevice(req, res, next) {
  if (!req.user || !req.sessionJti) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const session = await prisma.session.findUnique({
      where: { jti: req.sessionJti },
      include: { trustedDevice: true },
    })
    if (!session?.trustedDevice?.trustedAt) {
      return res.status(403).json({ error: 'reauth-required', code: 'REAUTH_REQUIRED' })
    }
    return next()
  } catch {
    return res.status(500).json({ error: 'Could not verify device trust.' })
  }
}
```

### Task 4.2: Apply to sensitive endpoints

**Files:**

- Modify: settings / account controllers for change-email, change-password, delete-account.

Insert the middleware between `requireAuth` and the handler.

### Task 4.3: Panic mode

**Files:**

- Create: `backend/src/modules/auth/panic.controller.js` — `POST /api/auth/security/panic`.

Steps: revoke all sessions for the user, rotate the `sh_did` cookie, fire a password-reset email. Rate limit 3/hour per user.

Frontend: button in Security tab with a confirm modal explaining the consequences.

### Task 4.4: Inactive-session sweeper

**Files:**

- Create: `backend/scripts/cron/inactiveSessionSweep.cron.js`

Runs daily. `prisma.session.updateMany({ where: { lastActiveAt: { lt: thirtyDaysAgo }, revokedAt: null }, data: { revokedAt: new Date() } })`.

### Task 4.5: Frontend re-auth modal

**Files:**

- Modify: `frontend/studyhub-app/src/pages/settings/AccountTab.jsx` (or wherever sensitive actions are)

When a PATCH returns 403 `{ code: 'REAUTH_REQUIRED' }`, open a modal that triggers `POST /api/auth/security/send-reauth-code`, collects the 6-digit code, POSTs to `/api/auth/security/reauth`, then retries the original action.

### Task 4.6: Tests + commit Phase 4

---

## Self-Review (run when plan is complete)

Before handoff, confirm:

1. **Spec coverage:**
   - §3.1 settings polish → Phase 1a tasks 1a.1, 1a.3 ✓
   - §3.2 Free-plan LogoMark → Tasks 1a.4, 1a.5 ✓
   - §3.3 Sessions visual refresh + device icons + confirm + sticky bulk bar → Tasks 1a.2, 1a.6, 1a.7 ✓
   - §3.4 TrustedDevice + cookie → Phase 1b ✓
   - §3.5 geo scoring + bands + email + challenge → Phase 2 + Phase 3 ✓
   - §3.6 Login Activity UI → Task 2.6 + Phase 3 wiring for "This wasn't me" ✓
   - §3.7 Phase 4 cheap wins → Phase 4 ✓

2. **Placeholder scan:** no TBD/TODO. Phase 1a tasks have complete code blocks. Phases 1b-4 have file paths + key signatures; any agent executing them needs to read the spec + reference existing code (noted in tasks).

3. **Type consistency:** `deviceKind` values are exactly `"desktop" | "laptop" | "mobile" | "tablet" | "watch" | "unknown"` everywhere (spec §3.3, test in Task 1b.2, frontend `inferKindFromLabel` in Task 1a.7). `sh_did` cookie name consistent with spec. `TrustedDevice` field names match spec §3.4.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-17-settings-sessions-geo-security.md`.**

Per the user's instruction "start" and the approved plan, execution proceeds with Phase 1a (pure frontend, no migration). Phase 1a has full step-by-step detail. Phases 1b, 2, 3, 4 have task-level structure that will need an incremental writing-plans pass if an autonomous agent runs them, or can be executed directly by a developer familiar with the codebase.

Execution mode: **Inline execution with per-task verification**, starting with Phase 1a. No commits are made until each task's verification step passes.
