# Contributing to StudyHub

Thank you for your interest in contributing. StudyHub is built for students by students, and every contribution — whether it is a study sheet, a bug report, or a code improvement — helps make it better for everyone.

---

## Ways to Contribute

| Type | How |
| ---- | --- |
| Upload a study sheet | Directly through the website — no GitHub required |
| Report a bug | Open a GitHub Issue |
| Suggest a feature | Open a GitHub Issue with the `enhancement` label |
| Fix a bug or add a feature | Fork the repo and open a Pull Request |
| Improve documentation | Fork the repo and open a Pull Request |

---

## Uploading Study Sheets (No GitHub Needed)

StudyHub has a built-in upload system. You do not need to touch GitHub to share study materials.

1. **Create an account** at the StudyHub site and log in
2. **Click "Upload Sheet"** from the Study Sheets page or the navigation bar
3. **Fill in the form** — title, course, and your content in Markdown or HTML format
4. **Publish** — your sheet is immediately visible to other students

You can also use **SheetLab** to manage your sheets with version control:

- Open any of your sheets and click "Open in SheetLab"
- Use the split-pane editor (code on the left, preview on the right)
- Commit changes with messages to build a version history
- Fork other students' sheets, improve them, and submit contributions back

### Content Guidelines

- Write in your own words — do not copy-paste from textbooks or other sources
- Organize content with headings so the table of contents generates correctly
- Include at least one example, diagram description, or worked problem
- Keep content relevant to the course and academically appropriate
- You are credited as the author on every sheet you upload

### Supported Formats

**Markdown** — rendered with a built-in parser supporting headings, bold, italic, code blocks, tables, lists, blockquotes, and horizontal rules.

**HTML** — full HTML sheets are accepted and go through a risk classification pipeline. Tier 0-1 publish automatically, Tier 2 goes to admin review, Tier 3 is quarantined.

---

## Code Contributions

For bug fixes, new features, or other code changes, use the standard GitHub workflow.

### 1. Fork the Repository

Click **Fork** in the top right of the repository page to create your own copy.

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR-USERNAME/studyhub.git
cd studyhub
```

### 3. Create a Branch

```bash
git checkout -b fix/short-description
```

Branch naming:

- Bug fix: `fix/description` (e.g., `fix/login-redirect`)
- New feature: `feat/description` (e.g., `feat/dark-mode`)
- Documentation: `docs/description`

### 4. Set Up Locally

```bash
# Install dependencies
npm --prefix backend install
npm --prefix frontend/studyhub-app install

# Copy backend/.env.example to backend/.env
# Then fill in your own local-only values for:
#   PORT
#   JWT_SECRET
#   DATABASE_URL

# Run migrations and seed data
cd backend && npx prisma migrate dev && npm run seed && cd ..

# Start backend (port 4000)
npm --prefix backend run dev

# Start frontend (port 5173)
npm --prefix frontend/studyhub-app run dev
```

### 5. Validate Your Changes

```bash
# Lint
npm --prefix backend run lint
npm --prefix frontend/studyhub-app run lint

# Build
npm --prefix frontend/studyhub-app run build

# Tests
npm --prefix backend test
```

### 6. Commit and Push

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "fix: redirect to /feed after login"
git push origin fix/your-branch
```

Good commit messages:

- `feat: add dark mode toggle`
- `fix: correct star count after optimistic update`
- `docs: update local dev setup instructions`

Avoid: `updated stuff`, `fix`, `changes`

### 7. Open a Pull Request

- Go to the original StudyHub repo on GitHub
- Click **Pull Requests > New Pull Request**
- Select your branch and fill out the PR template
- A maintainer will review and may request changes — this is part of the process

---

## Code Standards

### General

- Keep changes focused — one thing per PR
- Test your change manually before opening a PR
- Do not commit `.env` files, credentials, or secrets

### Frontend

- React 19 with function components and hooks
- Follow the existing inline-style pattern using CSS custom property tokens from `index.css`
- No Tailwind, no CSS modules — use `var(--sh-*)` tokens
- Large pages should be decomposed into thin orchestrators with extracted child components
- Files that mix components with non-component exports must be split: constants/helpers in `.js`, components in `.jsx`

### Backend

- Express 5 with modular routes under `backend/src/modules/<name>/`
- Each module follows the pattern: `index.js`, `*.routes.js`, `*.controller.js`, `*.service.js`, `*.constants.js`
- Use Prisma for all database access — no raw SQL
- Rate limit all write and authentication endpoints
- File uploads use multer with magic byte validation

---

## Project Architecture

```
backend/src/
  modules/         22 feature modules with controller/service/route pattern
  lib/             Shared utilities (storage, badges, diff, moderation, email, ...)
  middleware/       Auth, error handling, rate limiting
  monitoring/      Sentry integration

frontend/studyhub-app/src/
  pages/           15 page groups, each with orchestrator + child components
  components/      Shared UI (Navbar, SearchModal, ActivityHeatmap, BadgeDisplay, ...)
  features/        Feature barrels that re-export from pages/
  lib/             Hooks, context providers, animations, utilities
```

---

## Questions

Open a GitHub Issue with the `question` label and we will respond.
