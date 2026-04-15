# StudyHub Mobile — Build Plan

Status: Draft, April 2026
Scope: End-to-end build plan for the StudyHub Android mobile app
Owner: Abdul Fornah

Companion documents:

- `docs/mobile-app-plan.md` — product spec
- `docs/mobile-security.md` — security posture and compliance checklist

---

## 1. Build Philosophy

### 1.1 One codebase, mobile-aware

The existing React 19 + Vite app at `frontend/studyhub-app/` becomes the mobile app via Capacitor. We add a mobile-aware routing layer that detects `Capacitor.isNativePlatform()` at boot and swaps in a mobile-specific shell + mobile-specific pages under `src/mobile/`. Shared logic (hooks, API calls, Socket.io, AI service) is reused across surfaces.

### 1.2 Waves, not sprints

We ship in five waves. Each wave has a clear exit criterion. Waves can overlap at the edges but cannot skip. If a wave's exit criterion fails, we do not move forward until it passes.

### 1.3 Always-green main branch

- Every PR runs the full lint and test suite against both backend and frontend.
- Main is always deployable to web production. Mobile Capacitor builds run in their own workflow and do not block web deployment.
- Mobile-specific feature flags are used to gate unfinished work behind a toggle so intermediate builds can still ship to the internal testing track.

### 1.4 Code review and quality gates

- Every PR reviewed by at least one other engineer (or self-reviewed with a detailed PR description if solo).
- All mobile PRs include a note on whether they introduce new `Capacitor` plugins, new secrets, or new network calls. These trigger a brief security review.
- PRs touching `docs/mobile-security.md` checklist items automatically tag the security reviewer.

---

## 2. Pre-Wave Setup (Week 0)

These are prerequisites before Wave 1 begins.

### 2.1 Local environment

- [ ] Install Node 20 LTS (already done for web).
- [ ] Install Java 17 JDK (required for Android Gradle).
- [ ] Install Android Studio (even if we won't use it day one — we need Android SDK, platform tools, and build tools).
- [ ] Install Android SDK platforms for API 30 (minSdk) through API 34 (targetSdk).
- [ ] Install Android SDK Build-Tools 34.0.0.
- [ ] Configure Android environment variables: `ANDROID_HOME`, `PATH` entries for `platform-tools` and `emulator`.
- [ ] Install Chrome (for device-mode testing — Tier 1).

### 2.2 Repo preparation

- [ ] Add a `mobile-plan/` branch strategy: features merged to `main`, mobile builds cut from `main` tags.
- [ ] Add `@capacitor/cli`, `@capacitor/core`, `@capacitor/android` to `frontend/studyhub-app/package.json`.
- [ ] Run `npx cap init StudyHub app.studyhub.mobile --web-dir=dist`.
- [ ] Run `npx cap add android`.
- [ ] Commit the generated `android/` directory.
- [ ] Add `android/` build artifacts to `.gitignore` (`android/app/build/`, `android/.gradle/`, etc.).

### 2.3 CI pipeline additions

- [ ] New GitHub Actions workflow: `mobile-android.yml` that runs on pushes to `main` and on tags matching `mobile-v*`.
- [ ] Workflow steps: install Node, install Android SDK, run `npm ci`, run lint, run build, run `npx cap sync android`, build the Android release APK/AAB, upload to Play Console's internal testing track.
- [ ] Secrets added to GitHub: `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`.

### 2.4 Play Store account

- [ ] Register a Google Play Developer account ($25 one-time fee).
- [ ] Create the StudyHub app entry (package name `app.studyhub.mobile`).
- [ ] Configure internal testing track with a test user list.
- [ ] Set up Play App Signing (Google holds upload key).

---

## 3. Wave 1 — Foundation (Weeks 1–2)

**Goal:** The scaffolding works. A user can sign up on mobile, session shares with the web, and they land in an empty Home tab.

### 3.1 Wave 1 tasks

- [ ] Install Capacitor and configure `capacitor.config.ts` (app ID, app name, server URL for dev, bundled web directory for prod).
- [ ] Set up mobile platform detection: `src/lib/mobile/detectMobile.js` exports `isCapacitorNative` and `isMobileViewport`.
- [ ] Add a top-level router switch in `App.jsx`: if `isCapacitorNative`, render `App.mobile.jsx`; else render the existing web app.
- [ ] Build `App.mobile.jsx` skeleton with React Router 7 mobile routes: `/`, `/home`, `/messages`, `/ai`, `/profile`.
- [ ] Build the `BottomTabBar` component with four tabs using `IconFeed`, `IconMessages`, `IconSpark`, `IconProfile`.
- [ ] Build `MobileTopBar` as a reusable component (back button, title, right-side action slot).
- [ ] Build the `MobileLandingPage` with the animated hero, value prop, and two buttons.
- [ ] Build the gradient-mesh background component (reusable, token-based colors, respects `prefers-reduced-motion`).
- [ ] Build `SignupBottomSheet` with step 1 (email + password) and step 2 (username + account type picker).
- [ ] Build `SigninBottomSheet` (email + password, forgot password, Continue with Google).
- [ ] Wire up the signup and sign-in flows to the existing `/api/auth/register` and `/api/auth/login` endpoints.
- [ ] Verify the session cookie is set correctly in Capacitor's WebView and shared with the web domain.
- [ ] Build the three onboarding screens with skip actions and data persistence to `onboardingGoals` on the user record.
- [ ] Build the welcome splash (300ms with confetti-light animation).
- [ ] Dark/light mode detection from system preference; manual toggle on landing page; persistence to user record.
- [ ] Add Plus Jakarta Sans font files to mobile assets and configure local loading (no CDN fetch).
- [ ] Placeholder Home tab with just the top bar, bottom tab bar, and a "Welcome" card.
- [ ] Placeholder Messages, AI, Profile tabs showing "Coming soon" state.

### 3.2 Wave 1 exit criteria

- [ ] A brand-new user can sign up on mobile, complete onboarding, and land on the empty Home tab.
- [ ] The user can sign in on the web immediately and see themselves logged in with the same profile.
- [ ] Dark and light modes work and persist.
- [ ] Landing page animations run at 60fps on a Pixel 6.
- [ ] Lint passes (`npm --prefix frontend/studyhub-app run lint`).
- [ ] Build passes (`npm --prefix frontend/studyhub-app run build`).
- [ ] Android debug APK builds successfully (`npx cap run android`).

### 3.3 Wave 1 risks

- **Capacitor cookie handling with cross-domain scenarios.** If the WebView domain differs from the API domain in dev vs prod, cookies can fail. Mitigation: serve dev builds from the same origin as the API during testing, verify prod config matches.
- **React Router 7 + Capacitor compatibility.** Capacitor apps should work with React Router as a pure client-side router. If deep links break, we switch to `HashRouter` for the mobile build.
- **Font loading performance.** Bundled fonts add APK size. Mitigation: ship only the weights we use (regular, medium, bold).

---

## 4. Wave 2 — Read-Only Tabs (Weeks 3–5)

**Goal:** All four tabs render real data. Users can scroll the app end-to-end and see everything, even if they can't act on it yet.

### 4.1 Wave 2 backend tasks

- [ ] Design and ship `GET /api/feed/mobile` endpoint. Accepts `cursor`, `band` (`triage` or `discovery`), `limit`. Returns normalized items with type, id, author, payload.
- [ ] Migration for `SecurityEvent` table (needed for suspicious-activity alerts — even in read-only, we log login events).
- [ ] Migration for `Session` table (tracks per-device sessions).
- [ ] Modify `POST /api/auth/login` to create a `Session` row and return a session ID along with the JWT cookie.
- [ ] Add `GET /api/auth/sessions` endpoint listing all active sessions for the current user.
- [ ] Add `DELETE /api/auth/sessions/:id` endpoint.

### 4.2 Wave 2 mobile tasks

- [ ] Home feed: build `TriageBand` and `DiscoveryFeed` components. Wire to `/api/feed/mobile`.
- [ ] Build all eight card components: `SheetCard`, `NoteCard`, `FeedPostCard`, `GroupActivityCard`, `AnnouncementCard`, `MilestoneCard`, `PollCard`, `QaCard`.
- [ ] Implement infinite scroll with virtualization (`react-window` or equivalent).
- [ ] Pull-to-refresh implementation (`use-pull-to-refresh` or custom).
- [ ] "New posts" pill at the top of the feed triggered by Socket.io feed update events.
- [ ] Top bar hide-on-scroll-down, reappear-on-scroll-up.
- [ ] Notifications panel (slides from top): reads existing `/api/notifications` endpoint.
- [ ] Search icon action: routes to `MobileSearchPage` (read-only search using existing `/api/search` endpoint).
- [ ] Messages tab: conversation list from existing `/api/messages/conversations`.
- [ ] Thread view (read-only): message bubbles, day dividers, reactions shown, read receipts shown. No send yet.
- [ ] Swipe actions on conversation rows (mute, archive, leave — calls existing endpoints).
- [ ] AI tab: conversation list panel reading from existing `AiConversation` table. Thread view rendering past messages. Composer disabled with "Coming in Wave 3" placeholder.
- [ ] Profile tab: identity section, activity tabs (`Sheets` / `Notes` / `Posts` / `Stars`), study groups section, courses / topics section, progress tiles, settings row.
- [ ] Mobile sheet viewer: read-only HTML rendering from existing `StudySheet` model. Tier 0/1 sheets render inline; Tier 2/3 show "Pending review" state.
- [ ] Mobile note viewer: markdown-rendered notes from existing `Note` model.
- [ ] Mobile study group viewer: members list, resources list, sessions list, discussion board (read).
- [ ] Settings screen scaffold with section headers but stub content (Account, Appearance, Notifications, Privacy, etc.) — functional implementation in Wave 3.
- [ ] Apply icon mapping from product plan §4.6. Verify every icon uses an `Icon*` export (no emojis).

### 4.3 Wave 2 exit criteria

- [ ] A signed-in user can open the app and see their actual feed, messages, AI history, and profile.
- [ ] All eight feed card types render correctly with real data.
- [ ] Infinite scroll works smoothly (no jank, no duplicate fetches).
- [ ] Pull-to-refresh updates triage band within 800ms.
- [ ] No hardcoded colors in any new component (lint rule catches violations).
- [ ] No emojis in any new component.
- [ ] Lint + build + test passes.

### 4.4 Wave 2 risks

- **Virtualized list performance on low-end Android.** If we see jank on Pixel 6, fall back to a simpler pagination model (load N cards, "Load more" button) for the discovery band.
- **Feed API response shape drift.** Web and mobile both hit `/api/feed/mobile`; to avoid divergence, share the normalization layer in `backend/src/lib/feedNormalizer.js`.

---

## 5. Wave 3 — Writes and Interactions (Weeks 6–8)

**Goal:** Users can post, message, chat with AI, react, follow, block, and publish AI-generated sheets. Mobile reaches feature parity with web for the tabs we're shipping.

### 5.1 Wave 3 backend tasks

- [ ] Migration for `DeviceToken` table.
- [ ] Migration for `Draft` table.
- [ ] Migration for `Poll` and `PollVote` tables.
- [ ] Add `acceptedAnswerId` column to `FeedPost` for Q&A posts. Migration file.
- [ ] `POST /api/device-tokens` and `DELETE /api/device-tokens/:id` endpoints.
- [ ] `GET`, `POST`, `DELETE` `/api/drafts/:type/:key` endpoints with rate limits.
- [ ] `GET /api/polls/:id`, `POST /api/polls/:id/vote` endpoints.
- [ ] `POST /api/qa/:postId/accept` endpoint for asker accepting an answer.
- [ ] Server-side voice message handling: accept `audio/webm` uploads in messaging, strip metadata, run mandatory transcription, run transcript through text moderation, store as `Message.voiceUrl` + `Message.voiceTranscript`.
- [ ] Update `ai.constants.js` system prompt with mobile context headers and academic-integrity clauses.
- [ ] FCM integration: server-side push sending via Firebase Admin SDK. New `pushNotifier.js` lib in `backend/src/lib/`.
- [ ] Push rules engine: determines who receives a push for a given event based on §16 of product plan.
- [ ] Collapse keys applied per message thread.
- [ ] Cross-device de-dupe: check if user has active web session (heartbeat within 30s) before sending mobile push.

### 5.2 Wave 3 mobile tasks

- [ ] Composer for feed posts with text, image, course tag, group target.
- [ ] Floating action button with the five-option bottom sheet.
- [ ] Full messaging send path: text messages via Socket.io, reactions, edit (15-min window), delete.
- [ ] Voice message recording: tap-and-hold, waveform rendering from Web Audio API `AnalyserNode`, slide-to-cancel, release-to-send.
- [ ] Voice message playback: waveform bar, play head, `IconPlay`/`IconPause`, speed toggle.
- [ ] Contact picker for new messages (includes everyone user has messaged, follows, shares a course with).
- [ ] Group chat creation flow: two-or-more selection in contact picker flips Start → Create group, optional group name, creates group, opens thread.
- [ ] Group info screen: members list, name/icon edit (admin only), leave button.
- [ ] First-contact banner: "You were added to this group by X. Stay or leave?"
- [ ] AI tab composer: send messages, SSE streaming, image upload (reuses `AiImageUpload` backend), context chips, "Ask AI about this" deep links work.
- [ ] Sheet generation flow on mobile: inline preview card, full-screen preview, publish action.
- [ ] AI rate limit UI: usage chip with tiered colors, limit-reached state.
- [ ] Reactions, stars, follows, comments, forks functional across all content types.
- [ ] Poll voting: tap option, flip to results view.
- [ ] Q&A answering: answer composer, star answer, asker accepts answer.
- [ ] "Ask AI about this" deep links from every content surface.
- [ ] Profile editing: avatar upload, banner upload, display name, username (with live availability check), bio, school, account type.
- [ ] Push notification setup:
  - [ ] Install `@capacitor/push-notifications` plugin.
  - [ ] Set up Firebase project and configure `google-services.json`.
  - [ ] Register FCM token on login; unregister on sign-out.
  - [ ] Handle incoming push payloads; route to correct screen via `data.route`.
- [ ] Email verification nudge flow:
  - [ ] Home banner when unverified (token-colored warning).
  - [ ] Day-2 full-screen modal.
  - [ ] Profile tab red dot and verify-email row.
  - [ ] Soft-limit modal on blocked actions (post, DM, create group, publish sheet).
  - [ ] Day-14 hard cutoff wall.
- [ ] Block and mute actions wired through `IconMoreHorizontal` menus everywhere.
- [ ] Report flow: report sheet with category picker, submits to admin queue.
- [ ] Mentions (`@username`) and hashtags (`#topic`) composer support with autocomplete sheet, Mention/Hashtag/PostHashtag tables + migration, notifications on mention, `/tag/<slug>` route.
- [ ] Roles v2 — Google OAuth role picker (`/signup/role`): `POST /api/auth/google` returns `needs_role` + tempToken for new users; `POST /api/auth/google/complete` creates the row with chosen accountType. See `docs/roles-and-permissions-plan.md` §4.
- [ ] Roles v2 — Self-learner onboarding track: `?track=self-learner` skips school/course steps, collects learning interests (HashtagFollow table + migration) and optional LearningGoal. See plan §5.
- [ ] Roles v2 — Self-learner feed redesign: hide school badges, swap course-chip row for interest-chip row, add pinned goal triage card, `getBoostedIdsForUser` helper. See plan §6.
- [ ] Roles v2 — label cleanup pass: `roleLabel()` util, replace every "Other"/"Member" role label with "Self-learner" across web and mobile. CI grep rule in place. See plan §7 and §13.
- [ ] Runtime permission choreography: contextual prompts for camera, mic, photos, contacts (with client-side SHA-256 hashing), calendar. `Fix in Settings` deep link for denied permissions.
- [ ] Referrals UI: invite code generation, `Invite friends` profile card with native share sheet, Play Install Referrer attribution on first launch, `InviteRedemption` table + migration.
- [ ] Settings screen functional implementation:
  - [ ] Account (email, password, 2FA, sessions, delete).
  - [ ] Appearance (theme, font size, reduce motion, high contrast).
  - [ ] Notifications (master + per-category toggles, quiet hours).
  - [ ] Privacy (profile visibility, DM permissions, group-add permissions, blocked users, muted users).
  - [ ] Security (biometric lock toggle, timeout, hide previews).
  - [ ] Content and feed (default filter, sensitive content, language, hide courses).
  - [ ] Subscription (plan card, manage subscription → external browser, payment history, referral).
  - [ ] Support (help center, contact, bug, feature, rate).
  - [ ] About (version, terms, privacy, licenses, acknowledgments).
  - [ ] Sign out.

### 5.3 Wave 3 exit criteria

- [ ] An active StudyHub user can use mobile as their daily driver for the four tabs.
- [ ] Voice messages send and play reliably.
- [ ] Group chat creation works end-to-end.
- [ ] AI sheet generation publishes to the user's account.
- [ ] Push notifications deliver for at least 5 of the 9 default-on event types.
- [ ] Email verification nudges appear correctly and soft-limits unverified users.
- [ ] All settings screens are functional.
- [ ] Lint, build, test pass on the full repo.

### 5.4 Wave 3 risks

- **Voice recording on older Android devices.** Web Audio API support varies. Mitigation: fall back to the native MediaRecorder API via Capacitor plugin if Web Audio is unavailable.
- **Push notification delivery reliability.** FCM is generally reliable but fails silently in some cases. Mitigation: add per-user push delivery logging and a "test push" action in Settings for diagnosis.
- **Voice moderation false positives.** Transcription + text classifier may over-flag. Mitigation: start with high-confidence thresholds; tune based on admin-review volume.

---

## 6. Wave 4 — Polish and Beta Ship (Weeks 9–10)

**Goal:** The app feels finished. Closed beta goes out the door.

### 6.1 Wave 4 backend tasks

- [ ] "Self-learner" UI string replacement on the web (backend value stays `other`).
- [ ] Feature flags endpoint: `GET /api/flags`.
- [ ] Minimum-supported-version gate: if mobile version < minimum, return a flag that triggers the force-update modal.
- [ ] Data export endpoint: `POST /api/privacy/export` queues a ZIP generation, emails download link within 72 hours.
- [ ] Account deletion endpoint: `DELETE /api/users/me` with 7-day grace; reactivation via login during grace.
- [ ] Age gate enforcement on `POST /api/auth/register` — reject US under-13, EU under-16 with appropriate errors.

### 6.2 Wave 4 mobile tasks

- [ ] Offline mode:
  - [ ] IndexedDB caching layer for feed, messages, notes, sheets, groups, profile.
  - [ ] Queue system for pending writes (messages, posts, reactions, read states).
  - [ ] Connection state indicator strip (uses `--sh-success-bg`, `--sh-warning-bg`, `--sh-danger-bg`).
  - [ ] Tap connection strip to see queued-items sheet.
  - [ ] LRU cache eviction at 100MB.
  - [ ] `Clear cache` button in Settings.
- [ ] Web handoff sheets:
  - [ ] In-app browser via `@capacitor/browser` for non-payment handoffs.
  - [ ] External browser via `Intent.ACTION_VIEW` for payment handoffs.
  - [ ] Branded close X + StudyHub S mark in the in-app browser chrome.
  - [ ] Return-to-app post-message bridge for action-completion.
- [ ] Deep link routing from push notifications.
- [ ] Quiet hours and notification throttling fully implemented in the backend push rules engine.
- [ ] App icon set: generate all densities including adaptive layers + monochrome for themed icons.
- [ ] Splash screen native configuration; programmatic dismiss on first paint.
- [ ] Status bar styling: light-icon in dark mode, dark-icon in light mode.
- [ ] Navigation bar theming: edge-to-edge, matches background.
- [ ] Biometric lock implementation:
  - [ ] `@capacitor-community/biometric-auth` integration.
  - [ ] Opt-in toggle in Settings → Security.
  - [ ] Lock screen component shown on resume from background past the timeout.
- [ ] Root / jailbreak detection via Play Integrity API.
- [ ] Repackaged APK detection (signature fingerprint validation in Kotlin shell).
- [ ] Screen-capture protection on sensitive screens (2FA, sessions, moderation).
- [ ] EXIF metadata stripping on client-side image uploads.
- [ ] Data saver mode: auto-detect via `navigator.connection`, override toggle in Settings, image/video/prefetch degradations per app plan §14.6.
- [ ] Deep-link arrival onboarding: Smart App Banner on mobile web, Play Install Referrer capture + first-launch routing to original shared URL, signed-out deep-link resume after login.
- [ ] Time zone handling: centralize render helpers, verify quiet-hours use `{start,end,tz}`, session cards render viewer-local with organizer-zone note, DST banner on affected session weeks.
- [ ] Moderation appeals: branded suspension/takedown screens with `Submit appeal` CTA, `Appeal` table + migration, admin appeals queue with 5-business-day SLA.
- [ ] Roles v2 — Settings RoleTile with 2-day revert window: `PATCH /api/users/me/account-type` handles change + revert, `GET /api/users/me/role-status`, `RoleChangeLog` + `UserEnrollmentArchive` tables + migration, reload-to-apply toast, `roleChangeLimiter` (3 changes / 30 days), Socket.io `user:roleChanged` cross-session sync. See `docs/roles-and-permissions-plan.md` §8.
- [ ] Roles v2 — notifications filter: `shouldSendForRole(event, user)` skips school announcements for Self-learners. See plan §10.1.
- [ ] Roles v2 — search ranking boost branches on accountType via `getBoostedIdsForUser`. See plan §10.2.
- [ ] In-app feedback: `Report a bug` and `Send feedback` sheets with category chips, auto-captured redacted screenshot, opt-in device info, `FeedbackReport` table + migration.
- [ ] Shake-to-report gesture: feature-flagged on for internal + beta cohort only.
- [ ] Draft sync between mobile and web for feed posts, notes, messages, AI messages.
- [ ] Mobile drafts auto-save every 3s; load draft on composer open if one exists.
- [ ] "Self-learner" label everywhere on mobile (and coordinated web rollout).
- [ ] Accessibility pass:
  - [ ] Every interactive element has a content description.
  - [ ] Touch targets ≥ 44x44dp.
  - [ ] Color contrast verified against WCAG 2.1 AA using the `design:accessibility-review` skill.
  - [ ] Dynamic type scales tested at 1x, 1.5x, 2x.
  - [ ] Focus order tested with an external keyboard.
- [ ] Performance profiling on a real Pixel 7 emulator:
  - [ ] 60fps scroll in feed.
  - [ ] 60fps animations on landing page.
  - [ ] Cold startup < 1.5s.
  - [ ] Warm startup < 500ms.
- [ ] Play Store assets:
  - [ ] 512x512 high-res icon.
  - [ ] 1024x500 feature graphic.
  - [ ] 4+ phone screenshots (Home feed, Messages thread with voice message, AI chat with sheet generation, Profile).
  - [ ] Short description (80 chars).
  - [ ] Full description (4000 chars).
  - [ ] Privacy policy link.
  - [ ] Data Safety section completed.
- [ ] Security checklist in `docs/mobile-security.md` §16 completed and signed.
- [ ] Internal beta track: upload AAB, invite 20–50 internal testers.
- [ ] Crash reporting verified: Sentry receives errors from mobile builds.

### 6.3 Wave 4 exit criteria

- [ ] All items in `docs/mobile-app-plan.md` §27 acceptance criteria are met.
- [ ] All items in `docs/mobile-security.md` §16 pre-release checklist are signed off.
- [ ] Closed beta is live on Play Store internal testing track.
- [ ] At least 10 beta testers have installed and used the app.
- [ ] No SEV 1 or SEV 2 issues open.
- [ ] Sentry crash-free rate ≥ 99% across the beta cohort.

### 6.4 Wave 4 risks

- **Play Store review delays.** Google's review typically takes 1–7 days but can run longer. Mitigation: submit to internal testing track early (internal testing has no review).
- **Accessibility audit uncovers major layout issues.** Mitigation: run the `design:accessibility-review` skill at the start of Wave 4, not the end.
- **Stripe external-browser handoff UX is rough.** Mitigation: a "return to app" success page on the web side that posts back to the mobile app via a deep link.

---

## 7. Wave 5 — Post-Beta Iteration (Weeks 11+)

**Goal:** Fix what beta feedback surfaces. Graduate to open beta and eventually production release.

### 7.1 Wave 5 tasks (iterative, prioritized by beta data)

- [ ] Top 10 bugs from internal beta fixed.
- [ ] Retention metrics instrumented: DAU/MAU, 1-day retention, 7-day retention, 30-day retention.
- [ ] Open beta: promote internal beta to open beta on Play Store.
- [ ] Weekly release cadence on main for bug fixes.
- [ ] Plan v1.1 features based on data:
  - [ ] Home screen widgets (streak, Ask AI, unread count, top feed item).
  - [ ] Focus mode / study timer.
  - [ ] Live study rooms (if retention signals justify infra cost).
  - [ ] Polls inside group chats.
  - [ ] Scholar (peer-reviewed article reader) — web first, mobile parity in same wave. Build waves A–E in `docs/scholar-plan.md` §16: backend module + 5-tier API chain, reader fallback chain, annotations, AI summarize/sheet-gen, claim check. Feature-flagged behind `flag_scholar`.
- [ ] Localization infrastructure:
  - [ ] `i18next` setup.
  - [ ] Extract hardcoded English strings to `src/i18n/en.json`.
  - [ ] First translation: Spanish.
- [ ] iOS wave-1 planning (after Android v1 production release).

### 7.2 Wave 5 exit criteria

- [ ] Open beta is live.
- [ ] Retention metrics at target (DAU/MAU ≥ 40%).
- [ ] v1.0 production release submitted to Play Store.
- [ ] Post-beta retrospective completed.

---

## 8. Dependencies and Risks Across Waves

### 8.1 External dependencies

- **Google Play Developer Console:** required for beta track and production release.
- **Firebase Cloud Messaging:** required for push notifications; set up in Wave 3.
- **Play Integrity API:** required for attestation; set up in Wave 4.
- **hCaptcha (or equivalent):** required for anti-scraping defense; set up in Wave 4.
- **PhotoDNA / NCMEC integration:** required for CSAM scanning; set up in Wave 4.

### 8.2 Key architectural risks

- **Cookie propagation across web and mobile.** If we migrate to a different session store (Redis, JWT-only), the two surfaces must stay in sync. Mitigation: test cross-surface signin in every wave.
- **Feed ranking divergence.** Mobile feed and web feed must produce comparable results for the same user so the experience feels unified. Mitigation: share the ranking logic in `backend/src/lib/feedRanker.js` (new) and test both surfaces.
- **Socket.io connection stability on mobile networks.** Cell handoffs and NAT changes can kill long-lived WebSockets. Mitigation: aggressive reconnection logic already in `useSocket.js`; test on subway / airplane modes.

### 8.3 Budget risks

- **Google Cloud Speech-to-Text costs** for voice message transcription can scale quickly with volume. Mitigation: cap user voice messages at 60/hour and monitor cost per active user.
- **FCM is free** but has fair-use limits. Mitigation: de-duplicate pushes aggressively per §16.3 of product plan.
- **Anthropic API costs** already scale with AI usage (tracked per plan in `ai.service.js`). Mobile may increase usage. Mitigation: existing rate limits hold; monitor and adjust.

---

## 9. Testing Strategy

### 9.1 Per-wave testing

- **Wave 1:** Manual testing of signup / signin / onboarding flows on Chrome device mode + physical Android device.
- **Wave 2:** E2E Playwright tests for mobile tab navigation. Manual UX review.
- **Wave 3:** Unit tests for all new backend endpoints. Integration tests for voice message upload and moderation pipeline. Manual testing of composer, voice, group chat creation.
- **Wave 4:** Full regression pass. Accessibility audit. Performance profiling. Security checklist.
- **Wave 5:** Ongoing. Prioritize tests for areas with bug reports.

### 9.2 Automated test suites

- **Backend:** `npm --prefix backend test` — Vitest + Supertest. Mobile-specific endpoints tested here.
- **Frontend unit:** `npm --prefix frontend/studyhub-app run test` — Vitest for component unit tests.
- **Frontend E2E:** `npm --prefix frontend/studyhub-app run test:e2e:beta` — Playwright. Extend with mobile viewport tests.
- **Full workspace:** `npm run beta:validate` — runs lint, build, and tests across backend and frontend.

### 9.3 Device test matrix

Final pre-beta testing on real devices:

- Pixel 6 (baseline low-end).
- Pixel 7 (mid-range).
- Pixel 8 Pro (high-end).
- Samsung Galaxy S22 (different vendor).
- OnePlus 10 (different OEM skin).

Emulator test matrix:

- Pixel 7 API 30 (minSdk).
- Pixel 7 API 34 (targetSdk).
- Pixel Tablet API 34 (tablet layout).

---

## 10. Release Management

### 10.1 Versioning

- **Semantic versioning** for `versionName`: `major.minor.patch` (e.g., `1.0.0`).
- **Monotonically increasing `versionCode`** for the Play Store (e.g., 1, 2, 3...).
- Mobile versions are separate from web versions. Web stays on its own semver track.

### 10.2 Release cadence

- **Beta phase:** weekly releases on Thursdays.
- **Post-GA:** bi-weekly releases unless a critical bug or security issue forces a point release.
- **Release notes** in `docs/mobile-releases/vX.Y.Z.md` for every public release.

### 10.3 Rollout strategy

- **Staged rollout** on Play Store: 1% → 10% → 50% → 100% over one week.
- **Monitor crash rate, retention, and feedback** at each stage.
- **Halt or rollback** if crash rate > 1% or retention drops > 10% relative to the prior version.

### 10.4 Rollback procedure

- Previous AAB retained in Play Console; can be promoted back via `halt rollout` + `re-release previous`.
- Feature flags allow disabling new features without a new release.
- Minimum-supported-version gate allows forcing users off a known-bad version.

---

## 11. Documentation Obligations

During and after each wave:

- **Wave 1:** Update this build plan with actual vs planned timings.
- **Wave 2:** Draft `docs/mobile-api.md` documenting the mobile-specific endpoints.
- **Wave 3:** Update `backend/README.md` with voice message handling notes.
- **Wave 4:** Final pass on all three docs. Sign off on security checklist. Publish internal-facing changelog.
- **Wave 5:** Public-facing changelog for each release. Help center articles for new mobile-specific features.

After each wave, update the beta release log at `docs/beta-v2.0.0-release-log.md` per `CLAUDE.md` convention.

---

## 12. Success Criteria (60 Days Post-Beta)

We consider the mobile app successful if at 60 days post-open-beta:

- Daily active users ≥ 40% of monthly active users.
- Average 3+ app opens per active day.
- Median session length 2–3 minutes, P95 ≥ 12 minutes.
- Feed scroll depth median ≥ 15 cards per session.
- ≥ 30% of active users send a message in their first week.
- ≥ 50% of active users engage with AI in their first two weeks.
- Crash-free sessions rate ≥ 99.5%.
- Play Store rating ≥ 4.3.
- No unresolved SEV 1 or SEV 2 security incidents.

If we are hitting all of these, we move from beta to general availability and start planning iOS (Wave 6).

---

## 13. Sign-off

This build plan is owned by Abdul Fornah and will be reviewed at the end of each wave.

Exit criteria for each wave are binding. Unless every criterion is met, we do not proceed to the next wave.

Revisions to this plan are tracked in git history on `docs/mobile-build-plan.md`.

---

End of build plan.
