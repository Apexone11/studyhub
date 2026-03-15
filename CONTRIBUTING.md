# Contributing to StudyHub

Thank you for your interest in contributing. StudyHub is built for students by students, and every contribution — whether it's a study sheet, a bug report, or a code improvement — helps make it better for everyone.

---

## Ways to Contribute

| Type | How |
|------|-----|
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
3. **Fill in the form** — title, course, and your content in Markdown format
4. **Publish** — your sheet is immediately visible to other students

### Content Guidelines

- Write in your own words — do not copy-paste from textbooks or other sources
- Organize content with headings (`#`, `##`, `###`) so the table of contents generates correctly
- Include at least one example, diagram description, or worked problem
- Keep content relevant to the course and academically appropriate
- You are credited as the author on every sheet you upload

### Supported Markdown

Sheets are rendered with a built-in Markdown parser. The following syntax is supported:

```
# Heading 1      ## Heading 2     ### Heading 3
**bold**         *italic*         ***bold italic***
`inline code`    ~~strikethrough~~
[Link text](url)

- Unordered list item
  - Nested item
1. Ordered list item

> Blockquote

| Column A | Column B |
|----------|----------|
| Value    | Value    |

---  (horizontal rule)

```
Fenced code block (copy button included)
```
```

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
- Bug fix → `fix/description` (e.g., `fix/login-redirect`)
- New feature → `feat/description` (e.g., `feat/dark-mode`)
- Documentation → `docs/description`

### 4. Set Up Locally

```bash
# Install dependencies
npm --prefix backend install
npm --prefix frontend/studyhub-app install

# Create backend/.env with:
#   PORT=4000
#   JWT_SECRET=your_secret_here
#   DATABASE_URL=postgresql://...

# Run migrations
cd backend && npx prisma migrate dev

# Start backend (port 4000)
npm --prefix backend run dev

# Start frontend (port 5173)
npm --prefix frontend/studyhub-app run dev
```

### 5. Commit and Push

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

### 6. Open a Pull Request

- Go to the original StudyHub repo on GitHub
- Click **Pull Requests → New Pull Request**
- Select your branch and fill out the PR template
- A maintainer will review and may request changes — this is part of the process

---

## Code Standards

- Keep changes focused — one thing per PR
- Test your change manually before opening a PR
- Do not commit `.env` files, credentials, or secrets
- Follow the existing inline-style pattern for React components (no Tailwind, no CSS modules)
- Backend routes use Express + Prisma — follow the existing handler structure in `backend/src/routes/`

---

## Questions

Open a GitHub Issue with the `question` label and we will respond.
