# StudyHub — Public Launch & README Glow-Up Plan

> Source of truth for flipping the repo public and shipping a polished README. Reflects the **actual** state of the codebase as of v2.2.0 (2026-04-30).

---

## 0. What we're trying to do

Take StudyHub from a private repo to a polished public open-source project that signals "this is a real, finished product." The plan has six parts:

1. **Pre-flight** — make sure the repo is safe to be public.
2. **Branding** — logo, tagline, badges.
3. **Screenshots** — exactly which pages to capture.
4. **GIFs** — exactly which flows to record.
5. **README** — the section-by-section template.
6. **Flip to public** + tell the world.

---

## 1. Pre-flight

### 1.1 What's already done (no action needed)

The repo currently has all of the following — **don't recreate them**:

- `LICENSE` (MIT)
- `CONTRIBUTING.md` (~200 lines, fork/PR workflow)
- `CODE_OF_CONDUCT.md` (Contributor Covenant)
- `SECURITY.md` (vulnerability reporting + scope)
- `PRIVACY.md` (added 2026-04-30 — third-party processors, retention, user rights)
- `backend/.env.example` (172 lines, every env var documented)
- `frontend/studyhub-app/.env.example` (sectioned, every `VITE_*` documented)
- `.gitignore` covering `.env`, `node_modules/`, `dist/`, `build/`, `.DS_Store`, etc.
- JavaScript-only codebase (TypeScript was tried briefly on 2026-04-30 and reverted same day; runtime cost without a transpiler outweighed the static-analysis benefit)
- All 6 OWASP HTTP headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy always-on; HSTS production-only by design — sending HSTS over HTTP would be self-defeating)
- Helmet middleware + strict CSP
- ClamAV antivirus enforcement in production
- 49+ rate limiters
- `FIELD_ENCRYPTION_KEY` enforced at startup
- SSRF allowlist (`backend/src/lib/ssrfGuard.js`) ready for Scholar tier

### 1.2 What still needs to happen before flipping public

- [ ] **Run gitleaks against history** — `gitleaks detect --source . --no-banner`. Even though current files are clean, a historical commit might have leaked a key. If gitleaks finds a still-valid secret, **rotate it on the provider's site immediately**.
- [ ] **Run trufflehog as a second opinion** — `trufflehog filesystem .`.
- [ ] **Scan tracked files for live keys** — `git grep -i "sk_live_\|sk-ant-\|whsec_\|AKIA" -- ":!**/node_modules/**"`. Should return nothing.
- [ ] **Confirm GitHub repo settings** — `Issues` and `Discussions` enabled, branch protection on `main`, `Allow squash merging` only.

---

## 2. Branding pass

### 2.1 Wordmark / logo

Use Canva (free) — same approach as OpenStudy's serif wordmark:

1. New 1200×400 PNG, transparent background.
2. Text: `StudyHub`, ~200pt, color `#0F172A` (matches `--sh-slate-900`).
3. Font candidates (free in Canva):
   - **Plus Jakarta Sans** — same as the in-app UI font (best continuity)
   - **Cormorant Garamond** — elegant serif
   - **Fraunces** — modern serif with character
4. Optional: small icon to the left (open book, graduation cap, folded sheet).
5. Export `studyhub-wordmark.png` (transparent) and `studyhub-wordmark-dark.png` (dark variant for dark-mode README rendering).
6. Save both to `docs/media/`.

### 2.2 Color + voice

Use the existing token palette in `frontend/studyhub-app/src/index.css`. Pick `--sh-brand: #2563eb` (light) / `#60a5fa` (dark) as the primary accent for any decorative element in the README.

### 2.3 Tagline

Pick one (and use the same one in About page hero, GitHub About description, social preview, and HN title):

- "A GitHub for college study sheets — fork, improve, contribute back."
- "Open-source collaborative study platform for college students."
- "Share, fork, and improve study sheets with your classmates."

### 2.4 Badge row (shields.io)

```markdown
![license](https://img.shields.io/badge/license-MIT-blue)
![version](https://img.shields.io/badge/version-v2.2.0-success)
![stack](https://img.shields.io/badge/stack-Express%205%20%2B%20React%2019-black)
![language](https://img.shields.io/badge/language-JavaScript-f7df1e)
![db](https://img.shields.io/badge/db-Postgres%20%2B%20Prisma%206-336791)
![ai](https://img.shields.io/badge/AI-Claude%20Sonnet%204-orange)
![realtime](https://img.shields.io/badge/realtime-Socket.io%204-010101)
![status](https://img.shields.io/badge/status-beta-yellow)
```

---

## 3. Screenshots — exact list

Six screenshots, one per major surface. Same chrome on all six.

### 3.1 Capture settings

- **Browser:** Chrome, fresh incognito window.
- **Window size:** 1440×900 (PowerToys FancyZones helps).
- **Zoom:** 100%.
- **DevTools:** closed.
- **Theme:** light mode for v1; dark-mode set later if time.
- **Account:** log in as a beta user with a real-looking name + avatar (not "test test test").
- **Seed data:** `cd backend && npm run seed:beta`. As of v2.2.0 this seeds:
  - 5 beta users (1 owner, 1 admin, 3 students)
  - Course enrollments + announcements + sheets per course
  - **Creator-audit consent rows** (so the modal does NOT fire on first publish during the demo — delete one row manually if you want to capture the modal screenshot)
  - Upcoming exams, AI suggestions, sheets-grid fixture
  - All shipped feature flags

### 3.2 The six screenshots

1. **`01-feed.png`** — `/feed` (the actual authenticated landing page; there is no `/dashboard`).
2. **`02-sheets-browse.png`** — `/sheets` with grid view + filters visible.
3. **`03-sheet-detail.png`** — `/sheets/:id` — pick a sheet whose content looks rich (formulas, headings, color-coded sections).
4. **`04-ai.png`** — `/ai` with a conversation in progress and a sheet preview pending publish.
5. **`05-messages.png`** — `/messages` with a real conversation and ideally a typing indicator.
6. **`06-study-group.png`** — `/study-groups/:id` with members + a session + resources + discussion.

**Optional extras:**

- `07-notifications.png` — `/notifications` showing the new full-page view with type filter chips.
- `08-creator-audit.png` — the consent modal (delete the seed consent row first to make it appear).
- `09-profile.png` — `/users/:username`.
- `10-pricing.png` — `/pricing`.
- `11-mobile.png` — `01-feed` resized to 390×844 to demonstrate responsiveness.

### 3.3 Capture tools

- **Built-in:** `Win + Shift + S` → "Rectangular snip".
- **Better:** ShareX (https://getsharex.com) for repeatable pixel-exact regions.

### 3.4 Post-process

Open each PNG in any editor and:

- Crop the OS taskbar / browser tabs.
- Make sure all six are the same exact size (1440×900 or 1600×1000).
- Optional: 1px border in `--sh-slate-300` (`#CBD5E1`) for visual unity.
- Run through https://tinypng.com — typically cuts size 50–70% with no visible quality loss.

### 3.5 Where to put them

`docs/media/` holds everything README references:

```
docs/media/
  studyhub-wordmark.png
  studyhub-wordmark-dark.png
  01-feed.png
  02-sheets-browse.png
  03-sheet-detail.png
  04-ai.png
  05-messages.png
  06-study-group.png
  07-notifications.png        ← new in v2.2.0
  08-creator-audit.png        ← new in v2.2.0
  demo-fork.gif
  demo-ai.gif
```

In the README, reference with relative paths: `![](docs/media/01-feed.png)`.

---

## 4. GIFs — exact list

### 4.1 Which to make

**Two, max three.** More than that and the README gets heavy.

#### Priority 1 — `demo-ai.gif` — Hub AI generating a sheet (15–25s)

1. Start on `/ai` with an empty conversation.
2. Type: "Make me a study sheet on the Krebs cycle."
3. Watch the streaming response.
4. Hit "Preview" → preview panel opens.
5. Hit "Publish".
6. End on the published sheet.

#### Priority 2 — `demo-fork.gif` — The fork-and-contribute flow (15–25s)

1. Start on `/sheets`.
2. Click into a sheet.
3. Click "Fork".
4. Make a small edit in the lab editor.
5. Hit "Save" → "Submit contribution".
6. End on the contribution review screen.
7. **Make sure the plagiarism notification does NOT fire** (v2.2.0 fix — fork lineage is excluded from similarity scans).

#### Optional Priority 3 — `demo-notifications.gif` — Real-time push (10–15s)

1. Open `/feed` in window A as user 1.
2. Open `/notifications` in window B as user 2.
3. In A, star user 2's sheet.
4. In B, watch the new row appear instantly (no refresh).

This one is great for showing the v2.2.0 real-time push but is harder to record cleanly. Skip if time is tight.

### 4.2 Tools

**ScreenToGif** (https://www.screentogif.com) — Windows-native, free, has built-in editor (trim, crop, speed up boring bits).

### 4.3 Settings

- FPS: **15** (plenty for UI demos, keeps file size down)
- Capture area: ~1000×600 (covers viewport, not OS chrome)
- Loop: forever
- Encoder: FFmpeg (smaller files than legacy)

### 4.4 Optimize

Target **under 3 MB per GIF** (5 MB hard cap):

- ezgif.com → "Optimize" with "Lossy GIF" level 30–80
- Reduce to 800px wide
- Cap at 64–128 colors

### 4.5 Alternative: MP4

GitHub renders MP4 in READMEs (drag-and-drop into an issue → URL). MP4 is 5–10× smaller than GIF at the same quality, but it doesn't autoplay on first scroll the way GIFs do. For maximum first-impression: GIF. For minimum size: MP4.

---

## 5. The README — section-by-section template

````markdown
<div align="center">

<img src="docs/media/studyhub-wordmark.png" alt="StudyHub" width="400"/>

### A GitHub for college study sheets — fork, improve, contribute back.

![license](https://img.shields.io/badge/license-MIT-blue)
![version](https://img.shields.io/badge/version-v2.2.0-success)
![stack](https://img.shields.io/badge/stack-Express%205%20%2B%20React%2019-black)
![language](https://img.shields.io/badge/language-JavaScript-f7df1e)
![db](https://img.shields.io/badge/db-Postgres%20%2B%20Prisma%206-336791)
![ai](https://img.shields.io/badge/AI-Claude%20Sonnet%204-orange)
![realtime](https://img.shields.io/badge/realtime-Socket.io%204-010101)
![status](https://img.shields.io/badge/status-beta-yellow)

</div>

---

## What is StudyHub?

StudyHub is an open-source collaborative study platform built on the idea that a great study sheet should work like a great open-source project: anyone can fork it, improve it, and contribute the improvement back.

It includes:

- **Sheets** — share study sheets per course, fork them, contribute improvements back through a GitHub-style review flow.
- **Hub AI** — built-in Claude assistant that reads your courses and generates full HTML study sheets on demand, with PII redaction in and out.
- **Real-time messaging** — DMs and group chats with typing indicators, reactions, polls, and read receipts over Socket.io.
- **Study groups** — scheduled sessions, shared resources, Q&A discussion boards.
- **Creator Audit** — every publish runs five automated checks (HTML safety, asset origin, PII leak, accessibility, copyright signals) and produces a graded report.
- **Real-time notifications** — `/notifications` page with type filters, plus a bell that updates instantly via Socket.io push.
- **Notes, announcements, follows, stars, contributions** — the social layer that makes a class feel connected.
- **Block / mute, content moderation, plagiarism detection (fork-aware)** — the safety layer.

---

## Screenshots

### Feed dashboard

![feed](docs/media/01-feed.png)

### Browse sheets — fork-style discovery

![sheets](docs/media/02-sheets-browse.png)

### Hub AI — generate full study sheets from a prompt

![ai](docs/media/04-ai.png)

### Real-time messaging

![messages](docs/media/05-messages.png)

### Study groups

![groups](docs/media/06-study-group.png)

### Notifications — full page with type filters

![notifications](docs/media/07-notifications.png)

---

## Demo — Hub AI generating a sheet

![demo](docs/media/demo-ai.gif)

---

## Tech stack

**Language:** JavaScript (CommonJS on the backend, ES modules on the frontend). JSDoc for type hints in the editor.
**Frontend:** React 19, React Router 7, Vite 8, Socket.io client 4, Sentry, PostHog
**Backend:** Node 20, Express 5, Prisma 6 (PostgreSQL), Socket.io 4, Stripe, Anthropic SDK, Helmet
**Infra:** Railway (production), GitHub Actions (CI), Sentry (errors), Cloudflare R2 (media), ClamAV (antivirus)

---

## Quick start

```bash
git clone https://github.com/<your-username>/studyhub.git
cd studyhub

# backend
cd backend
cp .env.example .env   # fill DATABASE_URL, JWT_SECRET, FIELD_ENCRYPTION_KEY (64-hex), ANTHROPIC_API_KEY, etc.
npm install
npx prisma migrate deploy
npm run seed:beta      # seeds 5 beta users + sheets + groups + flags
npm run dev            # http://localhost:4000

# frontend (new terminal)
cd frontend/studyhub-app
cp .env.example .env
npm install
npm run dev            # http://localhost:5173
```
````

Sign in as `beta_student1` / `BetaStudent123!`.

You'll need:

- Node 20+
- PostgreSQL 14+
- An Anthropic API key (for Hub AI)
- A Stripe test account (optional, only for payments)

---

## Project layout

- `backend/` — Express API, Prisma data layer, Vitest tests (~2000 tests)
- `frontend/studyhub-app/` — React 19 + Vite SPA, Vitest, Playwright
- (Internal documentation, e.g. `docs/internal/audits/`, holds per-feature handoff plans)
- `docs/` — release notes + media

Backend is modularized under `backend/src/modules/<name>/` (21+ modules, each with `routes.js`, `controller.js`, `service.js`, `constants.js`).

---

## Contributing

Contributions are welcome. Read `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` first.

StudyHub is JavaScript-only. New files are `.js` (backend, CommonJS) or `.jsx` (frontend, ES modules). Use JSDoc for type hints. See the "Language policy" section in `CLAUDE.md`.

Quick path:

1. Fork the repo
2. `git checkout -b feature/your-feature`
3. Make changes
4. `cd backend && npm run lint && npm run typecheck && npm test`
5. `cd frontend/studyhub-app && npm run lint && npm run typecheck && npm run build`
6. Open a PR

---

## Security

If you find a vulnerability, see `SECURITY.md` for the disclosure process. We honor good-faith security research.

## Privacy

What data we collect, where it goes, and how to delete it: `PRIVACY.md`.

## License

MIT — see `LICENSE`.

```

---

## 6. Going public — the actual flip

1. Push the latest changes.
2. GitHub → repo → **Settings**.
3. **About** (gear icon, top right):
   - Description: same one-line tagline.
   - Website: live URL (Railway or custom domain).
   - Topics: `study-platform`, `education`, `react`, `typescript`, `nodejs`, `prisma`, `postgresql`, `socket-io`, `claude-ai`, `open-source`, `college`, `student-tools`. Topics drive search discoverability.
4. **Settings → General → Social preview** — upload a 1280×640 image (Canva: wordmark on left, screenshot on right, tagline at the bottom). High-leverage, this is the thumbnail everywhere.
5. **Settings → General → Danger Zone → Change visibility → Public**.
6. **Releases** → Draft new release → tag `v2.2.0` (matches `package.json`), title "StudyHub v2.2.0 — public launch", short notes pulling from `docs/release-log.md` and `ROADMAP.md`.

### 6.1 Tell people

- **r/SideProject** on Reddit — describe what it is.
- **r/webdev** — focus on the technical interest (Express 5, Prisma 6, real-time, AI integration, fork-aware plagiarism).
- **Hacker News** — "Show HN: StudyHub — open-source GitHub for college study sheets". Submit on a weekday morning ET.
- **Twitter/X / Bluesky / LinkedIn** — short post with the demo GIF embedded.
- **Indie Hackers** — they like solo-built, narrated-journey projects.

One Reddit + one HN post is plenty for v1.

---

## 7. Quick checklist

```

PRE-FLIGHT
[ ] gitleaks scan clean
[ ] trufflehog scan clean
[ ] git grep for live keys returns nothing
[X] LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, PRIVACY.md
[X] backend/.env.example complete
[X] frontend/studyhub-app/.env.example complete
[X] FIELD_ENCRYPTION_KEY enforced at startup
[X] All 6 OWASP HTTP headers
[X] JavaScript across both workspaces (TypeScript reverted 2026-04-30)

CREATOR AUDIT DEPLOY (v2.2.0 prod ship)
[X] Code deployed
[ ] `npx prisma migrate deploy` (consent migrations including 20260430000001)
[ ] `npm --prefix backend run backfill:creator-consent -- --prod-confirm`
[ ] `npm --prefix backend run seed:flags`

BRANDING
[ ] studyhub-wordmark.png exported
[ ] studyhub-wordmark-dark.png exported
[ ] tagline finalized
[ ] 8 shields.io badges chosen (license, version, stack, language, db, ai, realtime, status)

SEED DATA
[ ] dev DB seeded with `npm run seed:beta` (creates beta users + audit consent + flags)
[ ] my user account renamed/avatar swapped if it says "test"

SCREENSHOTS (1440×900, light mode, no DevTools)
[ ] 01-feed.png
[ ] 02-sheets-browse.png
[ ] 03-sheet-detail.png
[ ] 04-ai.png
[ ] 05-messages.png
[ ] 06-study-group.png
[ ] 07-notifications.png ← v2.2.0 surface
[ ] 08-creator-audit.png ← v2.2.0 surface (delete seed consent row first)
[ ] all run through tinypng.com

GIFS (15fps, ~1000×600, under 3 MB each)
[ ] demo-ai.gif (Hub AI generating a sheet)
[ ] demo-fork.gif (fork-and-contribute flow — confirm no plagiarism flag)
[ ] both optimized via ezgif.com lossy mode

README
[ ] new README.md drafted from template above
[ ] all images/gifs render correctly on a fresh browser
[ ] tested links don't 404

PUBLIC
[ ] About description + topics set
[ ] Social preview image uploaded
[ ] Repo flipped to public
[ ] v2.2.0 release tagged

ANNOUNCE
[ ] Reddit r/SideProject post
[ ] Reddit r/webdev post
[ ] Hacker News Show HN
[ ] Twitter/Bluesky post

```

---

## 8. Notes for the AI assistant on the main computer

When you (the AI on the main computer) execute this plan:

- The repo follows the conventions in `CLAUDE.md` at the project root. **Read it before editing anything.**
- **All new files are `.js` (backend) or `.jsx` (frontend).** TypeScript is not used in this repo (founder-locked 2026-04-30).
- After every code change run: `npm --prefix backend run lint`, `npm --prefix backend run typecheck`, `npm --prefix backend test`, `npm --prefix frontend/studyhub-app run lint`, `npm --prefix frontend/studyhub-app run typecheck`, `npm --prefix frontend/studyhub-app run build`.
- All inline style colors must use `var(--sh-*)` tokens. No new hex codes.
- No emojis in UI chrome. Emojis are allowed only inside user-generated content (feed posts, messages, notes, comments, group discussions, profile bios).
- All frontend API calls use `${API}/api/...` (never omit `/api`).
- For Creator Audit: the prod deploy order is non-negotiable — see the runbook in `backend/scripts/seedFeatureFlags.js`.
- Update `docs/release-log.md` with a single user-visible entry per change (CI gate requires it).

When the user comes back to take screenshots, the dev environment should already be running with seeded data and the user's account already logged in.

---

End of plan. Email this to yourself, open it on the main computer,
```
