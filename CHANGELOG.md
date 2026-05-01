# Changelog

All notable user-visible changes to StudyHub are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For internal cycle-by-cycle release notes, see `docs/release-log.md` (tracked) and `docs/internal/beta-v2.0.0-release-log.md` (gitignored, internal).

## [Unreleased]

### Security

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
