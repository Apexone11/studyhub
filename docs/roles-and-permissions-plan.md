# Roles and Permissions Plan (Web + Mobile)

Single source of truth for how user roles are modeled, picked, switched, and reflected in the product surface on both the StudyHub web app and the Android mobile app. Read this before touching any role-aware code or UI string.

Companion docs:

- `docs/mobile-app-plan.md` — Android product spec.
- `docs/mobile-security.md` — mobile security posture.
- `docs/mobile-build-plan.md` — Android build waves.
- `docs/scholar-plan.md` — Scholar (peer-reviewed article reader) respects this role model. Self-learners get topic-first shelves via `getBoostedIdsForUser(user)` returning hashtag IDs; students/teachers get course-first shelves.
- `CLAUDE.md` — repo-wide conventions.

---

## 1. Why this doc exists

The original implementation of account types (`student`, `teacher`, `other`) is wired through the Prisma schema but is not actually enforced anywhere. Self-learners today receive a student experience with three small exceptions: the sidebar hides "My Courses," the sheets page hides school/course filters, and the school-suggestion banner skips them. Every other surface silently assumes the user has a school, enrolls in courses, and wants to share content "with their classmates."

We need to:

1. Make the Self-learner role a real, first-class experience.
2. Stop silently defaulting Google OAuth signups to `student`.
3. Let users change their role with a 2-day revert window and reload-to-apply semantics.
4. Produce a deep, page-by-page spec of what each role sees so nothing gets missed.
5. Write a test suite that keeps the differentiation from rotting.

---

## 2. Ground truth — what exists today

### 2.1 Two separate fields, often conflated

| Field              | Type                      | Values                        | Purpose                                       | Who reads it                                                      |
| ------------------ | ------------------------- | ----------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| `User.role`        | String, default `student` | `student`, `admin`            | Platform privilege (admin-only code paths).   | Backend middleware (`requireAdmin`, `trustGate`, etc.), admin UI. |
| `User.accountType` | String, default `student` | `student`, `teacher`, `other` | User self-classification. Meant to branch UX. | Stored only. Almost zero backend reads. Three frontend reads.     |

Also present: `User.pendingAccountType`, `User.accountTypeChangedAt` — scaffolding for a role-change flow. Used by `PATCH /api/users/me/account-type`, which currently enforces a 7-day cooldown and has no UI.

### 2.2 Where `accountType` is already respected

**Frontend (three spots):**

- `components/sidebar/AppSidebar.jsx` — hides the "My Courses" section and the `/my-courses` nav link when `accountType === 'other'`. Shows role label as "Student" / "Teacher" / "Member" (note: "Member," not "Self-learner").
- `pages/feed/FeedPage.jsx` — composer hint switches "Share with your classmates" → "Share with the community" when `accountType !== 'student'`.
- `pages/feed/SchoolSuggestionBanner.jsx` — early-returns for `accountType === 'other'`.
- `pages/feed/FeedWidgets.jsx` — marks the "Join a course" getting-started checklist as complete for `accountType === 'other'`.
- `pages/sheets/SheetsFilters.jsx` — hides school/course filter groups when `accountType === 'other'`.

**Backend:** zero reads of `accountType` for any feature decision. Only `role === 'admin'` is checked anywhere.

### 2.3 Label rot

- Signup chip still reads "Other."
- Settings deletion-reasons dropdown still reads "Other."
- Sidebar role label reads "Member."
- Profile badge reads "Member."
- No string "Self-learner" appears in the UI yet.

### 2.4 Google OAuth

`POST /api/auth/google` creates the user with `accountType: 'student'` silently. No picker. Existing email/password signup has a chip group that asks, but the Google path does not.

---

## 3. Role model (after this plan)

Two orthogonal axes stay, but their meanings are clarified.

### 3.1 Platform privilege — `role`

Unchanged. Values remain `student` (default for everyone) and `admin`. The name is legacy and it is not worth a breaking migration. Documentation and new code must avoid conflating `role` with `accountType`.

### 3.2 User classification — `accountType`

User-facing labels and backend enum values:

| Backend value | User-facing label | Default context                                                       |
| ------------- | ----------------- | --------------------------------------------------------------------- |
| `student`     | Student           | Enrolled at a school, takes courses, follows classmates.              |
| `teacher`     | Teacher           | Teaches at a school, publishes course materials, posts announcements. |
| `other`       | Self-learner      | No school, no course enrollments. Learns by interest and topic.       |

Every UI string on web and mobile uses "Self-learner," never "Other." The backend enum value stays `other` to avoid a data migration. A single frontend utility `roleLabel(accountType)` returns the correct human label in one place.

### 3.3 Implicit invariants

- A user is always exactly one of the three account types.
- `accountType` is independent from `role`. A Self-learner can be an admin. A teacher can be an admin.
- Admin privileges override role-based hides (an admin Self-learner still sees the admin panel).

---

## 4. Google OAuth role picker (no silent default)

### 4.1 Flow

1. User taps "Continue with Google." Google returns an `id_token`.
2. Backend `POST /api/auth/google` verifies the token and looks up the user by email.
3. **Existing user:** proceed as today (issue session cookie, land on Home). Skip the picker.
4. **New user:** backend does NOT create the user row yet. It returns `{ status: 'needs_role', tempToken, email, name, avatarUrl }`. The `tempToken` is a short-lived (15-minute) HMAC-signed JWT that carries the verified Google profile payload. Not persisted anywhere.
5. Frontend routes to `/signup/role` — a dedicated step that reuses the same three-chip design used in email signup: `Student`, `Teacher / TA`, `Self-learner`. Keyboard-accessible, minimum touch targets 44dp on mobile.
6. On selection, frontend calls `POST /api/auth/google/complete` with the `tempToken` and chosen `accountType`.
7. Backend validates the `tempToken` signature and expiry, creates the user row, issues the session cookie, and returns `{ user, nextRoute }`.
8. Frontend routes by role:
   - Student → `/onboarding` (school + courses path).
   - Teacher → `/onboarding?track=teacher` (school + teaching interests).
   - Self-learner → `/onboarding?track=self-learner` (learning interests, no school).

### 4.2 Edge cases

- **User bails before choosing role.** `tempToken` expires in 15 minutes. No row is created. Next Google attempt starts fresh.
- **Email collision.** If the Google email matches an existing email/password account, we treat this as an account link, not a new signup. We do NOT re-prompt for role; the existing `accountType` stays. We issue the session cookie as usual.
- **User refreshes on `/signup/role`.** We persist the `tempToken` in `sessionStorage` keyed by a short nonce so a refresh does not kick them back to the landing page.
- **Mobile (Capacitor).** The in-app browser handoff returns to a `studyhub://` deep link carrying the `tempToken`. Same picker screen is rendered as a native React Router route. No native form — keeps parity with web.
- **Abuse.** Rate limit `POST /api/auth/google/complete` to 10/hour per IP (new `googleCompleteLimiter` in `rateLimiters.js`).

### 4.3 Backend endpoints

- `POST /api/auth/google` — verify Google id_token. Returns `{ status: 'signed_in' }` with session cookie for existing users, or `{ status: 'needs_role', tempToken, email, name, avatarUrl }` for new users. Existing controller is updated; the response shape is extended.
- `POST /api/auth/google/complete` — body: `{ tempToken, accountType }`. Creates the user, sets session cookie, returns `{ user, nextRoute }`. New handler in `auth.google.controller.js`.

No database migration. Only controller logic changes.

---

## 5. Self-learner onboarding

Self-learners skip school and course enrollment entirely. Their onboarding funnel:

### 5.1 Step sequence

1. **Welcome** — same for every role. "Learning is better together."
2. **Pick learning interests** — a grid of 20 curated topic chips (Calculus, Web Dev, Spanish, SAT Prep, Physics, Creative Writing, Data Science, History, Music Theory, Philosophy, Biology, Coding Interview Prep, Statistics, Marketing, Design, Psychology, Chemistry, Economics, Law, Linguistics) plus a free-text field for any topic not on the chip list. Must select at least three. Each chip maps to a Hashtag row (see mobile-app-plan.md §7.12).
3. **Pick learning goal (optional)** — one-line free text: "What do you want to learn this month?" Stored as a `LearningGoal` row (see §9). Optional — user can skip.
4. **Find your community** — show 3 suggested study groups matching the user's interests plus 3 suggested creators. One-tap follow/join.
5. **Stay in the loop** — push permission prompt (mobile only) and email-digest opt-in.
6. **Done** — lands on Home with a "Welcome to StudyHub" triage card that fades after 24 hours.

### 5.2 What Self-learners are never asked

- School name.
- Graduation year.
- Major / field of study (distinct from interests — this is a student field).
- Class schedule.

### 5.3 What Teachers are asked differently

Not the focus of this document but called out for clarity: teachers pick school + teaching subjects in step 2 instead of courses. This matches the existing (unused) teacher-specific code path in the sidebar.

---

## 6. Self-learner feed redesign

### 6.1 Rule (from decision 1)

**Show public content regardless of source, but suppress school badges on cards when the viewer is a Self-learner.** Courses-world and self-learner-world coexist; we just hide the course scaffolding on the Self-learner side.

### 6.2 Hide

- School-suggestion banner (already hidden).
- "Posts from your classmates…" empty-state copy.
- "Join a course" getting-started checklist item.
- Course-tag filter chips at the top of the feed.
- School badges on feed cards, comment headers, and profile previews.
- School-scoped announcements that target a school the user is not in. (Global / multi-school / system announcements still show.)
- "Find classmates" suggestion card.

### 6.3 Keep

- Global sheets, notes, Q&A posts, polls.
- AI-generated sheet highlights.
- Study groups marked `discoverability: public`.
- Hashtag feeds (mobile-app-plan.md §7.12).
- Milestones and supporter cards.
- Profile suggestions (based on follow graph, not school).

### 6.4 Add

- **Topic-first feed.** Top of feed is the user's chosen learning interests (stored as Hashtag follows). Feed uses these as the ranking boost that students get from their enrolled courses.
- **Goal card.** Pinned triage card: "What do you want to learn this week?" Tapping it opens the `LearningGoal` editor.
- **"Popular with Self-learners this week" row.** Discovery shelf sourced from `FeedPost.view` aggregated over users with `accountType='other'`.
- **Creator spotlight.** Top three sheet/note creators in the user's top interests, refreshed weekly.
- **Rewording everywhere.** Composer hints, empty states, FAB labels, and notification copy all swap "classmates" → "community" and "courses" → "interests."

### 6.5 Ranking boost (server-side)

Student ranking boost today uses `enrolledCourseIds`. For Self-learners, the boost uses `followedHashtagIds`. Same ranker, different input set. Implemented as a single helper `getBoostedIdsForUser(user)` that returns either course IDs or hashtag IDs based on `accountType`.

---

## 7. Page-by-page hide / keep / add matrix

This is the deep-review output. It applies to both web and mobile unless a row is marked otherwise.

| Surface                                      | Student                             | Teacher                | Self-learner                                                   | Notes                                                                |
| -------------------------------------------- | ----------------------------------- | ---------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Home (unauth) hero                           | "For students" messaging            | Same                   | "For everyone who wants to learn" angle                        | One page, three rotating headlines selected by `intent` query param. |
| Sidebar — user label                         | Student                             | Teacher                | **Self-learner** (currently "Member")                          | Single `roleLabel()` util.                                           |
| Sidebar — My Courses section                 | Show                                | Show                   | Hide (already)                                                 | No change.                                                           |
| Sidebar — My Materials section               | Hide                                | Show (already)         | Hide                                                           | No change.                                                           |
| Sidebar — "Topics I follow" section          | Hide                                | Hide                   | Show (new)                                                     | Shows hashtag follows as quick-access links.                         |
| Feed — composer hint                         | Classmates copy                     | Same                   | Community copy (already partial)                               | Extend to FAB labels and empty states.                               |
| Feed — course-chip filter row                | Show enrolled                       | Show enrolled          | Hide, replace with interest chips                              | New component `InterestChipRow`.                                     |
| Feed — SchoolSuggestionBanner                | Show                                | Show                   | Hide (already)                                                 | No change.                                                           |
| Feed — school badges on cards                | Show                                | Show                   | Hide                                                           | Card component reads `viewer.accountType`.                           |
| Feed — empty state                           | Classmates copy                     | Same                   | "Follow topics or creators to fill your feed"                  | New `FeedEmptyStateSelfLearner` component.                           |
| Feed — triage goal card                      | None                                | None                   | Show (new)                                                     | Only for Self-learner; dismissable.                                  |
| Onboarding — Pick your school                | Required-ish                        | Required-ish           | Skip                                                           | Routing split by `track` query param.                                |
| Onboarding — Pick your courses               | Yes                                 | Yes                    | Replaced with learning interests                               | Same component, different data source.                               |
| Profile — school badge                       | Show if enrolled                    | Show if enrolled       | Hide, show topics badge                                        | Single `ProfileBadges` component.                                    |
| Profile — role badge                         | Student                             | Teacher                | **Self-learner** (currently "Member")                          | Uses `roleLabel()`.                                                  |
| Profile — Study tab                          | Courses-based widgets               | Courses-based          | **Replaced with "My learning" tab**                            | See §7.1.                                                            |
| Profile (others) — school chip on their card | Show                                | Show                   | Hide when viewer is Self-learner OR profile is Self-learner    | Applied to both directions.                                          |
| Sheets — filter sidebar                      | School/course filters               | Same                   | Hide (already)                                                 | No change.                                                           |
| Sheets — upload form                         | Course optional/recommended         | Course optional        | Course selector replaced with "Topics"                         | Server-side: `courseId` stays nullable; `hashtagIds[]` added.        |
| Sheets — card badges                         | School + course                     | Same                   | Hide school badge only                                         | Course tag stays if present, but styled as a topic chip.             |
| Notes                                        | Same                                | Same                   | Same                                                           | No change.                                                           |
| Study Groups — create                        | Web-only (already)                  | Web-only (already)     | Web-only, encourage topic-based                                | Mobile viewing only.                                                 |
| Study Groups — discover                      | Show school-matched + topic-matched | Same                   | Hide school-matched; show topic-matched only                   | Discovery ranker branches.                                           |
| Announcements feed                           | School-scoped + global              | School-scoped + global | Global + system only                                           | Backend filter applied.                                              |
| Announcements — create                       | Admin-only (today)                  | Admin-only             | Admin-only                                                     | Unchanged; out of scope.                                             |
| Courses directory                            | Browse + enroll                     | Browse + enroll        | Browse as reference; "Follow topic" button instead of "Enroll" | Courses map 1:1 to their primary topic hashtag.                      |
| Search — ranking boost                       | Course-matched first                | Course-matched first   | Interest-matched first                                         | `getBoostedIdsForUser(user)`.                                        |
| Settings — Account section                   | Role tile + editors                 | Same                   | Same                                                           | Role tile is new. See §8.                                            |
| Settings — Profile section                   | Major/graduation year               | Teaching subject       | Learning focus (optional)                                      | Fields flex by role.                                                 |
| Admin panel                                  | Hidden unless admin                 | Hidden unless admin    | Hidden unless admin                                            | `role === 'admin'`.                                                  |
| Notifications — per-school announcement      | Yes                                 | Yes                    | No                                                             | Server-side push router filters.                                     |
| Notifications — mention / reply / star       | Same                                | Same                   | Same                                                           | Identical across roles.                                              |
| AI rate limits                               | Standard                            | Standard               | Standard                                                       | No change.                                                           |
| Mobile home tab                              | Campus-flavored triage              | Same                   | Topic-flavored triage                                          | Single component, different `mode` prop.                             |
| Mobile FAB → Create menu                     | Post, Note, Sheet, Poll, Q&A        | Same                   | Same (but tag chips are topics, not courses)                   | No option is hidden; just relabeled.                                 |

### 7.1 "My learning" tab (Self-learner Profile replacement for Study tab)

Widgets, in order:

- Current learning goal card (editable).
- Recently viewed sheets and notes (read across any topic).
- Topics I follow (hashtag pills, tap to open feed).
- AI conversations I've had this week (last three, with titles).
- Sheets / notes I've published.
- Stars earned and contributions merged (counters).

No course progress, no class schedule, no grade predictions.

---

## 8. Role switch with 2-day revert window

### 8.1 Locked parameters (from decisions 2 and 3)

- **Revert grace window:** 2 days from the most recent change.
- **Rate cap:** 3 role changes per rolling 30 days, on top of the 2-day window. The revert itself does not count toward this cap.
- **On revert:** previous school and course enrollments are restored automatically. Data was soft-kept for exactly this purpose.

### 8.2 Schema changes

Migration: `backend/prisma/migrations/<timestamp>_add_role_revert_fields/migration.sql`.

Add to `User`:

- `previousAccountType String?` — what the user was before the most recent change. Null for users who have never changed.
- `roleRevertDeadline DateTime?` — when the user can no longer revert for free. Null when not inside a window.

Add new table `RoleChangeLog`:

- `id String @id`
- `userId String` (indexed)
- `fromAccountType String`
- `toAccountType String`
- `reason String?`
- `wasRevert Boolean @default(false)`
- `ip String?`
- `userAgent String?`
- `changedAt DateTime @default(now())`

Add new table `UserEnrollmentArchive` (for restoration on revert):

- `id String @id`
- `userId String` (indexed)
- `courseId String`
- `archivedAt DateTime @default(now())`
- `reason String` — always `role_change`

Every existing enrollment row that gets soft-removed when a student changes to Self-learner is copied into this table. On revert we move rows back. We only restore if the original courses still exist and are still joinable.

Rename note: the existing 7-day cooldown logic in `users.controller.js` is replaced by the 2-day / 30-day rule. `accountTypeChangedAt` remains; it is the "when did the active window start" timestamp.

### 8.3 State machine

States per user:

- **Stable** — `roleRevertDeadline` is null or in the past. `accountType` is active, no pending revert. Change is allowed if rate-cap budget is available.
- **In revert window** — `now < roleRevertDeadline`. User can revert to `previousAccountType` at no cost. User can also make a different new change, but that counts toward the rate cap.

Transitions:

- `change(toAccountType)` when Stable → write log, archive enrollments, possibly set new accountType, set `previousAccountType = fromAccountType`, `roleRevertDeadline = now + 2 days`. Charge 1 against the 30-day budget.
- `revert()` when In revert window → write log with `wasRevert = true`, restore archived enrollments, set `accountType = previousAccountType`, set `previousAccountType = null`, set `roleRevertDeadline = null`. **Do not charge** the 30-day budget.
- `change(toAccountType)` when In revert window (to something other than the previous) → treated as a new change. Write log. Archive current enrollments. Update. Restart window. Charge 1 against budget. The old previous is lost.
- Deadline expires → no event. On next read, the window is treated as over.

### 8.4 Endpoints

- `PATCH /api/users/me/account-type` — body: `{ accountType, reason? }`. Handles both forward changes and reverts. Response: `{ accountType, previousAccountType, roleRevertDeadline, needsReload: true, archivedEnrollmentCount }`. Enforces rate cap. Returns `409 COOLDOWN` with `retryAfter` and a human message if exceeded.
- `GET /api/users/me/role-status` — returns `{ accountType, previousAccountType, roleRevertDeadline, changesUsedLast30Days, changesRemainingLast30Days }`. Used by the Settings tile.

### 8.5 Settings UI (web + mobile)

Component: `settings/RoleTile.jsx`.

When **Stable**:

- Heading: `Your role: Self-learner`
- Secondary line: `Changed [relative time]. You can change again.`
- Primary action: `Change role` → modal.

When **In revert window**:

- Heading: `Your role: Self-learner`
- Secondary line (token-colored warning): `You have [X] hours to revert to Student at no cost.`
- Primary action: `Revert to Student` → confirmation modal.
- Secondary action: `Keep current role` — dismissable note, no immediate effect.

Change modal copy:

> Change role to {target}?
>
> You can revert this free for 2 days. After that, this becomes your role and you can only change again {N} time(s) in the next 30 days.
>
> [Cancel] [Change role]

Revert modal copy:

> Revert to {previous}?
>
> You will go back to being a {previous}. We will automatically restore your previous school and courses. Your posts, sheets, notes, and connections are untouched.
>
> [Cancel] [Revert]

### 8.6 Reload-to-apply

The backend response includes `needsReload: true`. Frontend shows a toast:

> Role updated. Refreshing to apply changes.

Then calls `window.location.reload()` after 1500 ms. Reason: sidebar nav, onboarding state, feed mode, profile tab composition, and several route guards all read `accountType` at mount. A soft reroute does not rebuild them reliably. A reload is the cheapest correct fix.

Localstorage flag `pending_role_reload = { targetRole, startedAt }` is set before the reload; cleared on the first page load after. If the reload was interrupted, the next load detects the stale flag and forces a reload once more.

### 8.7 Cross-device consistency

- Other active sessions (web in another tab, mobile app) receive a Socket.io event `user:roleChanged` on the user's own room.
- On receipt, the client shows the same toast and reloads itself. No data is kept stale between tabs.
- The FCM token is unchanged — role change does not invalidate auth.

### 8.8 Rate limiter

Add `roleChangeLimiter` to `rateLimiters.js`: 3 writes per 30 days per user, in addition to any standard per-IP bucket. Implementation: read `RoleChangeLog` for the user where `wasRevert = false` and `changedAt >= now - 30 days`; reject with 409 when count ≥ 3.

---

## 9. Data model summary

### 9.1 New tables / fields

| Change                                   | Table                                          | Purpose                                                                      |
| ---------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Add field `previousAccountType String?`  | `User`                                         | Revert target.                                                               |
| Add field `roleRevertDeadline DateTime?` | `User`                                         | Window end.                                                                  |
| Add field `learningGoal String?`         | `User`                                         | Optional free-text goal.                                                     |
| New table                                | `RoleChangeLog`                                | Audit + rate-cap source.                                                     |
| New table                                | `UserEnrollmentArchive`                        | Enable enrollment restoration on revert.                                     |
| New table                                | `HashtagFollow (userId, hashtagId, createdAt)` | Self-learner interest follows. Also reused for any user who follows a topic. |
| New table                                | `LearningGoal (userId, goal, createdAt)`       | History of goals; only the latest is shown.                                  |

All above live in a single migration: `<timestamp>_add_roles_and_interests`.

### 9.2 Migration order (critical)

1. Create `RoleChangeLog`, `UserEnrollmentArchive`, `HashtagFollow`, `LearningGoal` tables.
2. Add `previousAccountType`, `roleRevertDeadline`, `learningGoal` columns to `User`.
3. Backfill: none needed; all new fields default null.
4. Deploy backend code that reads/writes new tables but does not yet enforce new cooldown.
5. Deploy frontend role-aware UI behind a feature flag `flag_roles_v2`.
6. Flip flag on in staging, then production.
7. Remove the old 7-day cooldown constant.

---

## 10. Notifications, search, and analytics role-awareness

### 10.1 Push / email notifications

Server-side push router (`backend/src/modules/notifications/`) adds a `shouldSendForRole(event, user)` step. Rules:

- `school.announcement.created` — skip if viewer `accountType === 'other'` OR `viewer.schoolId !== event.schoolId`.
- `course.activity` — skip if user is not enrolled (already implicit, formalize it).
- `topic.activity` (new) — send if the user has a `HashtagFollow` for the relevant topic.
- `mention`, `reply`, `star`, `dm`, `ai.*` — role-agnostic. No change.

### 10.2 Global search ranking

`getBoostedIdsForUser(user)` helper returns one of:

- `{ kind: 'course', ids: [...] }` for students and teachers, using their enrolled/taught course IDs.
- `{ kind: 'hashtag', ids: [...] }` for Self-learners, using their `HashtagFollow` set.

Search results with any matching ID get a fixed ranking boost. One helper, two shapes, so the ranker stays simple.

### 10.3 Analytics

Every PostHog event gets `accountType` attached as a user property. Existing events need no schema change — the Cowork-analytics identify call adds one line. Funnels and retention dashboards gain a `group by accountType` dimension.

### 10.4 Sentry

Sentry user scope is already populated with `{ id, email }`. Add `accountType` so error triage can filter by role.

---

## 11. Mobile-specific considerations

Most of this document applies to both web and mobile. The mobile-specific deltas:

- **Role label in the sidebar equivalent** is the profile card at the top of the You tab. Same `roleLabel()` util.
- **Onboarding** runs inside the Capacitor WebView; the only mobile-specific piece is the push-permission prompt in step 5.
- **OAuth role picker** arrives via the in-app browser handoff. The `tempToken` round-trips through a `studyhub://` deep link.
- **Reload-to-apply** on mobile means `window.location.reload()` inside the WebView — no native reboot. Capacitor preserves session cookies across the reload.
- **Socket.io `user:roleChanged`** works the same way as on web.
- **Draft sync** (mobile-app-plan.md §3.5) preserves composer drafts across role changes as long as the draft type is still available in the new role.

The mobile build plan is updated to reference this document and add role-picker and role-switch UI to Wave 3 and Wave 4 respectively. See `docs/mobile-build-plan.md`.

---

## 12. Test plan

### 12.1 Unit (backend, Vitest)

- `auth.google.controller.test.js`
  - New user → returns `needs_role` + valid tempToken.
  - Existing user → returns `signed_in` with session.
  - Email collision with existing email/password account → does not re-prompt.
- `auth.google.complete.controller.test.js`
  - Valid tempToken + role → creates user with chosen accountType.
  - Expired tempToken → 400.
  - Invalid signature → 400.
  - accountType outside enum → 400.
- `users.controller.test.js`
  - `change(toAccountType)` writes `RoleChangeLog`, archives enrollments, sets deadline.
  - `revert()` restores enrollments, clears deadline, does not charge budget.
  - Third change within 30 days (excluding reverts) → 409.
  - `GET role-status` returns correct shape in all three states.
- `feed.list.controller.test.js`
  - Self-learner viewer → school badges absent on response.
  - Self-learner viewer → school-scoped announcements filtered out.
  - Student viewer → behavior unchanged.
- `search.ranking.test.js`
  - `getBoostedIdsForUser` branches correctly on accountType.
- `notifications.router.test.js`
  - `shouldSendForRole` filters correctly for each event type.

### 12.2 Unit (frontend, Vitest)

- `roleLabel.test.js` — returns "Student" / "Teacher" / "Self-learner" / throws on unknown. Never returns "Other" or "Member".
- `RegisterStepFields.test.jsx` — role chip reads "Self-learner," value is "other," default is unset (no default chip highlighted).
- `useRegisterFlow.test.js` — Google `needs_role` response routes to `/signup/role`.
- `AppSidebar.test.jsx` — renders `Self-learner`, hides My Courses, shows Topics I follow for accountType='other'.
- `ProfileBadges.test.jsx` — hides school chip when viewer or subject is Self-learner.
- `RoleTile.test.jsx` — three states render correct copy and actions.
- Label scan test: walks the rendered DOM of the signup page, settings page, sidebar, and profile page; fails if the literal string "Other" appears as a role label (whitelist: report-reason dropdown "Other," deletion-reason "Other").

### 12.3 Integration (Supertest)

- Full Google OAuth signup with role picker, hitting both endpoints with a mocked Google token verifier.
- Role change → revert → attempt third change within 30 days fails.
- Role change → wait > 2 days → revert attempt fails with correct error.
- Role change for a user with three enrolled courses → `UserEnrollmentArchive` gets three rows → revert restores all three.

### 12.4 E2E (Playwright)

- `role.self-learner-signup.spec.js` — email signup as Self-learner, onboarding skips school, picks interests, lands on topic feed, sidebar shows "Self-learner," My Courses is gone.
- `role.oauth-picker.spec.js` — Google button (mocked) → role picker screen → Self-learner → onboarding.
- `role.switch.spec.js` — Student switches to Self-learner, toast fires, reload happens, profile badge now reads "Self-learner," sidebar reflects change. Revert within 2 days succeeds and restores courses. Three changes in 30 days triggers cooldown error.
- `role.labels.spec.js` — full sweep across signup, settings, profile, sidebar, and feed for the string "Other" as a role label. Whitelist allowed contexts.
- `role.feed-redesign.spec.js` — Self-learner viewer sees interest chips (not course chips), sees no school badges on cards, sees topic-first triage.

### 12.5 Regression guards

- Add a role-aware snapshot test for the sidebar with all three accountTypes.
- Add a role-aware snapshot test for the profile badge row with all three accountTypes.
- Add a lint rule (custom eslint plugin or simple grep script in CI) that fails if new code introduces `'Other'` as a role label.

### 12.6 Manual QA checklist (Wave 4 polish)

- Sign up via Google, pick each of the three roles. Confirm correct onboarding.
- Sign up via email/password, pick each role. Same.
- As Student with two enrolled courses: switch to Self-learner, revert. Courses restored.
- As Self-learner: change to Teacher, change to Student (third change) within 30 days. Expect cooldown.
- As Self-learner: post to feed with topic tags. Appears with topic badge, not school badge, for other Self-learner viewers.
- As Student: view a Self-learner's profile. School chip is hidden in that context.
- As admin: still see admin panel regardless of accountType.
- Mobile: all of the above in the Capacitor build.

---

## 13. Feature flags and rollout

- `flag_roles_v2` — gates the entire plan.
- `flag_roles_v2_oauth_picker` — gates only the Google OAuth picker step. Lets us ship the label cleanup and feed redesign separately if needed.
- `flag_roles_v2_revert_window` — gates the new cooldown. Old 7-day rule stays in force until flipped.

Rollout order:

1. Label cleanup (all "Other" → "Self-learner") — ship alone first. Low risk.
2. Feed redesign (hide school badges, topic chips, empty state) — ship behind `flag_roles_v2`. Beta to 10% of Self-learners for a week. Then 100%.
3. OAuth picker — ship behind `flag_roles_v2_oauth_picker`. 100% immediately since it only affects new signups.
4. Role-switch UI and 2-day window — ship behind `flag_roles_v2_revert_window`. Migrate from 7-day rule.

---

## 14. Risks and open questions

### 14.1 Risks

- **Enrollment restoration on revert can fail.** If a course was deleted or closed during the 2-day window, we skip that course on restore. We surface this to the user: "2 of your 3 previous courses were restored; 1 course is no longer available."
- **User confusion around "reload to apply."** The toast is the only hint. If a user ignores it and keeps tapping, they might hit a stale route guard. Mitigation: the reload fires automatically after 1.5s.
- **Label creep.** Developers adding new code may type "Other" out of habit. The CI grep rule is the backstop.
- **Ranking regressions.** The interest-boost path is new. We should A/B test the shape before turning it on for 100% of Self-learners.

### 14.2 Open questions (acceptable to defer to post-beta)

- Should Teachers have a separate revert window, or share the same 2-day rule? Current spec: shared.
- Do we want "Parent" or "Supervisor" as a fourth accountType later? Out of scope now; schema already supports it via the enum.
- Should interest chips be limited to a curated vocabulary, or any user-created hashtag? Current spec: curated 20 + free text, where free text still creates a Hashtag row.

---

## 15. Acceptance criteria

The plan is considered fully implemented when:

- [ ] No UI surface displays "Other" or "Member" as a role label. Every reference reads "Self-learner."
- [ ] Google OAuth new-user flow cannot complete without a role pick. No silent default.
- [ ] A Self-learner's Home feed shows topic chips (not course chips) and suppresses school badges on cards.
- [ ] A Self-learner's Profile shows the "My learning" tab with goal, topics, and creations.
- [ ] A Self-learner does not receive push or email notifications for school announcements they are not affiliated with.
- [ ] Settings → Role tile exposes the change flow and the revert window.
- [ ] Role change writes a `RoleChangeLog` row and archives enrollments.
- [ ] Revert within 2 days restores enrollments and clears the window.
- [ ] Attempting a third change in 30 days returns `409 COOLDOWN`.
- [ ] Reload-to-apply toast fires and the sidebar/profile/feed reflect the new role after reload.
- [ ] Socket.io `user:roleChanged` propagates to other sessions and triggers the same reload.
- [ ] All tests in §12 pass. Label-scan test is green on a clean build.
- [ ] Mobile parity: the Capacitor build exhibits all the above behaviors end-to-end.
