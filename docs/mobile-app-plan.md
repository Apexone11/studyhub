# StudyHub Mobile — Product Plan

Status: Draft, April 2026
Scope: Android mobile app (first platform), designed to be seamless with the existing StudyHub web product
Owner: Abdul Fornah

This document is the living product spec for the StudyHub Android mobile app. It covers the product vision, platform decisions, every screen, every tab, every user flow, and the cross-platform contract with the web app.

Companion documents:

- `docs/mobile-security.md` — security posture, compliance, and threat model
- `docs/mobile-build-plan.md` — waves, milestones, and exit criteria

---

## 1. Vision and Positioning

### 1.1 The product in one sentence

StudyHub Mobile is a campus-pulse feed app for anyone who is studying — students, teachers, and self-learners — with the fastest path from a study question to an answer, to a note, to a classmate.

### 1.2 Audience (revised from "students" to "learners")

Everyone who wants to learn is a student. The product covers:

- **College and high-school students** with a school affiliation and courses.
- **Teachers** who publish materials, announcements, and run study groups.
- **Self-learners** who are prepping for exams (bar, CPA, bootcamp), learning a language, learning to code, or studying any topic on their own. No school or course affiliation required.

All three flow through the same app. The only role-aware differences are account-type-specific sections (teacher "My Teaching," self-learner "Topics I'm studying," etc.).

### 1.3 Why the mobile app exists (its job)

The web version is where heavy work happens — long-form sheet editing, study-group creation, admin tooling. The mobile app is where the **between-moments use** happens: a 30-second check-in between classes, a 10-minute scroll while eating lunch, a quick message to a classmate, a voice-memo note before you forget, a fast AI question when you are stuck.

Mobile is NOT a shrunken web. Mobile has its own pages designed for one-handed use, thumb-reachable controls, and the native gestures Android users expect (swipe, pull-to-refresh, long-press, share).

### 1.4 Hero feature

The **Home / Feed tab** is the hero. Everything else supports it.

The feed is a two-band composition:

- **Triage band** at the top (what you need to know right now).
- **Discovery band** below (what is happening in your study world).

This is why users will open the app multiple times a day.

### 1.5 Success metrics (target, beta launch + 60 days)

- Daily active users / monthly active users (DAU/MAU) ratio ≥ 40% (strong engagement signal for social apps).
- Average 3+ app opens per active day.
- Median session length of 2–3 minutes, P95 of 12+ minutes (proves we hit both the 30-second check and the 10-minute scroll).
- Feed scroll depth: median user sees 15+ cards per session.
- At least 30% of active users send a message in their first week.
- At least 50% of active users engage with AI in their first two weeks.

---

## 2. Platform Strategy

### 2.1 Technology stack

- **Wrapper:** [Capacitor](https://capacitorjs.com/) around the existing `frontend/studyhub-app/` React 19 + Vite codebase. Capacitor exposes native Android APIs (camera, mic, push notifications, biometrics, file system, in-app browser, share sheet) to the same React code the web uses.
- **Why not React Native / Flutter:** Rewriting 30+ pages in a new stack would cost 3–6 months and split the codebase. Capacitor keeps one source of truth; we add mobile-specific routes and components under the same `src/` tree.
- **Why not PWA alone:** PWAs on Android have improved but still have gaps — push notification fidelity, biometric auth, Play Store distribution, native share-sheet integration. Capacitor gives us all of that.
- **Native language bridges:** We will write tiny Kotlin glue only when Capacitor's plugin surface is insufficient (rare).

### 2.2 Platform matrix

| Surface                | Status              | Notes                                                                 |
| ---------------------- | ------------------- | --------------------------------------------------------------------- |
| Android (phone)        | In scope, wave 1    | Pixel 6 and newer as baseline, Android 11+ supported                  |
| Android (tablet)       | Responsive only     | Layout scales up; we use the same shell but wider grid on 7"+ tablets |
| iOS (iPhone)           | Deferred            | Capacitor supports iOS; we add it after Android beta ships            |
| iOS (iPad)             | Deferred            | Same as iOS phone                                                     |
| Web (desktop / laptop) | Continues unchanged | Remains the primary creation and admin surface                        |
| Web (mobile browser)   | Continues to work   | Redirects users to Play Store listing via a smart banner              |

### 2.3 Minimum supported Android version

- `minSdk` 30 (Android 11).
- `targetSdk` 34 (Android 14) at first release, bumped to current each year per Play Store policy.
- Rationale: covers 95%+ of active Android phones in the US college market. Android 10 and below cut out WebView features we rely on.

### 2.4 Testing setup (for local development)

Three tiers, used at different times in the build:

1. **Chrome device-mode (daily design and logic work).** Run `npm --prefix frontend/studyhub-app run dev`, open Chrome DevTools, switch to device toolbar, pick Pixel 7. Zero install. Used for 90% of iteration. Limitation: no native APIs (no camera, no push, no biometrics).
2. **Android Studio emulator (feature verification).** Install Android Studio, create a Pixel 7 API 34 virtual device, run `npx cap run android`. Full Android system in a window on the dev computer. Used to validate native APIs, gestures, push notifications, and real-device rendering.
3. **Physical Android device via USB (final validation).** Plug in a real Android phone, enable Developer Mode and USB Debugging, run `npx cap run android --target=<device>`. Hot reload on device. Catches performance issues the emulator hides.

Setup order:

- **Day 1:** Tier 1 (Chrome device-mode). Zero install cost.
- **Beta ship week:** Tier 2 (emulator). Install and validate.
- **Daily dev after beta:** Tier 3 (physical device). Plug in and iterate.

---

## 3. Cross-Platform Data Model

### 3.1 One account, one session

A user signs up on either surface and their account works on the other with no extra setup.

- **Auth:** Same JWT in an `HttpOnly` + `Secure` + `SameSite=Lax` cookie (`studyhub_session`). Capacitor's WebView stores it in the app's sandboxed cookie jar. Web stores it in the browser.
- **No mobile-specific token or API key.** One auth system.
- **Multi-session:** A user can be signed in on multiple devices simultaneously. Each device has its own session row; they operate independently and sync state via the shared API and Socket.io.

### 3.2 What syncs automatically

All user data flows through the same `/api/...` endpoints and the same Socket.io event bus:

- Profile (name, avatar, banner, bio, account type, school, courses).
- Sheets, notes, feed posts, comments, stars, follows, forks.
- Study groups (membership, resources, sessions, discussions).
- Messages (DMs and group chats), reactions, read receipts, typing indicators, voice messages.
- AI conversations (title, messages, pinned items, attached context).
- Notifications (seen/unseen state).
- Blocks, mutes, reports.
- Subscription state (plan, billing status).
- Dark/light mode preference (server-stored on the user record so it follows across devices).

### 3.3 What is mobile-exclusive

Stored locally on the device, not in the server-side user record:

- Device push notification token (stored on a `DeviceToken` table keyed to the user, but device-local in practice).
- Biometric lock preference (opt-in, kept in Android's secure keystore).
- Offline cache (IndexedDB in the WebView).
- Notification quiet hours (synced to user record so web settings page can mirror it, but primarily used by mobile).

### 3.4 What is web-exclusive

These actions only happen on the web. Mobile routes users to an external browser (NOT the in-app sheet — see §15 Web Handoff):

- Stripe Checkout and Customer Portal (Pro upgrade, payment method, cancellation). Google Play requires this to be external for any digital-goods subscription escape route.
- Study group creation (configuration is too dense for mobile; mobile lets users join, RSVP, post, and read).
- Admin panel (moderation, revenue, staff verification, user management).
- Full-featured sheet editor (mobile has a simple viewer and can publish AI-generated sheets).
- Rich-format teacher announcements.

### 3.5 Draft sync

Drafts written on mobile sync to web and vice-versa. Requires a small backend addition: a `Draft` table keyed to `(userId, draftType, draftKey)` with a JSON body and timestamps. Autosave every 3 seconds while typing. The draft appears on the other surface within 2 seconds of the user opening the relevant composer. Supported draft types: `feed_post`, `note`, `message`, `ai_message`.

### 3.6 Account type names (unified labels)

Mobile ships with and web migrates to these exact user-facing strings. Backend enum values stay the same to avoid a breaking migration:

| Backend value | User-facing label |
| ------------- | ----------------- |
| `student`     | Student           |
| `teacher`     | Teacher           |
| `other`       | Self-learner      |

Every UI string on both mobile and web must use "Self-learner," not "Other." This change is tracked in the build plan (wave 4 polish).

**Full role spec:** See `docs/roles-and-permissions-plan.md` for the complete plan covering OAuth role picker, Self-learner feed redesign, the page-by-page hide/keep/add matrix, the 2-day revert window, and the role test suite. The mobile app inherits every behavior defined there. This file only covers mobile-specific deltas; anything not overridden here matches that plan.

### 3.7 Time zone handling

One canonical rule across mobile, web, and backend: **store UTC, render local.**

- Backend always returns ISO-8601 timestamps with `Z` suffix (or explicit offset). Never returns wall-clock strings.
- Mobile renders using `Intl.DateTimeFormat` with the device's current IANA zone (auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`).
- Quiet hours (see §16.4) are stored as a `{startMinute, endMinute, tzName}` triple so the window travels with the user. Changing time zones does not silently shift quiet hours.
- Study sessions display in the viewer's local zone, with the organizer's zone shown as a subtle second line: `Thu 7:00 PM (Fri 12:00 AM organizer time)` if they differ.
- DST transition weeks: the 25-hour or 23-hour day is handled by the JS engine; we add a one-line note (`Clocks change this week`) on session cards for the affected range to prevent "did I miss it?" confusion.
- Server-sent push notifications include an absolute UTC timestamp; the device formats it for display, so a delayed push never shows the wrong "time ago."

---

## 4. Visual Identity (Mobile)

### 4.1 Design tokens

All inline colors MUST use the existing StudyHub CSS custom property tokens defined in `frontend/studyhub-app/src/index.css`. Hardcoded hex colors are forbidden per project convention (see `CLAUDE.md` § CSS and Styling).

Mobile uses the same token set. Key tokens in use:

- **Surfaces:** `--sh-bg`, `--sh-surface`, `--sh-soft`, `--sh-page-bg`.
- **Text:** `--sh-text`, `--sh-heading`, `--sh-subtext`, `--sh-muted`.
- **Brand:** `--sh-brand`, `--sh-brand-hover`, `--sh-brand-soft`, `--sh-brand-soft-bg`, `--sh-brand-border`, `--sh-brand-accent`.
- **AI gradient:** `--sh-ai-gradient` (`linear-gradient(135deg, var(--sh-brand), var(--sh-brand-accent))`).
- **Slate scale:** `--sh-slate-50` through `--sh-slate-900`.
- **Borders:** `--sh-border`, `--sh-border-strong`.
- **Pills and inputs:** `--sh-pill-bg`, `--sh-pill-text`, `--sh-input-bg`, `--sh-input-text`, `--sh-input-placeholder`, `--sh-input-border`, `--sh-input-focus`, `--sh-input-focus-ring`.
- **Buttons:** `--sh-btn-primary-bg`, `--sh-btn-primary-text`, `--sh-btn-primary-shadow`, `--sh-btn-secondary-bg`, `--sh-btn-secondary-text`, `--sh-btn-secondary-border`.
- **Semantic states:** `--sh-danger`, `--sh-danger-bg`, `--sh-danger-border`, `--sh-danger-text`, `--sh-success`, `--sh-success-bg`, `--sh-success-border`, `--sh-success-text`, plus warning and info variants.

### 4.2 Dark mode and light mode

Mobile respects the system theme via `window.matchMedia('(prefers-color-scheme: dark)')` on first launch. The user can override with a manual toggle; their choice is stored on the server user record (not in `localStorage`) so it follows them across devices.

Both modes are fully styled from the shared token set. Dark mode token values are defined under `[data-theme='dark']` in `index.css`.

### 4.3 Typography

- Font family: **Plus Jakarta Sans** (matches the web). Shipped as a bundled font file inside the app assets to avoid network dependency on first paint.
- Default size: 16px base. User-adjustable in Settings → Appearance (small / medium / large maps to 14 / 16 / 18 px).
- Respects Android system font scaling up to 2x for accessibility.

### 4.4 Motion and animation

- Entrance animations use anime.js (already a project dependency). Example: landing logo scales from 0.9 to 1.0 over 600ms with elastic easing.
- All motion respects `prefers-reduced-motion`. When reduced motion is on, animations fade in with no translation or scale.
- 60fps budget on a Pixel 6 is the floor. Any transition that drops below 55fps on that device is a bug.
- GPU-accelerated properties only (`transform`, `opacity`). Never animate `top`, `left`, `width`, or `height`.

### 4.5 Iconography (no emojis)

StudyHub has a custom icon set in `frontend/studyhub-app/src/components/Icons.jsx`. All icons use a 24×24 viewBox with `currentColor`, share the "Fork Tree" design DNA (rounded linecaps, Q-curves, node circles, two stroke weights), and give the app a consistent professional-yet-welcoming feel.

**Mobile re-uses this exact set.** No third-party icon library is added. No emoji is used as an icon anywhere in the app.

### 4.6 Icon mapping — every UI surface to a specific Icon export

Icons already in `Icons.jsx` that the mobile app uses:

| UI surface               | Icon export          |
| ------------------------ | -------------------- |
| Bottom tab: Home         | `IconFeed`           |
| Bottom tab: Messages     | `IconMessages`       |
| Bottom tab: AI           | `IconSpark`          |
| Bottom tab: Profile      | `IconProfile`        |
| Top bar: search          | `IconSearch`         |
| Top bar: notifications   | `IconBell`           |
| Floating + button (Home) | `IconPlus`           |
| Sheet card type          | `IconSheets`         |
| Note card type           | `IconNotes`          |
| Group activity card      | `IconUsers`          |
| Announcement card        | `IconAnnouncements`  |
| Star action (unfilled)   | `IconStar`           |
| Star action (filled)     | `IconStarFilled`     |
| Fork action              | `IconFork`           |
| Follow / people          | `IconUsers`          |
| Edit profile             | `IconPen`            |
| Upload                   | `IconUpload`         |
| Download                 | `IconDownload`       |
| Camera                   | `IconCamera`         |
| Settings                 | `IconSettings`       |
| Shield / privacy         | `IconShield`         |
| Shield check / verified  | `IconShieldCheck`    |
| Email verified           | `IconMailCheck`      |
| Lock                     | `IconLock`           |
| Sign out                 | `IconSignOut`        |
| Info tooltip             | `IconInfoCircle`     |
| Comment bubble           | `IconComment`        |
| Time / clock             | `IconClock`          |
| Filter                   | `IconFilter`         |
| Check                    | `IconCheck`          |
| Close                    | `IconX`              |
| More (three dots)        | `IconMoreHorizontal` |
| Book                     | `IconBook`           |
| School                   | `IconSchool`         |
| Chevron down (dropdown)  | `IconChevronDown`    |
| Arrow forward / next     | `IconArrowRight`     |
| Arrow back               | `IconArrowLeft`      |
| Eye (view password)      | `IconEye`            |
| Loading                  | `IconSpinner`        |
| Heart (reaction)         | `IconHeart`          |
| Link (copy)              | `IconLink`           |
| Code block               | `IconCode`           |
| Tag                      | `IconTag`            |
| Report / flag            | `IconFlag`           |

**Icons to add to `Icons.jsx` for mobile features (following the existing Fork Tree DNA):**

| New icon              | Usage                                         |
| --------------------- | --------------------------------------------- |
| `IconMic`             | Voice message record, voice-to-text input     |
| `IconMicOff`          | Voice recording cancelled state               |
| `IconPlay`            | Voice message playback                        |
| `IconPause`           | Voice message playback                        |
| `IconPaperclip`       | Attachment in composer                        |
| `IconImage`           | Image upload in composer                      |
| `IconPoll`            | Poll post type marker                         |
| `IconQuestion`        | Q&A post type marker                          |
| `IconFire`            | Streak indicator                              |
| `IconWave`            | Waveform placeholder for voice messages       |
| `IconPin`             | Pinned conversation / pinned note             |
| `IconSparkFilled`     | Active AI state (filled variant of IconSpark) |
| `IconShare`           | Native share action                           |
| `IconExternalLink`    | In-app browser indicator                      |
| `IconChatBubbleGroup` | Group chat indicator (distinguished from DM)  |

These new icons follow the existing Icon DNA: 24×24 viewBox, `currentColor`, outline style, `strokeLinecap="round"`, two stroke weights (1.8 for primary, 1.3–1.6 for detail), and include a node circle somewhere in the design where it feels natural. Colors always come from tokens; no hardcoded hex.

### 4.7 App icon (Android launcher)

Uses Android's adaptive icon spec:

- **Foreground layer:** Cropped StudyHub logo mark (the fork-tree). Rendered in white on the dark background variant; rendered in brand color (`--sh-brand`) on the light background variant. 25% safe padding so it survives circle, squircle, and rounded-square masks.
- **Background layer:** Subtle brand gradient built from tokens — dark mode uses `--sh-slate-900` to `--sh-brand-dark`, light mode uses `--sh-brand-soft-bg` to `--sh-surface`.
- **Monochrome layer:** Solid white foreground silhouette for Android 13+ themed icons. System tints to match the user's wallpaper.

Densities shipped: mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi, plus round variant and monochrome variant.

### 4.8 Splash screen

Native splash via Capacitor's splash-screen plugin:

- **Background color:** Chosen at boot from system theme. Dark: `--sh-slate-900`. Light: `--sh-bg`.
- **Centered logo mark.** No text.
- **`splashImmersive: true`**, status bar and nav bar hidden during splash.
- **Programmatic dismiss** via `SplashScreen.hide()` called from JS after the first paint is ready. Target: splash visible ≤ 800ms on warm launch, ≤ 1.5s cold.

### 4.9 Status bar and system navigation bar

- Status bar icons adapt to theme: light-icon style in dark mode, dark-icon style in light mode (via `@capacitor/status-bar`).
- System navigation bar (3-button or gesture area) matches app background color, with edge-to-edge rendering.
- Theme color meta for the in-app browser chrome: `--sh-brand`.

---

## 5. Landing Page (Opening Screen)

Shown on first launch and whenever a signed-out user opens the app.

### 5.1 Layout

Three vertical zones, each occupying roughly one third of the screen.

**Top third — animated hero.** Centered cropped StudyHub logo mark. Behind the logo, a soft gradient mesh drifts slowly (two or three colored orbs, each 80–100px blur radius, on independent 20–30 second loops). Dark mode: deeper, more saturated orbs against `--sh-slate-900`. Light mode: pastel orbs against `--sh-bg`.

**Middle third — value proposition.** Three lines, fading up 150ms apart:

- Line 1 (large, bold, heading weight): `StudyHub`
- Line 2 (medium): `Study together. Get better.`
- Line 3 (small, `--sh-subtext`): `Notes, sheets, and a circle of people learning what you're learning.`

**Bottom third — actions.**

- Primary button full-width: `Get started` (routes to signup bottom sheet).
- Secondary button full-width: `I already have an account` (routes to sign-in bottom sheet).
- Below the buttons, a single row of microcopy: `By continuing, you agree to our Terms and Privacy Policy` with the two terms as tappable links that open in the in-app browser sheet.

In the top-right corner, a tiny theme toggle (sun/moon) lets the user override the system theme before they even sign up.

### 5.2 Animations

- Logo entrance: anime.js scale from 0.9 to 1.0, `easeOutElastic`, 600ms, GPU-accelerated via `transform` only.
- Gradient orbs: CSS `@keyframes` using `translate()` on 20–30s loops, all three orbs phase-offset.
- Headline lines: stagger fade + translate-up, 150ms apart, total sequence ~900ms.
- All animations respect `prefers-reduced-motion`.

### 5.3 Signup bottom sheet

Triggered by `Get started`. Slides up from the bottom of the screen, occupies 80% of the viewport, has a drag handle at the top.

**Step 1 (email + password):**

- Email input (with validation pattern).
- Password input with `IconEye` toggle for show/hide.
- "Continue with Google" button as an alternative (OAuth flow via in-app browser sheet).
- Link at the bottom: "Already have an account? Sign in."

**Step 2 (username + account type):**

- Username input (with live availability check).
- Account type picker: three cards labeled `Student`, `Teacher`, `Self-learner`. Each card has an icon (`IconSchool`, `IconPen`, `IconSpark`) and one-line description.
- Student flow continues to a lightweight school + course picker (skippable). Teacher flow continues to "What are you teaching?" (skippable). Self-learner skips school entirely.

**Post-signup:** User lands in the onboarding sequence (§6), then Home.

### 5.4 Sign-in bottom sheet

Triggered by `I already have an account`. Same sheet UI as signup but a single step:

- Email input.
- Password input with `IconEye` toggle.
- "Forgot password?" link (opens in-app browser sheet to web reset flow).
- "Continue with Google" button.
- Primary "Sign in" button.
- Link at the bottom: "Don't have an account? Get started."

### 5.5 Returning user path

If the app detects a valid session cookie on launch, we skip the landing page entirely and go straight to Home. A brief 300ms splash with just the logo holds the moment so the app feels deliberate, not jumpy.

### 5.6 Google OAuth on mobile

Tap "Continue with Google" → opens the in-app browser sheet to `/auth/google`. Google OAuth completes in the sheet. On success, Google redirects to `/auth/google/callback`, which sets the session cookie and posts a message back to the native app via the Capacitor bridge. The app closes the sheet and navigates to Home (or onboarding if new user).

---

## 6. Onboarding Sequence

Three screens shown between signup and Home. All skippable. Total target time: under 60 seconds.

### 6.1 Screen 1 — "What do you want to do here?"

Headline: `Pick what you are here for. You can do all of these later.`

A grid of selectable chips. Pick up to three:

- `Share my notes`
- `Find study partners`
- `Get help with coursework`
- `Build study sheets`
- `Ask AI`
- `Follow what classmates are learning`
- `Just browsing`

Chip state styled from `--sh-pill-bg` / `--sh-pill-text` when unselected, `--sh-brand` / `--sh-btn-primary-text` when selected.

Primary button: `Continue`. Tertiary link in top-right: `Skip`.

Selections are stored on the user record (`onboardingGoals: string[]`) and used by the feed ranker to seed initial content.

### 6.2 Screen 2 — "Who do you want to learn alongside?"

For students with courses: headline `People in your courses` plus a list of 5–10 classmates with avatars, names, shared-course tags, and "Follow" toggles (all on by default). A "Follow 3 popular learners in your topics" section below that.

For self-learners: headline `What are you studying?` plus a topic-chip picker (`Math`, `Computer Science`, `Biology`, `Chemistry`, `Law`, `Language Learning`, `Design`, `Finance`, `Medicine`, `Philosophy`, `History`, `Engineering`, and others). After picking topics, a list of "Popular learners in your topics" appears with follow toggles.

For teachers: headline `Invite your students`. A shareable invite link and "Skip for now" button.

Primary button: `Continue`. Tertiary: `Skip`.

### 6.3 Screen 3 — "Stay in the loop"

Headline: `Get notified when friends message you, reply to your posts, or start study sessions.`
Subhead: `You can change this anytime in Settings.`

Two buttons of equal visual weight:

- `Allow notifications` — triggers the native FCM permission prompt.
- `Maybe later` — skips without triggering the prompt.

No dark patterns. Both buttons are styled plainly; neither is visually dominant.

After screen 3, a brief welcome splash (`Welcome to StudyHub, [firstName]`) plays for 300ms with a subtle confetti particle animation, then the app transitions to Home.

### 6.4 Re-engagement behavior

If the user leaves onboarding mid-flow, their next app open reopens onboarding at the screen they left. After three dismissals we drop the onboarding entirely and send them to Home.

---

## 7. Home / Feed Tab

The hero. Two-band design: triage + discovery.

### 7.1 Top bar (sticky, 56dp)

Left: small circular user avatar (tap → Profile tab).

Center: `StudyHub` wordmark, or the user's school logo if set.

Right: `IconSearch` → opens full-screen search. `IconBell` → slides a notifications panel from the top. The bell has a status dot rendered with `--sh-danger` when unread > 0, plus an unread count badge.

### 7.2 Triage band (top 1–2 screens, max 5 cards)

Ordered by recency and signal strength. Cards are visually dense — one line, small avatar, verb-first sentence, tiny timestamp. Each card is tappable and routes to the relevant destination.

Content types in the triage band:

- Reply to a comment the user posted.
- Star or fork on one of the user's sheets.
- New DM preview from a close contact (tap → open that DM).
- New follower the user has not acknowledged.
- Study group session starting in the next hour.
- Fresh note or sheet posted by someone the user follows in a course the user is taking.
- Accepted answer on a Q&A the user asked.

After the triage band, a subtle divider labeled `Discovery` separates the bands.

### 7.3 Discovery band (infinite scroll)

Larger, richer cards with thumbnails and reaction counts. Ranked by recency × engagement × affinity.

### 7.4 Post types (eight total)

Each type has its own card layout and backend post-type marker.

**1. Sheet post.** Author avatar and name, course tag (pill), sheet title, preview thumbnail (first-render screenshot of the HTML), star count, fork count, `View sheet` CTA. Tap → mobile sheet viewer. Icon: `IconSheets`.

**2. Note post.** Author, course tag, note title, first ~150 chars of body, pinned/tagged indicators, star count. Tap → note viewer. Icon: `IconNotes`.

**3. Feed post (free-form status).** Author, text (max 500 chars), optional image, optional course tag, reactions and comments inline.

**4. Group activity.** Group icon, group name, one-line summary, `Open group` CTA. Only shown to members. Icon: `IconUsers`.

**5. Announcement.** Author (typically teacher or admin), announcement body, colored left border (rendered with `--sh-brand`), "Announcement" pill. Has an `Acknowledge` action instead of Like. Icon: `IconAnnouncements`.

**6. Milestone / system post.** System-generated: "You got your 10th star this week," "Your Calc 2 sheet is trending," "Alex joined 3 of your courses."

**7. Poll post.** Author, optional course tag, question, 2–6 options. Tap an option to vote. After voting, card flips to results view (horizontal bars with percentages and vote counts). Optional expiration ("closes in 3 days"). Icon: `IconPoll`.

**8. Q&A post.** "Asked" pill at the top, question, optional course tag, optional attachment (image or code snippet), `Answer` CTA. Threaded answers below, each starrable. Asker can mark one answer as accepted, which pins it and adds `IconCheck`. Icon: `IconQuestion`.

### 7.5 Reactions and inline actions

- **Long-press any card** → radial quick-react bar with: star, fire (trending), lightbulb (helpful), question mark (I have a question), bookmark (save for later).
- **Tap comment bubble icon** (`IconComment`) → opens comments sheet without leaving the feed.
- **Tap card body** → full detail view.
- **Tap `IconMoreHorizontal`** (three dots, top-right of card) → context menu: Share, Report, Not interested, Mute author, Block author, Ask AI about this.

### 7.6 "Ask AI about this" deep link

Every feed card, message, note, sheet, and profile has a subtle `IconSpark` action. Tap → AI tab opens with the content pre-attached as context, keyboard up, ready to prompt.

### 7.7 Floating action button (FAB)

Bottom-right, rendered in `--sh-btn-primary-bg` with `--sh-btn-primary-shadow`, ~56dp diameter, 16dp from right edge and 16dp above the bottom tab bar.

Icon: `IconPlus`.

Tap → bottom sheet with five options:

- **New post** — composer over the feed.
- **New message** — contact picker, then DM.
- **Ask AI** — opens AI tab with keyboard up.
- **New note** — full-screen note editor.
- **New sheet** — template picker, then simplified mobile sheet editor.

### 7.8 Empty states

**Brand-new user, no follows, no courses, no school (most common for self-learners):**

- Top card: "Start here. StudyHub gets better the more you follow."
- Three tappable rows: `Find people in your topics`, `Follow 5 suggested learners`, `Browse popular sheets`.
- Below that, a trending-across-platform feed scoped by the user's onboarding-selected topics.

**User has school and courses but follows no one:**

- Triage band shows "3 classmates to follow" with one-tap follow buttons.
- Discovery band is top content from the user's courses.

**User has a full graph:**

- Normal feed, no empty-state UI.

### 7.9 Pull-to-refresh, scroll behavior, new-posts pill

- **Pull-to-refresh:** refetches the triage band first (small payload, fast), discovery lazy-loads underneath.
- **Top bar hides on scroll-down, reappears on scroll-up.** Status bar stays visible at all times.
- **Bottom tab bar is always visible.** Never hide it; orientation loss is the worst feed bug.
- **Virtualized scroll:** render 20 cards at a time, recycle DOM nodes outside the viewport.
- **New-posts pill:** if new content arrives while user is scrolling (via Socket.io feed-update event), a small centered pill appears at the top: `12 new posts`. Tap → scrolls to top and refetches.

### 7.10 Feed API contract

- `GET /api/feed/mobile?cursor=<id>&band=<triage|discovery>&limit=20`
- Response envelope: `{ items: [{ type, id, createdAt, author, payload }], nextCursor, hasMore }`.
- `type` is one of: `sheet`, `note`, `post`, `group_activity`, `announcement`, `milestone`, `poll`, `qa`.
- `payload` shape varies per type but each is normalized on the server so the mobile client has one render pipeline.
- Telemetry logged per fetch: request time, items returned, triage vs discovery split.
- Per-item telemetry emitted on view: `impression`, `dwell_ms`, `tap_through`, `react_type`.

### 7.11 Performance budget

- Time to first triage card: ≤ 500ms warm, ≤ 1.5s cold.
- Triage band payload: ≤ 10KB.
- Discovery page (20 cards): ≤ 100KB with thumbnails lazy-loaded.
- Pull-to-refresh latency: ≤ 800ms.
- Scroll frame rate: 60fps sustained on Pixel 6.

### 7.12 Mentions and hashtags

Both are first-class primitives in feed posts, comments, messages, notes, and Q&A answers.

- **Mentions (`@username`).** Typing `@` opens an autocomplete sheet above the composer showing, in order: users I follow, recent DM/group chat partners, users in my courses and study groups, then fuzzy-matched global results. Selecting one inserts a styled chip bound to the user id (not just the display name) so renames do not break old posts. Mentioned users get a push (`post.mention` or `comment.mention` event) and a feed-triage card. A user can mute mentions from a specific person via profile → `Mute mentions`.
- **Hashtags (`#topic`).** Typing `#` opens autocomplete of trending tags plus tags I have used before. Tapping a rendered tag opens a topic feed at `/tag/<slug>`. Hashtags are case-insensitive, slugged on the backend, Unicode-aware (supports non-Latin scripts), and capped at 32 chars each. Max 10 tags per post to prevent spam.
- **Search integration.** Global search treats `@alex` and `#calc2` as scoped queries and routes straight to the relevant profile or tag feed.
- **Backend.** New tables: `Mention (id, sourceType, sourceId, mentionedUserId, createdAt)` and `Hashtag (id, slug, displayText, createdAt)` with `PostHashtag` join. Fan-out writes happen inside the same transaction as the post create, so no orphaned mentions.

---

## 8. Messages Tab

Private, fast, low-friction.

### 8.1 Top bar

Left: title `Messages`.
Right: `IconSearch` → full-screen message search. `IconPen` (new message / pencil in square) → opens contact picker.

### 8.2 Conversation list

Flat list ordered by most recent activity. Each row:

- Avatar (user avatar for DMs, 2x2 avatar grid for group chats without a custom icon).
- Name in weight-600 text.
- Last message preview in `--sh-subtext`.
- Timestamp on the right (relative: `2m`, `1h`, `Yesterday`, `Mar 3`).
- Unread indicator: row stays in heading color (not muted), plus a `--sh-brand` dot on the right.
- Course/group pill if conversation is tied to a group.

Swipe interactions:

- **Swipe-left:** Mute (48h / 1 week / forever), Archive, Leave.
- **Swipe-right:** Mark read/unread, Pin.

Pinned conversations float above the main list with `IconPin` indicator.

### 8.3 Filter chips

Three chips below the top bar: `All`, `Unread`, `Groups`. Default `All`.

### 8.4 Empty state

Gentle illustration of a chat bubble (using `IconMessages` at large scale with `--sh-muted`), copy: `No messages yet. Start one with anyone who shares a course with you.`, primary button `Find people` → classmate-discovery screen.

### 8.5 Thread view

**Header (sticky, 56dp):** `IconArrowLeft` back, avatar, name, online dot (rendered with `--sh-success` when the user is connected via socket). Tap header → user profile (DM) or group info (group chat). Right side: `IconMoreHorizontal` → Mute, Block, Clear history, Report.

**Message list:** Bubbles, right-aligned for user, left for others. Grouped within 5-minute windows (avatar only on first message of each group). Day dividers (`Today`, `Yesterday`, `March 12`).

**Long-press a message:** Context menu with React, Reply, Copy, Ask AI (`IconSpark`), Edit (own messages, 15-min window), Delete (own messages only).

**Reactions:** Emoji reactions cluster below the message bubble. Tap to add/remove. Uses the existing `MessageReaction` table.

**Read receipts:** Small avatar of the other user next to the last message they have read. Uses `lastReadAt` timestamps.

**Typing indicator:** `Alex is typing...` in `--sh-muted` below the last message when `typing:start` arrives. Disappears on `typing:stop` or after 5s of no heartbeat.

### 8.6 Composer (bottom, sticky)

Layout, left to right:

- `IconPaperclip` — attachments (camera, photo library, file).
- Text input — grows up to 5 lines, then scrolls internally. Max 5000 characters (matches backend `MAX_MESSAGE_LENGTH`).
- When input is empty: `IconMic` (tap-and-hold to record a voice message).
- When input has content: Send button (`IconArrowRight` in a filled circle).

### 8.7 Voice messages (day-one feature)

**Recording UI:**

- Tap-and-hold `IconMic`. Composer expands to show a live waveform (rendered from Web Audio API `AnalyserNode`) plus timer and `IconX` cancel.
- Slide up during recording to cancel.
- Release to send.
- Max length: 5 minutes. At 4:45 a warning banner appears.

**Playback UI in the thread:**

- Waveform bar with play head.
- `IconPlay` / `IconPause` button.
- Speed toggle (1x, 1.5x, 2x).
- Duration label.
- "Transcribe" action in long-press menu (v1.5 polish — runs server-side speech-to-text and shows the transcript below the message).

**Backend:**

- Audio stored as `audio/webm` (Opus codec). Piped through the existing attachment pipeline.
- Transcripts generated server-side for moderation (always) and user display (on demand). Storage: `Message.voiceTranscript` text column.
- Server-side voice moderation: transcripts run through the existing text moderation classifier before the voice message is delivered. Flagged content is held pending admin review.

### 8.8 Group chats (ad-hoc, user-created)

Group chats are separate from StudyGroups. A group chat is just a `Conversation` row with `type = 'group'` and 2+ `ConversationParticipant` rows. It has no public page, no sessions, no resources, no discussion board.

**Creation flow (from the `IconPen` in the Messages top bar):**

- Contact picker opens. Searchable list of everyone the user has messaged, follows, shares a course with, or is in a group with.
- Single selection → 1-on-1 DM.
- Two or more selections → `Start` button changes to `Create group` → prompts for optional group name → creates the group and opens the thread.
- Default group name: first three members' names with a `...` overflow.
- Default group icon: 2x2 avatar grid of the first four members.

**Rules:**

- Only verified users can be added. Prevents unverified spam.
- Max group size: 50 members.
- Rate limit: 5 new groups per user per day.
- Blocked users cannot be added (block check runs bidirectionally on `addMember`).
- Creator is the default admin. Admins can rename, change icon, add/remove members, promote others, delete the group.
- By default any member can add members. The creator can flip a `Only admins can add members` toggle.
- Members can leave any time. Past messages stay with a `Former member` label.

**First-contact safety:**

- If someone who has never messaged the user adds them to a new group, the thread opens with a banner: `You were added to this group by [name]. Stay or leave?`
- Two one-tap actions in the banner: `Stay` (dismisses) and `Leave and block` (removes and blocks adder).

**Group info screen:** Members list, group name + icon edit (admin only), shared files section, leave group button.

### 8.9 Notifications behavior

- App closed → push notification via FCM. Title: sender name. Body: preview (120 chars). Tap: opens the thread.
- App open, user on a different tab → red dot + unread count badge on Messages tab in the bottom bar.
- App open, user on Messages tab in a different thread → updates the conversation list in real-time, subtle haptic.
- App open, user in the active thread → no notification, new message slides into the thread list with a subtle entrance animation.

Push de-duplication: if the user is actively using the web app (last heartbeat within 30s), the mobile push for that message is skipped.

### 8.10 Socket.io events consumed

From `backend/src/lib/socketEvents.js`:

- `message:new`
- `message:edit`
- `message:delete`
- `typing:start`
- `typing:stop`
- `conversation:join`
- `message:read`
- `reaction:add`
- `reaction:remove`

Frontend imports from `frontend/studyhub-app/src/lib/socketEvents.js` — no hardcoded event names.

### 8.11 Edge cases

- **Blocked user:** Past messages stay visible but greyed with "This user has been blocked." Reply is disabled. Unblock from thread header is one tap.
- **Deleted account:** User shows as `Deleted account` with a generic gray avatar. Thread reads work; no reply possible.
- **Unverified sender:** Cannot initiate DMs (soft gate from email verification plan). Can still receive. Their replies go through once verified.
- **Empty conversation (no messages):** List row shows `Draft — tap to start`.

### 8.12 Performance budget

- Conversation list load: ≤ 400ms warm.
- Thread open: ≤ 300ms (lazy-load older messages on scroll).
- Message send round-trip via socket: ≤ 150ms on decent network.
- Socket reconnect on network change: ≤ 2s.

---

## 9. AI Tab (Hub AI)

Fastest path from question to answer. Keyboard up on open.

### 9.1 Top bar

Left: `IconMoreHorizontal`-like history icon (three horizontal lines) → slides a panel from the left with conversation history. Rows: auto-generated title, timestamp, preview snippet. Swipe-left to delete.

Right: `IconPen` (new chat) and `IconMoreHorizontal` (settings → current model info, today's usage count, clear conversations).

### 9.2 New-chat default view

**Top half of screen:** Welcome card with centered Hub AI mark (rendered with `--sh-ai-gradient` background), heading `What do you want to work on?`, and four context-aware chip suggestions:

- If user has a current course context: `Explain today's [course name] lecture`
- If user has a recent note: `Summarize my [note title] note`
- If user has a recent sheet: `Turn my [sheet title] sheet into flashcards`
- Always shown: `Make me a study plan for this week`

Tap a chip → fills the composer (editable) → user can tweak or send.

**Bottom half:** Composer with keyboard up by default on tab open.

### 9.3 Active conversation

Thread bubbles, user right, AI left. AI bubble has a small Hub AI avatar and a model tag (`Claude Sonnet`) in `--sh-muted` below the message. Streaming tokens animate in character-by-character as SSE `delta` events arrive.

Inline actions on AI message (long-press or tap `IconMoreHorizontal`):

- Copy
- Regenerate
- Read aloud (v1.5 polish, browser TTS)
- Share (formats for paste into Messages, Notes, or the Feed)
- Pin to conversation (pinned messages collect at the top of the thread)

Code blocks: syntax-highlighted, horizontally scrollable, copy button top-right.

Math: rendered with KaTeX (existing dependency). Tap-to-zoom modal for complex equations.

### 9.4 Composer

- `IconImage` — upload from camera or library (reuses existing `AiImageUpload` backend flow).
- `IconPaperclip` — attach context (note, sheet, or course). Selected context appears as a chip above the input: `Using context: your Bio 101 note` with a tap-to-remove X.
- `IconMic` — voice input via Android's speech-to-text API. Text fills the input; user can tweak before sending.
- `Send` — disabled while empty. Shows `IconSpinner` during streaming.

### 9.5 Sheet generation

AI can generate full HTML study sheets (existing web feature). On mobile when the AI outputs a sheet:

- Inline preview card appears: sheet title, thumbnail of rendered HTML, `Open preview` and `Publish as my sheet` buttons.
- `Open preview` → full-screen HTML viewer with a `Publish` button at the bottom.
- `Publish as my sheet` → confirms course and title → runs through the same scan pipeline as web (`detectHtmlFeatures` → `classifyHtmlRisk`) → lands in the user's sheets.
- Tier 2 (admin review) or Tier 3 (quarantine) shows the same friendly message as web.

### 9.6 Rate limit UX

Usage chip under the top bar shows `7 / 30 today` when usage ≥ 50%, turns `--sh-warning` at 75%, `--sh-danger` at 100%.

At the limit:

- Composer disables.
- Friendly message: `Daily AI limit reached. Upgrade to Pro for 120/day, or come back at midnight.`
- "Upgrade to Pro" button → routes to the Pricing read-only view (see §15 Web Handoff).

### 9.7 Context awareness

The AI context builder (`backend/src/modules/ai/ai.context.js`) reads the user's courses, recent sheets, recent notes, and current page. On mobile, "current page" is the tab the user came from, passed as a header.

If the user lands in AI straight after reading a note, the AI opens with that note pre-attached as context (visible as a chip above the composer).

### 9.8 Cross-device continuity

`AiConversation` and `AiMessage` are server-side; both surfaces read from the same tables. Conversations started on mobile appear on web and vice-versa. Pinned messages, attached context, streaming state all persist.

### 9.9 Offline behavior

- Past conversations readable offline (cached via service worker in the WebView).
- Sending a new message requires network. Offline: composer shows `You are offline. Message will send when you reconnect.` and queues the send.

### 9.10 Performance budget

- Tab open to keyboard-up: ≤ 200ms.
- First token after send: ≤ 800ms on warm cache.
- Token render path is append-only — no whole-thread re-layout on each delta.
- Smooth 60fps streaming on Pixel 6.

---

## 10. Profile (You) Tab

Identity, progress, settings.

### 10.1 Top section — identity

- Banner image (user's chosen banner or a gradient built from tokens if none).
- Avatar overlapping the bottom-left of the banner.
- Display name.
- Username.
- Account type pill (`Student`, `Teacher`, `Self-learner`) with `IconShieldCheck` if verified staff.
- School + course count (student), topics count (self-learner), or "Courses I'm teaching" (teacher).
- Bio (2 lines, expandable).
- Three stat chips in a row: `Following`, `Followers`, `Stars received`. Tap each → full-screen list.
- `IconPen` top-right of banner → Edit Profile screen.

Below identity: `Share profile` button (uses Android native share sheet to share `studyhub.app/@username`).

### 10.2 Activity tabs (horizontal scroll if needed)

Default order for students and self-learners: `Sheets` / `Notes` / `Posts` / `Stars`. For teachers: `Sheets` / `Announcements` / `Notes` / `Posts`.

- **Sheets:** Grid. Each tile: thumbnail, title, star count, course tag. Tap → mobile sheet viewer. Long-press → quick actions (edit, fork, share, delete).
- **Notes:** List. Pinned notes at top with `IconPin`. Each row: title, first line, tags, timestamp.
- **Posts:** User's own feed posts using the same card format as Home.
- **Stars:** Content the user starred, sheets and notes mixed, newest first.
- **Announcements (teacher only):** List of announcements the teacher has posted.

### 10.3 Study groups section (collapsible)

Heading: `Your study groups`. Rows with group icon, name, member count, unread dot if there is new discussion activity. Tap → mobile study group view.

Bottom of section: `Create a study group (on web)` button. Tap → explanation sheet and a link that opens the in-app browser to the web creation page.

### 10.4 Courses / topics section (collapsible)

Students and teachers: `Your courses`. Rows: course code, course name, school. `Add a course` button → course search modal.

Self-learners: `Topics you are studying`. Topic chip picker instead of courses. `Add a topic` opens a topic chip sheet.

### 10.5 Progress section

Three tiles in a row:

- **Streak tile:** `IconFire` + number of consecutive study-active days. Low-pressure — no doom modal when a streak breaks, just quietly resets.
- **This week tile:** Counts — notes written, sheets published, questions answered, study sessions attended.
- **All time tile:** Stars received, followers, content shared.

### 10.6 Settings entry

Single row: `Settings` → full Settings screen (§11).

### 10.7 Verification nudge

If email is unverified, a persistent `--sh-warning-bg` card sits at the very top of Profile (above the banner): `Verify your email to unlock messaging and posting. Tap to resend.` Tap → resends the verification link and shows a confirmation toast.

### 10.8 Viewing another user's profile

Same layout, but:

- Edit Profile button replaced by three actions: `Follow` / `Following`, `Message`, `IconMoreHorizontal` (Block, Mute, Report, Share, Ask AI about this person — content only, not person).
- Settings section removed.
- Private-visibility sections respect `profileVisibility` setting.
- If the user has disabled DMs from strangers, `Message` button shows a disabled state with a tooltip explanation.

---

## 11. Settings

Full-screen list, grouped sections.

### 11.1 Account

- Email (with verified/unverified badge, resend link if unverified).
- Password (opens change-password flow).
- Connected accounts (Google OAuth).
- Two-factor authentication (TOTP setup).
- Verification status (email, staff).
- **Active sessions:** List of all active sessions across devices. Each row: device name, OS, browser or app, last active, IP region, current session indicator. Per-session `Sign out` button. Bottom `Sign out everywhere` button (keeps current session alive).
- Delete account (double-confirm + email confirmation + 7-day grace).

### 11.2 Appearance

- Theme: `System default` / `Light` / `Dark`.
- Font size: small / medium / large.
- Reduce motion toggle.
- High contrast toggle.

### 11.3 Notifications

Master toggle at the top.

Per-category toggles (each supports push / email / off):

- Messages (DMs and group chats)
- Feed activity (replies, comments, mentions)
- Stars and follows (opt-in, default off — too noisy)
- Study group activity
- Announcements
- AI usage alerts
- Email digests (daily / weekly / off)

Quiet hours section:

- Toggle (default on).
- Start time and end time pickers (default 10 PM – 7 AM user-local).
- "Allow urgent notifications during quiet hours" toggle (default on — only direct DMs from close contacts and study session starts bypass).

### 11.4 Privacy

- Profile visibility: `Public` / `Students at my school only` / `Followers only` / `Private`.
- Who can message me: `Anyone` / `People I follow` / `People in my courses` / `Nobody`.
- Who can add me to group chats: `Anyone verified` / `People I follow` / `Nobody`.
- Blocked users list.
- Muted users list.
- Analytics opt-out (PostHog and Sentry kill switch).
- Download my data (GDPR data export).
- Delete my account.

### 11.5 Content and feed

- Default feed filter: `Triage + discovery` / `Triage only` / `Chronological`.
- Sensitive content filter: `On` / `Off`.
- Language preference.
- Hide courses I am not in.

### 11.6 Subscription

- Current plan: Free or Pro (shown as a card with `--sh-brand-soft-bg` background).
- `Manage subscription` button. On mobile, tapping this opens the Stripe Customer Portal in an **external browser** (NOT the in-app sheet — see §15.2). Required by Google Play policy for subscription-management escape routes.
- Payment history list.
- Referral link and redeem code fields.

### 11.7 Security

- Biometric app lock toggle (opt-in, default off).
- App lock timeout (immediately / 1 min / 5 min / 15 min).
- Hide message previews in notifications toggle.
- Screen-capture protection for sensitive screens toggle (advanced).

### 11.8 Support

- Help center (opens in-app browser to web docs).
- Contact support.
- Report a bug.
- Suggest a feature.
- Rate StudyHub on Play Store.

### 11.9 About

- Version (semver + build number).
- Terms of service.
- Privacy policy.
- Open-source licenses.
- Acknowledgments.

### 11.10 Sign out

At the very bottom, rendered with `--sh-danger-text`. Tapping shows a confirmation sheet: `Sign out of StudyHub?` with `Sign out` and `Cancel` buttons.

---

## 12. Email Verification (Post-Signup)

Signup never blocks on email verification. Users land directly on Home and the verification is nudged over time.

### 12.1 Nudge surfaces

1. **Thin amber banner at the top of Home** (rendered with `--sh-warning-bg` and `--sh-warning-text`): `Verify your email to unlock messaging, posting, and profile following. [Resend link]`. Dismissible per session; reappears on next app open until verified.
2. **Red dot on Profile tab** in the bottom bar until verified.
3. **`Verify email` row at the top of Profile screen** (see §10.7).
4. **Day-2 full-screen nudge** on second app open after signup: `Quick thing — verify your email so we know it is really you. Takes 10 seconds.`

### 12.2 Soft limits for unverified users

Until verified, the following actions are blocked with a friendly modal explaining why:

- Posting to the feed.
- Sending DMs.
- Creating group chats.
- Publishing a sheet.
- Creating public notes.

Allowed:

- Reading, scrolling, reacting, starring, following.
- AI chat with a reduced cap (5 messages/day vs normal 30 for free users).
- Joining study groups (but not creating them — that's a web action anyway).

### 12.3 Hard cutoff

Day 14 unverified: full-screen wall on app open. `Verify to continue using StudyHub.` User can still read existing conversations but cannot navigate elsewhere or send anything. Once verified, walls drop immediately.

### 12.4 Backend

Reuses existing `EmailVerification` tables and token logic. Mobile adds:

- Resend rate limit UI.
- Deep link from the verification email: `studyhub.app/verify?token=...` routes through Android App Links to the native app if installed.

---

## 13. Role-Based Flows (Student, Teacher, Self-learner)

### 13.1 Student

- Signup collects school and at least one course (skippable).
- Sidebar / profile shows school and course list.
- Feed includes content from their courses and followed classmates.
- Gets course-specific triage signals (new notes in a course, replies to comments in a course).
- Can join study groups linked to their courses.

### 13.2 Teacher

- Signup collects school and courses they teach.
- "My Teaching" section in Profile with links to `My materials` and `Courses I am teaching`.
- Activity tabs reorder to `Sheets / Announcements / Notes / Posts`.
- `IconShieldCheck` next to name if staff-verified.
- Can create announcements with optional course-scope.
- Bypasses email-verification soft limits for posting announcements (but still has the email-verification nudges).

### 13.3 Self-learner

- Signup skips school and course pickers.
- `Topics you are studying` replaces `Your courses`.
- Feed starts with platform-wide trending content filtered to onboarding-selected topics, plus recommended people to follow.
- `Find classmates` CTAs are replaced with `Find learners in your topic`.
- Onboarding screen 2 uses the topic-picker variant.
- Everywhere the word "Other" might have appeared, the UI uses `Self-learner`.

---

## 14. Offline Mode

Philosophy: read works offline, writes queue. The user should never hit a blank screen because their connection dropped.

### 14.1 What works offline

- Home feed: last 50 cards per band (triage + discovery), images lazy-cached.
- Messages: conversation list plus last 50 messages per recently-opened thread.
- AI: past conversations fully readable. New sends queued.
- Notes: recently viewed + own notes always available.
- Sheets: recently viewed + own sheets cached as static HTML. Own sheets always available.
- Study groups: recently opened groups cached.
- Profile: own profile always cached.

### 14.2 What queues and syncs on reconnect

- Outgoing DMs and group chat messages (visible in thread with `IconClock`, flips to `IconCheck` on reconnect).
- Outgoing feed posts.
- Reactions (optimistic — shown immediately, reconciled on reconnect).
- Read states (batched and flushed).
- Draft notes (local autosave every 3 seconds).
- Draft AI messages (saved locally to conversation, sent when online).

### 14.3 What shows an offline card

- Search (needs live query).
- Discovering new users or content never loaded.
- Publishing a sheet (scan pipeline needs server).
- Creating a new study group invite.
- Joining Stripe Checkout (the external browser handles this).
- Google OAuth / password reset / email verification resend.

### 14.4 Connection state indicator

Thin strip under the top bar:

- `--sh-success-bg` with `Connected` — fades after 2s on initial connect.
- `--sh-warning-bg` with `Reconnecting...` — network glitch.
- `--sh-danger-bg` with `Offline — changes queued`.

Tap the strip → sheet listing queued items with counts.

### 14.5 Storage budget

- IndexedDB via the WebView, cap ~100MB.
- LRU eviction of oldest-viewed content when over cap.
- `Clear cache` button in Settings → Appearance.

### 14.6 Data saver mode

Protects users on metered, slow, or international data plans.

- Auto-detected via `navigator.connection.saveData` and `effectiveType` (`2g`, `slow-2g`). Auto-on for these networks; user can override in Settings → Content and feed → `Data saver`.
- When on: images capped at 480px long-edge, served as WebP from the CDN with a `?q=50` transform. Thumbnails only until tap. Video autoplay disabled. Voice message waveforms load but audio streams on-demand. Feed pagination drops to 10 cards per page.
- Visible indicator: a small `Data saver on` pill below the top bar, tappable to toggle off for the session.
- Prefetching (sidebar hover warmups on web, visible-card prefetch on mobile) is disabled.
- Push payloads stay lightweight by default regardless of data saver (see §16), so nothing changes there.

---

## 15. Web Handoff

Rule: Never kick to external Chrome for first-party content. Exception: payment flows, per Google Play policy.

### 15.1 In-app browser sheet (default)

Used for most web handoffs. Capacitor's `@capacitor/browser` opens a branded bottom sheet:

- Top bar: close `IconX`, page title, StudyHub S mark.
- URL not shown (reduces phishing surface, cleaner feel).
- Session cookie is shared automatically (same domain, same cookie jar).
- Bottom has an `Open in Chrome` escape hatch.

Used for:

- Study group creation (`/groups/new`).
- Long-form sheet editing.
- Admin tools (`/admin`).
- Rich-format announcement authoring (teacher).
- Legal pages, help center articles.

Return behavior: when the user completes the web action, the web page posts a message back to the native app via the Capacitor bridge. The app closes the sheet and refreshes the relevant mobile view.

### 15.2 External browser (required for payments)

Per Google Play policy, any subscription purchase or cancellation escape route on Android MUST open in an external browser, not in-app. The app is in **consumption-only mode** — subscription purchases happen exclusively on the web.

Affected flows:

- **Pricing page on mobile is read-only.** Users see Free and Pro plans with feature comparisons. The `Upgrade to Pro` button shows a sheet: `To upgrade, open StudyHub in your browser. Your account will be ready.` Primary button: `Open in browser`. Tap → `Intent.ACTION_VIEW` to `studyhub.app/pricing?from=android` in the system browser (Chrome or user's default).
- **Stripe Customer Portal** (Manage subscription) opens in external browser the same way.
- **Donation flows** open in external browser.
- **Gift subscription purchases** open in external browser.

### 15.3 Seamless hand-back

When the user upgrades on the web, the mobile app learns about it via a backend sync on next app open:

- Subscription status polls on every app foreground via `GET /api/payments/me/subscription`.
- A welcome banner appears in Home: `Welcome to Pro! Enjoy higher AI limits and more.`

### 15.4 Deep linking from external sites

Android App Links with a verified digital asset link for `studyhub.app`:

- `studyhub.app/@username` → Profile.
- `studyhub.app/sheets/<id>` → Sheet viewer.
- `studyhub.app/notes/<id>` → Note viewer.
- `studyhub.app/groups/<id>` → Study group.
- `studyhub.app/messages?dm=<userId>` → Messages with DM auto-start.
- `studyhub.app/verify?token=...` → Email verification complete screen.
- `studyhub.app/login` and other auth pages stay on web (too much friction to deep link).

### 15.5 Deep-link arrival onboarding

What happens when someone taps a shared StudyHub link but the app is not installed.

- **Mobile web (no app).** The destination page renders normally, but a Smart App Banner pins to the top: `Open in StudyHub app` with `Install` on one side and `Continue in browser` on the other. Dismissable with a 7-day cooldown per device. No dark patterns.
- **After install.** We use the Google Play Install Referrer API to capture the original URL so the first launch routes straight to the shared sheet/note/profile instead of the onboarding wizard. First-launch banner: `You came here to read <content title>. Resuming in a moment.` with a Skip control.
- **Expired or missing referrer.** Fall back to the standard onboarding. Do not surprise the user by dropping them into a random deep link hours later.
- **Signed-out deep links.** If the tapped link needs auth (e.g., a private group), we store the intended path, run login/signup, then route to the saved path on success.

---

## 16. Push Notifications

### 16.1 Events that send a push (default on)

- New DM or group chat message (unless muted).
- Mention in feed post, comment, or group discussion.
- Reply to feed post or Q&A answer.
- Follow-back from someone the user follows.
- Accepted answer on the user's Q&A question.
- Study group session starting in 15 minutes (if RSVPed).
- Study group announcement posted.
- Gift subscription received.
- Email verification reminders (day 3, day 10, day 13).

### 16.2 Events that do NOT send a push (default off; opt-in)

- New star on sheet or note (too noisy for active creators).
- New follower (too noisy for popular users).
- AI usage warnings (in-app chip is enough).
- Marketing announcements (email only).
- Feed algorithmic recommendations (never).

### 16.3 Throttling

- Per-conversation cap: 5+ messages in 2 minutes → collapsed push (`Alex sent 5 messages`).
- Per-user cap across all event types: 8 pushes in 10 minutes. Additional events accumulate silently as an in-app badge.
- FCM collapse key per message-thread — locked phone never shows 14 pushes from one DM.
- Cross-device de-dupe: if web user is active (heartbeat within 30s), mobile push is skipped for that event.

### 16.4 Quiet hours

Default: 10 PM – 7 AM user-local. During quiet hours pushes are silenced (no sound, no vibration) but still deliver to the tray. Urgent exceptions (close-contact DMs, session-starts) bypass if the user has that toggle on.

### 16.5 Deep linking

Every push includes a `data.route` field. Tap → app opens and navigates to the route.

- Message push → Messages tab, specific thread, scroll to message.
- Feed activity push → Home tab, specific post with comments expanded.
- Study group push → Group page, specific tab.
- AI verification nudge push → Profile tab, verify-email section.

Cold start behavior: app boots, finishes auth, then routes. Brief loading state if needed.

### 16.6 Permission handling

Android 13+ requires explicit notification permission. Onboarding screen 3 asks once. If denied, we do not nag. Settings → Notifications has a link that deep-links to the system settings page for StudyHub.

---

## 17. Android-Specific Integrations

### 17.1 App shortcuts (long-press launcher)

Four shortcuts in `shortcuts.xml`:

- `New note`
- `Ask AI`
- `Messages`
- `Open feed`

Each routes into the app at the right screen. One-tap from the home screen.

### 17.2 Android share sheet

**Outgoing (share from StudyHub):** Every sheet, note, feed post, and profile has a share action using Android's native share sheet intent. User picks Messenger / SMS / email / WhatsApp / etc.

**Incoming (share to StudyHub):** Register StudyHub as a share target in `AndroidManifest.xml` for `text/plain`, `image/*`, and URLs. User sharing from Chrome → StudyHub appears as a target → opens with a quick-action sheet: `Ask AI about this`, `Save as note`, `Post to feed`.

### 17.3 Home screen widgets (v1.1, not wave-1)

- Streak widget.
- Ask AI widget (tap → AI tab with keyboard up).
- Unread count widget.
- Top feed item widget.

Deferred to post-beta but architecture should not block them.

### 17.4 Focus mode / study timer (v1.1)

Pomodoro timer built into the app. Duration picker, app locks feed and messages during focus (notifications silenced, Home tab shows a focus-active state), subtle chime at end, session logs as a streak point. Integrates with Android's Do Not Disturb API.

### 17.5 Clipboard for invite links

When a user follows a `/invite/<code>` link, or when someone pastes `studyhub.app/invite/...` in the app, we detect and offer one-tap join. No invasive clipboard monitoring — only triggered by the user arriving at the app with an unseen clipboard invite on first launch.

### 17.6 Permissions choreography

Android runtime permissions are always requested contextually — never upfront, never pre-emptively.

| Permission     | Asked when                                                                                                                                                                                                  | Rationale copy                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Camera         | First time the user taps `Take photo` in the composer                                                                                                                                                       | `StudyHub uses the camera so you can snap a photo of your notes.`                       |
| Microphone     | First time the user holds the voice-message button                                                                                                                                                          | `StudyHub uses the microphone for voice messages.`                                      |
| Photos / Media | First time the user taps `Add from gallery`                                                                                                                                                                 | `StudyHub can attach photos and PDFs from your gallery.`                                |
| Contacts       | Only if the user taps `Find friends` in Profile. SHA-256 hashed client-side before leaving the device. Server never sees plaintext phone numbers or emails. Hash match returns only already-StudyHub users. | `Match your contacts to friends on StudyHub. Your phone book never leaves your device.` |
| Location       | Not requested in v1.                                                                                                                                                                                        |                                                                                         |
| Calendar       | Only when the user taps `Add session to calendar` on a group session card                                                                                                                                   | `Add this session to your calendar.`                                                    |
| Notifications  | Asked on Day 1 via the Onboarding Screen 3 soft prompt (§6.3), then the OS prompt only if the user opts in                                                                                                  | (reuses onboarding copy)                                                                |

If a user denies a permission, the corresponding action shows an inline empty-state with a `Fix in Settings` link that opens the app's OS permission page. We never loop the system prompt.

### 17.7 Referrals and invite flow

A lightweight loop that lets happy users share StudyHub without feeling pressured.

- **Profile card.** `Invite friends` row opens a sheet with the user's personal referral code and a `Share` button that calls the native Android share sheet (`@capacitor/share`). Message copy is editable: `Come study with me on StudyHub — {link}`. Link format: `https://studyhub.app/invite/<code>`.
- **Reward.** A successful install + email verification by the invitee credits both parties with 30 days of Pro features or, if the inviter is already Pro, a bump to the weekly AI message cap. Capped at 10 rewarded invites per user per quarter.
- **Attribution.** Play Install Referrer API captures the invite code at install. On signup, if a matching code is present, we write an `InviteRedemption` row. Reward fires on first email verification. Anti-abuse: same-device reinstalls, disposable email domains, and verified-school mismatch all disqualify.
- **Opt-in leaderboard.** A `Top inviters` card on the Supporters page (already exists for Pro). Participation is opt-in in Settings → Privacy.
- **No forced permissions.** We never scan contacts to send invites on the user's behalf.

---

## 18. Academic Integrity and AI Policy

The AI's system prompt (see `backend/src/modules/ai/ai.constants.js`) includes a mobile-aware section:

- Never write complete essays or answers to graded assignments.
- Help the student think through problems; offer approaches, partial steps, and follow-up questions rather than verbatim solutions.
- Decline requests that obviously describe a graded assignment submission ("write my 5-page paper on..."). Offer to help plan, outline, or discuss the topic instead.
- Log but do not reject borderline queries. Usage telemetry feeds into future system-prompt tuning.

---

## 19. Wellness and Crisis Resources

If a user posts or messages content signaling self-harm or a mental health crisis (detected via a lightweight keyword + sentiment signal, erring toward showing too often rather than missing):

- Surface a gentle modal with crisis resources (988 Suicide & Crisis Lifeline in the US, local equivalents elsewhere based on device locale).
- Modal copy is caring, not alarmist: `It looks like you might be going through something hard. Help is available.`
- Primary button: `Call 988` (or local equivalent). Secondary: `Text HOME to 741741` (Crisis Text Line). Tertiary: `Dismiss`.
- Never forced. No content is blocked — we just surface resources.
- If a user posts something in a public surface (feed, comments) that triggers the detector, moderators are also notified so they can reach out privately if appropriate.

### 19.1 Moderation appeals

Every enforcement action (warning, post takedown, account suspension, ban) must be appealable.

- On the affected surface, instead of a silent failure or a dead-end error, the user sees a branded `Account suspended` or `Post removed` screen with the reason, the policy section that was cited, and a `Submit appeal` button.
- Appeal form: single free-text field (max 2000 chars), optional attachment, and a submit button. No drop-downs to guess at.
- Backend: `Appeal` table with `(id, userId, actionId, body, attachmentKey?, status, reviewerId?, reviewNotes?, createdAt, resolvedAt)`. Status enum: `pending`, `upheld`, `overturned`.
- SLA: 5 business days to a human decision. Automated acknowledgement at submit. Result email + in-app notification at resolution.
- If overturned, the original action is fully reversed (content restored, strike count decremented).
- Rate limit: 1 appeal per action, 5 appeals per user per month to prevent flooding.

### 19.2 In-app feedback and bug reports

Lower the cost of telling us something is broken.

- **Entry points.** Settings → Support → `Report a bug` and Profile → three-dot menu → `Send feedback`.
- **Sheet contents.** Category chip (`Bug`, `Idea`, `Praise`, `Other`), free-text field, optional screenshot attachment (auto-captured from the last visible screen, with message content auto-redacted), and an opt-in checkbox to include anonymized device/app info (Android version, app build, locale, network type).
- **Shake-to-report.** Internal and beta cohort only (feature-flagged off for general release). Shaking the device opens the bug report sheet pre-populated with the screenshot and device info.
- **Backend.** `FeedbackReport` table. Reports route to an internal triage queue in admin. Noisy users (>20 reports/week) are rate-limited to 1/day.
- **No auto-open of a third-party client.** Everything stays in-app, no mailto: that requires the user to own a configured email app.

---

## 20. Localization

Ship beta in English only. Architect for i18n so adding languages later is a translation task, not an engineering task.

- All user-facing strings live in `frontend/studyhub-app/src/i18n/en.json` (new file). Existing hardcoded strings are extracted during wave 2–3.
- Runtime library: `i18next` with lazy-loaded locale bundles.
- First-wave post-beta target languages: Spanish, Simplified Chinese, Hindi, French.
- RTL support plumbing (Arabic, Hebrew) added in v1.1.
- Play Store listing localized for each supported language.

---

## 21. Feature Flags and Remote Kill Switch

- Backend endpoint: `GET /api/flags` returns a JSON map of flag keys to booleans, scoped per user.
- Mobile polls on startup and on every foreground.
- Flags are granular — we can kill a single post type, a single rendering path, or an entire tab without shipping a new APK.
- Minimum-supported-client-version flag: if installed version < backend's minimum, the app shows a blocking `Update StudyHub` modal with a Play Store link. Prevents old clients from calling deprecated endpoints.

---

## 22. Analytics and Telemetry

### 22.1 What we track

- Screen views and tab navigation.
- Engagement events: posts, reactions, stars, follows, messages sent — aggregate counts only.
- AI messages sent and daily usage.
- Errors (via Sentry).
- Crash-free sessions rate.
- Cold and warm startup times.
- Feed fetch timings.

### 22.2 What we never track

- DM content. Not logged, not sampled, not sent anywhere except Socket.io to the recipient and Postgres storage.
- Note and sheet content.
- AI prompt or response content (other than the user-owned copy stored in `AiConversation`).
- Voice message audio or transcripts beyond server-side moderation classification.
- Device identifiers beyond the minimum needed for push notifications.

### 22.3 User control

Settings → Privacy → `Analytics opt-out` toggle. When on, PostHog and Sentry are disabled entirely for that user.

---

## 23. Backend Changes Required for Mobile

Net-new or modified endpoints:

- `GET /api/feed/mobile` — mobile-ranked triage + discovery feed (new).
- `GET /api/flags` — feature flags with minimum-supported-version (new).
- `POST /api/device-tokens` — register FCM token (new).
- `DELETE /api/device-tokens/:id` — unregister on sign-out.
- `GET /api/drafts/:type/:key` — load draft.
- `POST /api/drafts/:type/:key` — save draft (autosave).
- `DELETE /api/drafts/:type/:key` — delete draft after send.
- `GET /api/auth/sessions` — list active sessions across devices.
- `DELETE /api/auth/sessions/:id` — revoke specific session.
- `GET /api/polls/:id` — get poll + results (new if not already built for web polls).
- `POST /api/polls/:id/vote` — cast vote.
- `POST /api/qa/:postId/accept` — asker accepts an answer.

Net-new Prisma models (with migrations):

- `DeviceToken` — `userId`, `token`, `platform`, `createdAt`, `lastUsedAt`, `deviceName`.
- `Draft` — `userId`, `draftType`, `draftKey`, `body`, `updatedAt`.
- `Poll` — `postId`, `question`, `options` (JSON), `expiresAt`.
- `PollVote` — `pollId`, `userId`, `optionIndex`.
- `QuestionPost` extension on `FeedPost` — `acceptedAnswerId` nullable.
- `SecurityEvent` — `userId`, `eventType`, `ipAddress`, `userAgent`, `createdAt` (for suspicious-activity detection, see `mobile-security.md`).

Every new model MUST have a corresponding migration file in `backend/prisma/migrations/` per `CLAUDE.md` migration rules.

---

## 24. Mobile File Organization (Frontend)

New directory layout under `frontend/studyhub-app/src/`:

```
src/
  mobile/
    App.mobile.jsx              # Mobile root component
    shell/
      BottomTabBar.jsx
      MobileTopBar.jsx
      OfflineStrip.jsx
      InAppBrowserSheet.jsx
    landing/
      MobileLandingPage.jsx
      SignupBottomSheet.jsx
      SigninBottomSheet.jsx
    onboarding/
      OnboardingStep1.jsx
      OnboardingStep2.jsx
      OnboardingStep3.jsx
      WelcomeSplash.jsx
    home/
      MobileHomePage.jsx
      TriageBand.jsx
      DiscoveryFeed.jsx
      FabMenu.jsx
      cards/
        SheetCard.jsx
        NoteCard.jsx
        FeedPostCard.jsx
        GroupActivityCard.jsx
        AnnouncementCard.jsx
        MilestoneCard.jsx
        PollCard.jsx
        QaCard.jsx
    messages/
      MobileMessagesPage.jsx
      ConversationList.jsx
      ThreadView.jsx
      Composer.jsx
      VoiceRecorder.jsx
      VoicePlayer.jsx
      GroupCreateFlow.jsx
    ai/
      MobileAiPage.jsx
      AiConversationPanel.jsx
      AiThreadView.jsx
      AiComposer.jsx
      AiContextChips.jsx
    profile/
      MobileProfilePage.jsx
      ActivityTabs.jsx
      ProgressTiles.jsx
      SettingsList.jsx
      settings/
        AccountSettings.jsx
        AppearanceSettings.jsx
        NotificationSettings.jsx
        PrivacySettings.jsx
        SecuritySettings.jsx
        SubscriptionSettings.jsx
        SupportSettings.jsx
        AboutSettings.jsx
    search/
      MobileSearchPage.jsx
    notifications/
      NotificationsPanel.jsx
    shared/
      MobileModal.jsx
      MobileSheet.jsx
      MobilePill.jsx
      MobileButton.jsx
      MobileInput.jsx
  lib/
    mobile/
      detectMobile.js            # Capacitor detection helper
      capacitorBridge.js         # Wrapper around Capacitor plugins
      useBiometric.js
      usePush.js
      useDeviceTheme.js
      useOfflineQueue.js
      useShareSheet.js
      useInAppBrowser.js
```

Mobile routing uses `React Router 7`:

- A top-level mobile detector in `App.jsx` (already exists) checks `Capacitor.isNativePlatform()` and routes to `App.mobile.jsx` if true.
- Mobile routes mirror web routes where useful: `/`, `/home`, `/messages`, `/ai`, `/profile`, `/search`, `/settings/*`.
- Some web routes are not available on mobile (`/admin`, `/groups/new`, `/sheets/:id/edit`); tapping links to those opens the in-app browser sheet.

---

## 25. What is intentionally NOT in the mobile app

Clarity on scope:

- In-app Stripe checkout (external browser only, per §15.2).
- Study group creation (web only).
- Admin dashboard (web only).
- Full rich-format announcement authoring (web only; mobile supports simple-text announcements).
- Full sheet editor (mobile has a simplified version for AI-generated sheets; heavy editing stays on web).
- Video calls / live study rooms (v1.2).
- Home screen widgets (v1.1).
- Focus mode (v1.1).
- Study partner matching algorithm (v1.2).
- Live-typing collaborative editing (v1.3+).

---

## 26. Open Questions for Future Decisions

- **Gamification pressure.** Streaks are motivating for some users and stress-inducing for others. We launch with silent-reset streaks. If retention data shows streak anxiety, we add an "ignore streaks" toggle in Settings.
- **Paid-plan floor for mobile signups.** Should brand-new mobile users see the Pro plan at all on day one, or should we hide it for the first week? Lean toward showing it (revenue matters) but revisit based on retention data.
- **Teacher marketplace for sheets.** Long-tail feature; would let teachers monetize premium study sheets with revenue share. Out of scope for v1 but worth considering in roadmap.
- **Study-partner matching.** Fit for self-learners who have no existing circle. v1.2 feature.
- **Live study rooms.** Voice-first study rooms with a shared "what I'm working on" status. Expensive to build (WebRTC infra). v1.3+ at earliest.

---

## 27. Acceptance Criteria for v1 Beta

The app is ready for closed beta when:

- Landing page renders correctly in both themes, both orientations, and all densities.
- Signup and sign-in work end-to-end for email/password and Google OAuth.
- All four tabs render and navigate correctly.
- Feed loads triage and discovery bands with all eight post types.
- Messages tab supports DMs and group chats including voice messages.
- AI tab supports text conversations, image upload, sheet generation, and context chips.
- Profile tab renders activity tabs, study groups, progress tiles, and settings.
- Settings tab covers all sections in §11.
- Push notifications deliver reliably for the six default-on event types.
- Offline mode works for reading and queues writes.
- In-app browser sheet opens for web handoff; external browser opens for payments.
- Email verification nudge flow works and soft-limits unverified users correctly.
- Account type picker offers `Student`, `Teacher`, `Self-learner` and everywhere shows "Self-learner" (both web and mobile).
- Draft sync works between mobile and web for all four draft types.
- Data sync across devices works without conflict.
- Crash-free sessions rate ≥ 99% in internal testing on Pixel 6 + Pixel 7.
- First triage card renders in ≤ 500ms warm, ≤ 1.5s cold.
- No hardcoded colors in any mobile component — every color comes from `--sh-*` tokens.
- No emojis used as icons anywhere. Every icon is a `Icon*` export from `Icons.jsx`.
- Security posture in `docs/mobile-security.md` is verified.
- Build plan gates in `docs/mobile-build-plan.md` are met.

---

End of product plan.
