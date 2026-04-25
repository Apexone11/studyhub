// DELETED — see CLAUDE.md "Pages and Routing Reality" section and
// docs/internal/beta-v2.0.0-release-log.md CORRECTION block (2026-04-19).
//
// This Playwright test hit /dashboard, which is now a redirect to /users/:username.
// When Phase 1 is retargeted onto FeedPage + UserProfilePage, a replacement test
// (role.phase1.spec.js or similar) should be written against those real routes.
//
// Safe to delete: no other test file imports from here.
