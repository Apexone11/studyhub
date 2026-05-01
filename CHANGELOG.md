# Changelog

All notable user-visible changes to StudyHub are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For internal cycle-by-cycle release notes, see `docs/release-log.md` (tracked) and `docs/internal/beta-v2.0.0-release-log.md` (gitignored, internal).

## [Unreleased]

### Added (2026-05-01 rev 2)

- **Settings → Security → Recovery codes UI.** `RecoveryCodesSection.jsx` mounted in the existing SecurityTab. Generates 10 single-use codes via `POST /api/settings/2fa/recovery-codes/regenerate`, displays them in a forced-acknowledgement modal (Escape + backdrop disabled until the user confirms they've saved them), Copy + Download `.txt` actions. Section silently doesn't render if `flag_2fa_recovery_codes` is off (status endpoint 404).
- **`/settings/security/setup-2fa` page** — landing page for the admin-MFA-enforcement gate. Reached when login returns 403 `MFA_SETUP_REQUIRED`. Shows current 2FA status + step-by-step instructions for turning on email 2FA. Pointers to the recovery-codes section once 2FA is on.
- **Dev-only Playwright focus-trap harness** at `/__a11y/dialog`. Replaces the flaky `/login` localStorage approach. Tree-shaken from production bundles via `import.meta.env.DEV` gate. Spec now exercises ARIA attributes, initial focus, Tab + Shift+Tab cycling, and Escape-to-close deterministically.

### Fixed (2026-05-01 rev 2)

- **`FocusTrappedDialog` nested-modal aria-hidden leak.** The body-inert effect identified the active dialog via `document.body.querySelector('[data-focustrap-active="true"]')`, which returned the first open dialog when multiple were mounted. A second concurrent dialog ended up listed as a sibling and got `aria-hidden="true"` + `inert` applied to itself. Fixed by tracking the current overlay via a per-instance ref and skipping any sibling that is itself a focus-trapped dialog.
- **Frontend `package-lock.json` synced** for `focus-trap-react` + `@axe-core/playwright`. CI's `cache-dependency-path` points at `frontend/studyhub-app/package-lock.json`, so `npm ci` was about to break with the unsynced lockfile.

### Security

- **2FA recovery codes (NIST 800-63B AAL2 alt-factor pattern).** New `lib/auth/recoveryCodes.js` generates 10 single-use 64-bit codes (`xxxxx-xxxxx` hex) per user, stores bcrypt hashes (cost 12) in `User.twoFaRecoveryHashes`, and exposes them once at generation time. Endpoints: `POST /api/settings/2fa/recovery-codes/regenerate` (replaces all hashes, returns plaintext once), `GET /api/settings/2fa/recovery-codes/status`, `POST /api/auth/login/recovery-code` (alt to email OTP). All gated on `flag_2fa_recovery_codes` (fail-CLOSED, ships disabled). Constant-time-ish bcrypt loop avoids timing-leak about which hash matched.
- **Admin MFA enforcement (L2.14).** `User.mfaRequired` column + login flow gate. When `flag_admin_mfa_required` is on AND a user has `role=admin && mfaRequired=true`: (a) without 2FA configured → 403 `MFA_SETUP_REQUIRED` redirecting to `/settings/security/setup-2fa`; (b) with 2FA configured → forced challenge band on every login (overrides risk-based skip). Fail-CLOSED: any flag-read error treats enforcement as off so the founder can never lock themselves out by misconfiguring the flag. Both flag rows seed with `enabled: false` — operator flips on after testing.
- **Idempotent migrations.** `LegalRequest` + `AiMessage flag` migrations now use `IF NOT EXISTS` guards (matches the achievements-v2 redeploy-safe pattern). Replays cleanly under partial-apply or re-run.
- **DSAR audit log redacted.** The `legal.data_request.submitted` log line no longer carries `requesterName`, `requesterEmail`, or `requesterIp` — replaced with an 8-char SHA-256 prefix of the email for cross-line correlation. Raw PII stays in the `LegalRequest` row, gated by Postgres permissions.
- **`Cache-Control: no-store` + `X-Robots-Tag` middleware moved BEFORE webhook + payments + video-chunk route mounts.** The earlier 2026-04-30 placement after those mounts could allow webhook handlers that terminate the response to skip the no-store guarantee.

- **`lib/useFocusTrap.js` consolidated** — refactored to use the same `focus-trap` engine that powers `FocusTrappedDialog`. Eliminates the divergent in-house Tab-cycling logic. Same public API; same body-scroll-lock counter; battle-tested trap underneath.
- **`lib/loadEnv.js` adopted from `index.js`.** The bootstrap now requires the centralized loader before any other imports. Side-effect-only API (no exports) — matches the documented contract.
- DSAR (`POST /api/legal/data-request`) now requires a trusted origin and is rate-limited to 3 requests per IP per hour. Honeypot field added to deter automated spam.
- `/api/legal/me/accept-current` rate-limited to 10 requests per user per hour.
- `/api/public/health` no longer leaks process uptime or memory usage to anonymous callers.
- `express.json()` is content-type strict — only `application/json` payloads are parsed.
- ClamAV scan failures fail CLOSED in production (video uploads blocked when scanner unreachable). Dev still passes through.
- HSTS now sent with `max-age=31536000; includeSubDomains; preload` in production.
- CSP `report-uri` directive added when `CSP_REPORT_URI` env var is set.
- Termly third-party embed removed from all legal pages and the legal-acceptance modal — every legal document renders entirely from self-hosted content.
- Email validation in DSAR now uses the same `isValidEmailAddress` helper as the rest of the auth surface (replaced a permissive regex).

### Added

- `security.txt` at `/.well-known/security.txt` (RFC 9116) for vuln researcher contact.
- Dependabot weekly update PRs for backend, frontend, and GitHub Actions.
- `HtmlDownloadWarningModal` component with tier-aware copy, wired into `AttachmentPreviewPage` for HTML attachment downloads.
- `components/Modal/FocusTrappedDialog.jsx` accessible-dialog primitive (W3C ARIA Authoring Practices §3.9 modal pattern). Wraps `focus-trap-react` with portal mounting, ARIA attributes, body inerting, and reduced-motion support. 9 modals migrated to it: `HtmlDownloadWarningModal`, `RoleTile` Modal, `LegalAcceptanceModal`, `CreatorAuditConsentModal`, `KeyboardShortcuts`, `ConfirmLossyConversionModal`, `AvatarCropModal`, `CoverCropModal`, `VideoThumbnailEditor`, `AchievementUnlockModal`. Tab/Shift+Tab cycling, Escape close, and trigger-focus restore now work uniformly.
- `tests/modal-focus-trap.smoke.spec.js` — Playwright keyboard-navigation smoke test verifying Tab focus stays inside the dialog.

### Dependency changes

- Added `focus-trap-react@^11.0.6` (runtime). Founder-approved 2026-05-01 via the v2.1 dependency exception path. Brings transitive deps `tabbable@^6` and `focus-trap@^7`. Bundle cost: ~3 KB gzipped. No existing dep solved the need (the in-house `useFocusTrap` hook is good but ships separately and isn't W3C-pattern-complete). Rollback plan: replace `<FocusTrappedDialog>` usages back with hand-rolled `createPortal` modals + remove `focus-trap-react` from dependencies.

### Changed

- HTML scanner threshold for `String.fromCharCode` raised from 3 to 8 occurrences. Practice-test sheets that build A/B/C/D option labels via `String.fromCharCode(65+i)` no longer auto-classify Tier 2.
- Settings → "Your role" tile collapses to a single row when no revert is pending.
- `/teach` and `/signup` now redirect to `/teach/materials` and `/register` respectively (were 404).
- Role-picker (`/signup/role`) now requires explicit acceptance of legal documents via a checkbox before "Continue" enables. Closes a 4-day version-drift between frontend and backend `CURRENT_LEGAL_VERSION`.

### Deprecated

- Phase 5/6/7/8 design_v2 flag names (`design_v2_auth_split`, `design_v2_onboarding`, `design_v2_feed_polish`, `design_v2_home_hero`) removed from `designV2Flags.js` enum until their UI surfaces are built. The flag-name pattern is preserved for reintroduction.

### Removed

- Termly embed dependency in `LegalAcceptanceModal.jsx` and `LegalDocumentPage.jsx`. The `useTermlyEmbed` hook was deleted from `frontend/studyhub-app/src/lib/` in the same release. `TERMLY_UUIDS` / `TERMLY_POLICY_BASE` / `TERMLY_DSAR_URL` constants also removed from `legalVersions.js`.

### Fixed

- Frontend `CURRENT_LEGAL_VERSION` was `2026-04-04`; backend was `2026-04-08`. Bumped frontend to match. Caused Google-OAuth signup to fail with "Please review and accept the latest StudyHub legal documents."

---

## [2.2.0] — 2026-04-29

See `docs/release-log.md` for the consolidated cycle log. This v2.2.0 entry will be back-filled into the changelog format on the next release cut.
