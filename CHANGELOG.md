# Changelog

All notable user-visible changes to StudyHub are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For internal cycle-by-cycle release notes, see `docs/release-log.md` (tracked) and `docs/internal/beta-v2.0.0-release-log.md` (gitignored, internal).

## [Unreleased]

### Added (2026-06-16 — product-updates newsletter, #291)

- **"What's New" newsletter.** Admins compose product updates that publish to a public `/updates` archive and email opted-in users; every email carries a one-click unsubscribe (RFC 8058) and there's a Settings toggle. Opt-out default. New `/api/newsletter` module + `Newsletter`/`NewsletterSend` tables + `UserPreferences.emailProductUpdates`.

### Security (2026-06-16 — dependency audit)

- Resolved all 12 open Dependabot alerts: vite 8.0.16 (server.fs.deny bypass + launch-editor), ws 8.21.0, brace-expansion 5.0.6, uuid 11.1.1, plus the backend + frontend minor-patch groups. Root + workspace lockfiles re-synced; `npm audit` is clean.
- Cleared the remaining Dependabot alerts that surfaced during the cycle: nodemailer 9.0.1 (High raw-option SSRF + List-\* CRLF injection), multer 2.2.0 (DoS), dompurify 3.4.11 (sanitizer hardening), plus transitive form-data 4.0.6 / markdown-it 14.2.0 / @opentelemetry/core 2.8.0 / protobufjs 8.x. All 41 alerts resolved; `npm audit` clean.

### Security (2026-05-31 — 2nd audit pass, wave-12.24)

- **Study-group discussion replies now require active membership to edit/delete.** A banned or removed member previously kept the ability to edit or delete their own old replies in a private group (the active-membership gate covered the post handlers but had missed the reply handlers). Now both `updateReply` and `deleteReply` require active membership.
- Explore hardening: an unrecognized `?topic=` returns an empty result instead of all cross-school content; the feature kill switch drops stale cached content when flipped off; cross-school search expansion no longer runs on the private "my sheets" path; the topic fuzzy-match query now uses the trigram index.

### Added (2026-05-31 — cross-school discovery, wave-12.23)

- **Self-learner Explore (`/explore`).** A cross-school discovery page — topic chips, a "Trending this week" shelf, and Sheets / Notes / Study-groups shelves drawn from every school. Read-only, block-filtered, behind `flag_explore_tab` (fail-closed). Backend: `GET /api/explore/{sheets,trending,notes,study-groups,topics}`.
- **Course aliasing — "Equivalent at other schools."** A curated, CIP-coded topic taxonomy (`CourseAlias` + `TopicCanonical`) maps equivalent courses across schools, so searching "intro programming" surfaces every school's version (Postgres `pg_trgm` fuzzy match), and the Sheets page shows equivalents when you filter to one course. Behind `flag_course_aliasing`. Backend: `GET /api/courses/topics`, `GET /api/courses/:id/equivalents`.

### Security (2026-05-31 — 10-loop adversarial audit fixes, wave-12.22)

- **Private study-group content is now gated on _active_ membership.** Pending (un-approved) and banned members could previously read and post in private-group discussions/resources/sessions; a new `requireActiveGroupMember` guard closes it, and replies/upvotes to hidden (removed / pending-approval) posts are blocked.
- **Cross-conversation message-content leak closed.** `replyToId` on a new message is now verified to belong to the same conversation, so a participant can no longer pull a stranger's private message content into their own thread.
- **"Downloads disabled" is enforced on the attachment-preview path (A6).** The preview route streamed the full original file regardless of `allowDownloads`; it now applies the same owner-or-allowed gate as the download routes.
- **WebAuthn fails closed in production (A9).** `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` no longer fall back to localhost in prod (which silently broke admin passkey auth); both are now `REQUIRED_IN_PRODUCTION`.
- **CSRF `originAllowlist()` (A11)** added to the courses, study-status, plagiarism, and hashtags write modules. Socket cookie parser hardened against prototype-pollution keys; socket `conversationId` integer-validated.

### Fixed (2026-05-31 — 10-loop audit)

- **GDPR account deletion no longer aborts** when an optional table is absent — those cleanups moved out of the all-or-nothing transaction.
- **Note edits made right before closing the tab are saved** — the `sendBeacon` autosave (POST-only) now reaches the update handler instead of 404-ing.
- **Two migrations made idempotent** (teacher-materials, AiSuggestion) so a partial `migrate deploy` can be safely retried (A5).
- **Optimistic-UI now reconciles with the server** on study-status, note/sheet/feed reactions, video downloadable toggle, and follow/join — a rejected write rolls back and toasts instead of silently sticking (A4).
- **A12 integer guards** on sheet-comment react/delete/edit, materials body ids, pinned-sheet delete, study-status PUT.
- **A11y:** focus traps on the section-picker, topic-picker, and report-group modals; keyboard-accessible announcement image thumbnails; labelled topic-picker inputs.
- **Perf:** discussion lists count via `_count` instead of loading every reply/upvote row; the all-time leaderboard hydrates only the top-N and bounds its aggregate to a rolling year.

### Security (2026-05-31 — bounded-plan completion batch, wave-12.21)

- **Strict route-id parsing closes the partial-numeric hole.** New `parseRouteId()` (`core/http/validate.js`) rejects ids that `Number.parseInt` would accept partially (`"12abc" → 12`). Applied to `PATCH /api/materials/:id/archive` and `DELETE /api/materials/assignments/:id` (Codex PR-review P2). Digit-only, capped at `MAX_SAFE_INTEGER`.
- **List-endpoint DoS cap.** New `parseBoundedInt(value, fallback, max)` silently clamps `?limit=` on 4 endpoints (sheets list 100; sheet-comments, feed list, feed reactions 50) — a `?limit=999999` no longer fetches unbounded rows. `parsePositiveInt` deprecated.
- **Password-reset rejects same-as-current** (NIST 800-63B §5.1.1.2, OWASP ASVS V2.1.1). `POST /api/auth/reset-password` 400s with `PASSWORD_UNCHANGED` when the new password equals the current bcrypt hash; all its raw error envelopes migrated to `sendError()`.
- **PII value-scrubbing in `redactObject`** (A8 defense-in-depth). Email / phone / IPv4 / SSN patterns are masked inside free-text log string values, not just known sensitive keys.
- **Stripe idempotency keys** on all 11 state-changing SDK calls (checkout, customer, portal, subscription pause/resume/cancel/reactivate) — a retried call returns the cached response instead of double-charging. Checkout logs Stripe's `request_id`.
- **`x-request-id` propagation** to the route-level Anthropic calls (sheet generate/edit, note summarize) for log↔dashboard correlation.

### Fixed (2026-05-31)

- **`security.headers` HSTS test** failed in any env whose `.env` lacked `R2_BUCKET_UPLOAD_BACKUP` (promoted to `REQUIRED_IN_PRODUCTION` in wave-12.11 but never added to the test's dummy-secret setup). Added the dummy.
- **Stale debounce / in-flight fetch after unmount.** `AbortController` + unmount timer-cleanup on 5 effect-driven sites (library data + reader, sheet-lab reads, note-persistence timers, admin user-search) — no more `setState` after navigation.
- **Duplicate unread-count polling.** Navbar bell + mobile bottom-nav badge now share one `UnreadProvider` poll instead of two independent 30s pollers.
- **A11y:** focus-trap + Escape + `role="dialog"`/`aria-modal` on 4 more modals (FollowModal, NoteVersionHistory, ModerationAppealModal, AnnouncementMedia lightbox); WAI-ARIA menu keyboard nav on `NavbarUserMenu`; `<main id="main-content">` landmarks on UserProfile + Library so the skip link lands.

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
