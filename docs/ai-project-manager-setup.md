# StudyHub AI Project Manager — Setup & Architecture

## The Vision

Turn Claude Code into a full AI project manager for StudyHub by connecting three AI APIs and GitHub through MCP servers. The PM will handle task tracking, code review, release management, and daily health checks — all from within Claude Code sessions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Claude Code (Hub)                       │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ Anthropic │  │  OpenAI  │  │   GitHub MCP Server  │  │
│  │ Claude API│  │ GPT API  │  │  (issues, PRs, code) │  │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘  │
│       │              │                   │              │
│  Primary brain   Second opinion     Read/write to:      │
│  for all PM      for brainstorm     - Issues            │
│  decisions       & comparison       - Pull requests     │
│                                     - Actions           │
│                                     - Releases          │
│                                     - Code search       │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Custom PM Skill (SKILL.md)             │   │
│  │  - Sprint planning      - Bug triage             │   │
│  │  - Release management   - Health checks          │   │
│  │  - Changelog generation - Issue creation          │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Scheduled Tasks (Automation)              │   │
│  │  - Daily: lint + test health check               │   │
│  │  - Weekly: dependency audit + stale issue sweep   │   │
│  │  - Per-commit: auto-review + changelog update     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## What Each API Does

### 1. Anthropic (Claude) — Primary PM Brain
- **Role**: Main decision-maker, code reviewer, task planner
- **Used for**: Code review, architecture decisions, writing issues, sprint planning, generating changelogs, deep code analysis
- **Why Claude**: Best at understanding large codebases, following coding conventions, and producing structured output

### 2. OpenAI (ChatGPT) — Second Opinion & Brainstorm
- **Role**: Alternative perspective, brainstorming partner, documentation helper
- **Used for**: Getting a second opinion on architecture decisions, brainstorming feature ideas, generating user-facing documentation, creating marketing copy for release notes
- **Why GPT**: Different training data = different perspectives; good at creative brainstorming

### 3. GitHub API — Project Infrastructure
- **Role**: The actual project management backbone
- **Used for**: Creating/managing issues, reviewing PRs, triggering workflows, managing releases, searching code, managing labels and milestones
- **Why GitHub**: StudyHub already lives on GitHub; this is where the work happens

---

## Setup Steps

### Step 1: GitHub MCP Server

Add the official GitHub MCP server to Claude Code. This gives Claude direct access to your repo.

```bash
# In your Claude Code settings, add:
claude mcp add github \
  --transport stdio \
  -- npx -y @modelcontextprotocol/server-github

# Set your GitHub token as an environment variable:
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_token_here
```

**What this unlocks:**
- `create_issue` — Claude can create GitHub issues directly
- `list_issues` — Read and triage existing issues
- `create_pull_request` — Open PRs with AI-generated descriptions
- `get_pull_request` — Review PRs and leave comments
- `create_release` — Tag and publish releases
- `search_code` — Find code patterns across the repo
- `push_files` — Commit changes directly

### Step 2: OpenAI MCP Server

Add an OpenAI-compatible MCP server for second-opinion queries:

```bash
# Option A: Use the openai-compatible MCP server
claude mcp add openai \
  --transport stdio \
  -- npx -y @anthropic/mcp-openai-server

# Set your OpenAI API key:
export OPENAI_API_KEY=sk-your_key_here
```

### Step 3: Update Claude Code Settings

Update `.claude/settings.local.json` to allow the PM workflows:

```json
{
  "permissions": {
    "allow": [
      "Bash(gh *)",
      "Bash(npm run lint)",
      "Bash(npm run test)",
      "Bash(npm run build)",
      "Bash(node -e *)"
    ]
  }
}
```

---

## PM Workflows (What the Skill Will Do)

### Workflow 1: Sprint Planning
**Trigger**: "plan the sprint", "what should we work on next"
1. Read open GitHub issues and their labels/priorities
2. Check the current beta release log for context
3. Read CLAUDE.md for project conventions
4. Propose a prioritized sprint backlog (3-5 items)
5. Create GitHub issues for any new tasks
6. Assign milestones

### Workflow 2: Code Review
**Trigger**: "review PR #X", "review my changes"
1. Fetch the PR diff from GitHub
2. Analyze changes against CLAUDE.md conventions
3. Check for the bugs we've been fixing (credentials, parseInt, etc.)
4. Run lint and build checks
5. Post review comments on the PR
6. Approve or request changes

### Workflow 3: Release Management
**Trigger**: "prepare release", "cut a new version"
1. Gather all commits since last release
2. Auto-generate changelog grouped by category (features, fixes, improvements)
3. Update version numbers in package.json files
4. Update the beta release log in docs/
5. Create a GitHub release with the changelog
6. Create a tracking issue for the next version

### Workflow 4: Bug Triage
**Trigger**: "triage issues", "check for bugs"
1. Run full lint + test suite
2. Scan for common patterns (missing credentials, unhandled errors, etc.)
3. Create GitHub issues for any new findings
4. Label and prioritize them
5. Link related issues together

### Workflow 5: Daily Health Check (Scheduled)
**Trigger**: Runs automatically on schedule
1. Run `npm run lint` across frontend and backend
2. Run `npm run build` to catch build failures
3. Check for any new GitHub issues or PRs
4. Summarize the project health status
5. Flag anything that needs attention

### Workflow 6: Dependency Audit (Weekly)
**Trigger**: Runs weekly or on demand
1. Run `npm audit` for security vulnerabilities
2. Check for outdated packages
3. Create issues for critical updates
4. Suggest upgrade paths

---

## Brainstorm: Extra Ideas

### Idea 1: AI Standup Bot
Every morning, Claude reviews what changed in the last 24 hours (commits, issues closed, PRs merged) and generates a standup summary. This gives you a quick "here's where we are" without manually checking GitHub.

### Idea 2: Auto-Issue Creator from TODOs
Scan the codebase for `// TODO` and `// FIXME` comments. Cross-reference with existing GitHub issues. Create new issues for any uncaptured TODOs, linking them to the file and line.

### Idea 3: Smart PR Descriptions
When you push a branch, the PM auto-generates a PR description based on the diff — including what changed, why (inferred from commit messages), and what to test.

### Idea 4: Regression Watchdog
Before any release, automatically re-run the bug checklist from CLAUDE.md (search consistency, profile visibility, credentials coverage) and verify nothing regressed.

### Idea 5: Student Beta Feedback Pipeline
If StudyHub has a feedback form, the PM can periodically pull feedback, categorize it (bug report / feature request / UX complaint), and create GitHub issues with appropriate labels.

### Idea 6: Cross-Model Architecture Review
For big architectural decisions, send the same question to both Claude and GPT, compare their responses, and present a unified recommendation with pros/cons from each perspective.

### Idea 7: Auto-Update CLAUDE.md
After each significant change, the PM reads the current CLAUDE.md and suggests updates to keep it accurate — new conventions, recently fixed bugs to document, testing gaps to track.

---

## File Structure

```
studyhub/
├── .claude/
│   ├── settings.local.json          # Permissions for PM workflows
│   └── commands/
│       ├── sprint-plan.md           # /sprint-plan command
│       ├── review-pr.md             # /review-pr command
│       ├── prepare-release.md       # /prepare-release command
│       └── health-check.md          # /health-check command
├── .skills/
│   └── skills/
│       └── studyhub-pm/
│           └── SKILL.md             # The PM skill
└── CLAUDE.md                        # Updated with PM conventions
```

---

## Next Steps

1. **Now**: Create the PM skill (SKILL.md) with all workflows
2. **Now**: Set up the GitHub MCP server connection
3. **Now**: Create scheduled tasks for health checks
4. **Later**: Set up the OpenAI MCP for second-opinion queries
5. **Later**: Build the auto-standup and TODO scanner workflows

---

## Quick Setup Commands (Run on Your Machine)

Open PowerShell/terminal on your Windows machine and run these in order.

### 1. Install the GitHub MCP Server

```powershell
# Navigate to your project
cd "C:\Users\Abdul PC\OneDrive\Desktop\studyhub"

# Add the GitHub MCP server to Claude Code
claude mcp add github -- npx -y @modelcontextprotocol/server-github

# Set your GitHub personal access token
# (Create one at https://github.com/settings/tokens → Fine-grained → select your studyhub repo)
# Required permissions: Issues (read/write), Pull Requests (read/write), Contents (read/write), Actions (read)
$env:GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_YOUR_TOKEN_HERE"
```

### 2. Set Up Your API Keys

```powershell
# Anthropic (Claude) — you likely already have this since you use Claude Code
$env:ANTHROPIC_API_KEY = "sk-ant-YOUR_KEY_HERE"

# OpenAI (ChatGPT)
$env:OPENAI_API_KEY = "sk-YOUR_KEY_HERE"

# GitHub (same token as above)
$env:GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_YOUR_TOKEN_HERE"
```

To make these permanent, add them to your system environment variables:
- Windows Settings → System → About → Advanced System Settings → Environment Variables
- Add each key as a new User variable

### 3. Verify the Setup

```powershell
# Test GitHub CLI access
gh auth status

# Test that Claude can use gh commands
claude "run gh issue list --limit 3 for the studyhub repo"
```

### 4. Use the PM

Once set up, you can use these commands in any Claude Code session inside the StudyHub project:

- **"plan the sprint"** — Get a prioritized task list from open issues
- **"review PR #42"** — Full code review with StudyHub conventions
- **"prepare release"** — Auto-generate changelog and cut a release
- **"health check"** — Run lint, scan for bugs, report status
- **"standup"** — Catch up on what happened in the last 24 hours
- **"triage bugs"** — Scan codebase for issues and create GitHub issues
