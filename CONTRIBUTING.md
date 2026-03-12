# Contributing to StudyHub 📚

Thank you for wanting to help! StudyHub is built by students, for students.
Every contribution — big or small — makes a difference.

---

## What You Can Contribute
- 📄 Study sheets and guides
- ✅ Practice test questions
- 🐛 Bug fixes
- 💡 Feature suggestions
- 📝 Improving documentation

---

## Ground Rules
- Be respectful to every contributor — we are all learning
- No plagiarized content — only submit your own original work
- Keep study materials academic and appropriate
- Do not submit anything unrelated to the course or CS topics
- Test your changes before submitting them

---

## How to Contribute (Step by Step)

### 1. Fork the Repository
Click the **Fork** button at the top right of this page.
This creates your own copy of StudyHub under your GitHub account.

### 2. Clone Your Fork
```bash
git clone https://github.com/YOUR-USERNAME/studyhub.git
cd studyhub
```

### 3. Create a Branch
Always create a new branch for your work — never edit the main branch directly.
```bash
git checkout -b your-branch-name
```

**Branch naming rules:**
- Adding a study sheet → `add-topic-name` (example: `add-binary-numbers`)
- Fixing a bug → `fix-description` (example: `fix-login-error`)
- New feature → `feature-description` (example: `feature-dark-mode`)

### 4. Make Your Changes
- Study sheets go in the `study-materials/` folder
- Follow the HTML template provided in `study-materials/TEMPLATE.html`
- Keep file names lowercase with hyphens: `two-complement.html`

### 5. Commit Your Changes
Write clear commit messages that explain what you did:
```bash
git add .
git commit -m "Add Two's Complement study sheet"
git push origin your-branch-name
```

**Good commit messages:**
- ✅ `Add binary numbers study sheet`
- ✅ `Fix typo on homepage announcement`
- ❌ `updated stuff`
- ❌ `fix`

### 6. Open a Pull Request
- Go to the original StudyHub repo on GitHub
- Click **Pull Requests** → **New Pull Request**
- Select your branch
- Fill out the PR template completely
- Submit and wait for review

---

## Study Sheet Guidelines
If you are submitting a study sheet, make sure it includes:
- [ ] A clear title and topic
- [ ] Your name as the author (optional but appreciated)
- [ ] Organized sections with headings
- [ ] At least one example or diagram
- [ ] No copy-paste from textbooks — explain it in your own words

---

## Pull Request Review Process
1. A maintainer will review your PR within a few days
2. They may request changes — this is normal, not a rejection
3. Once approved it gets merged into the main branch
4. Your contribution will be live for all students 🎉

---

## Questions?
Open a **GitHub Issue** with the label `question` and we will get back to you.