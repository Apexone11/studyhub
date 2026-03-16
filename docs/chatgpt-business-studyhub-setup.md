# StudyHub ChatGPT Business Setup

## What this admin screen can and cannot do

The `General` workspace page is not where you connect a repository.
It lets you manage workspace identity and appearance, but repo or app access is handled elsewhere.

## Best way to let ChatGPT Business read the StudyHub codebase

### Option 1: GitHub app or connector

This is the best low-friction option if you want ChatGPT Business to read the repository and answer code questions.

- Workspace admins manage apps from `Workspace settings -> Apps`.
- Business workspaces have apps enabled by default.
- Each user then connects GitHub from `Settings -> Apps`.
- GitHub access is read-only for repository analysis inside ChatGPT.
- This path is good for asking questions like:
  - Where is file upload handled?
  - Which route controls study sheet downloads?
  - How does email verification work?

### Option 2: Custom GPT for StudyHub

Use this if you want a reusable internal StudyHub assistant inside your workspace.

- Create a GPT at `chatgpt.com/create`
- Upload or paste the architecture brief from this repo
- If your workspace allows Apps in GPTs, enable GitHub or your approved internal apps
- Share the GPT inside the workspace only

### Option 3: Custom app or MCP connector

Use this if you want ChatGPT Business to call internal StudyHub tools or a private knowledge API, not just read GitHub.

- Custom apps use MCP
- Workspace owners or allowed developers publish them
- This is the right option for internal admin tools, deployment helpers, or private documentation search

## Recommended setup for StudyHub

1. Enable GitHub in the workspace Apps section
2. Connect the StudyHub GitHub repository
3. Create a private workspace GPT called `StudyHub Engineer`
4. Paste the instruction block below into the GPT instructions
5. Upload these files as knowledge, if needed:
   - `README.md`
   - `skills/studyhub-codebase/references/architecture.md`
   - `skills/studyhub-codebase/references/repo-map.md`
   - `docs/railway-deployment-checklist.md`

## Copy-paste instruction block

```text
You are the internal StudyHub engineering assistant.

StudyHub is a full-stack student collaboration platform built with:
- React 19 + React Router + Vite frontend
- Express 5 + Prisma + PostgreSQL backend
- Docker Compose for local development
- Railway for hosted deployment

Core Version 1 features:
- username/password login
- verified email and password reset
- optional 2-step verification by email
- course enrollment and course requests
- study sheet creation, editing, forking, contribution review, comments, reactions, and download controls
- feed posts with comments, reactions, mentions, notifications, and optional attachments
- admin dashboard, announcements, and moderation tools

Important engineering rules:
- never suggest frontend-only fixes for backend-enforced features
- always trace auth, upload, download, notification, and contribution flows end to end
- treat backend/src/lib/storage.js as the source of truth for upload path safety
- treat backend/src/middleware/csrf.js and backend/src/index.js as the source of truth for request protection
- when discussing data changes, reference Prisma schema and migrations
- prefer concise answers with exact file paths
- call out security, deployment, and regression risks before suggesting code changes

When answering, prioritize:
1. exact file locations
2. backend/frontend wiring
3. likely regressions
4. safe implementation order
```

## Notes

- If GitHub is connected inside ChatGPT, it can analyze repository contents, but it cannot push commits or PRs from that connector alone.
- If you need direct code generation or GitHub write workflows, use Codex or a custom app flow instead of relying only on the GitHub connector.
- Business data connected through these workspace features is handled under OpenAI's business-data privacy terms.
