# StudyHub

StudyHub is a GitHub-style collaborative study platform where college students create, share, fork, improve, and organize study materials by course.

Built by students, for students — StudyHub turns scattered notes, dead group chats, and hard-to-find review files into a shared knowledge base that keeps improving over time.

<!-- Banner image coming soon -->

## Features

### Study Sheets

- Create study sheets in Markdown or HTML with live preview
- Fork any sheet, improve it, and contribute changes back to the original
- Star, comment, and react to sheets from classmates
- Optional file attachments (PDF, images) with creator-controlled downloads
- Course-based discovery with school directories and global search
- Content moderation with AI scanning and admin review pipelines

### SheetLab (Version Control)

- GitHub-style tabbed workspace: Editor, Changes, History, Contribute, Reviews
- Split-pane editor with dark monospace textarea and live preview
- Commit system with snapshot, fork_base, restore, and merge commit types
- Uncommitted diff viewer with word-level change highlighting
- Contribution flow: fork owners submit, original owners review and merge
- Sync upstream to pull latest changes from the original sheet

### Profiles & Achievements

- Profile cover images with crop-and-upload modal
- Pinned sheets grid on profile (up to 6)
- GitHub-style contribution graph heatmap with Study/Build/All filters
- 12 achievement badges across Studying, Building, and Collaboration categories
- Bronze, silver, and gold tiers with coin-shaped sticker/3D-lite badges
- Follower/following lists with clickable counts

### Social & Feed

- Public feed posts with expandable discussions, reactions, and mentions
- Real-time notifications for stars, comments, follows, contributions, and mentions
- Course announcements from admins
- Private markdown notes linked to your courses

### Security & Accounts

- Verified email with Resend transports and suppression handling
- Password reset, 2-step verification, and WebAuthn passkey support
- Google OAuth integration
- Account settings with profile, security, notifications, privacy, courses, appearance, and account tabs
- Profile visibility controls (public, classmates-only, private)
- Moderation engine with strikes, appeals, and restrictions

## Tech Stack

| Layer      | Technology                                           |
| ---------- | ---------------------------------------------------- |
| Frontend   | React 19, React Router 7, Vite 8                     |
| Backend    | Node.js 20+, Express 5, Prisma                       |
| Database   | PostgreSQL                                           |
| Email      | Resend                                               |
| Monitoring | Sentry, PostHog                                      |
| Hosting    | Railway (backend + DB), Vercel/static (frontend)     |
| Auth       | JWT httpOnly cookies, bcrypt, WebAuthn, Google OAuth |

## Project Structure

```text
studyhub/
  backend/              Express API + Prisma data layer
    src/
      modules/          22 feature modules (auth, sheets, sheetLab, users, feed, ...)
      lib/              Shared utilities (storage, badges, diff, moderation, ...)
      middleware/        Auth, error handling, rate limiting
    prisma/             Schema + migrations
  frontend/
    studyhub-app/       React 19 + Vite SPA
      src/
        pages/          15 page groups (sheets, profile, feed, settings, ...)
        components/     Shared UI (Navbar, SearchModal, ActivityHeatmap, ...)
        lib/            Hooks, context, animations, utilities
  docs/                 Release and beta-cycle documentation
```

## Getting Started

```bash
# Clone the repo
git clone https://github.com/Apexone11/studyhub.git
cd studyhub

# Install dependencies
npm --prefix backend install
npm --prefix frontend/studyhub-app install

# Set up environment
cp backend/.env.example backend/.env
# Fill in: PORT, JWT_SECRET, DATABASE_URL

# Run migrations and seed data
cd backend && npx prisma migrate dev && npm run seed && cd ..

# Start development servers
npm --prefix backend run dev          # API on port 4000
npm --prefix frontend/studyhub-app run dev   # Frontend on port 5173
```

## Current Release: V2.2.0

StudyHub V2.2.0 is the current live release. See [ROADMAP.md](ROADMAP.md) for what's next.

### V2.0.0 - V2.2.0 Highlights

- Hub AI: Claude-powered AI assistant with streaming responses, context-aware suggestions, and AI-generated study sheets
- Video platform: chunked uploads to Cloudflare R2, custom player with theater mode, video feed posts
- Rich media announcements: image galleries, video attachments, 25K character support
- Admin analytics: DAU/WAU/MAU metrics, engagement charts, content performance rankings
- SheetLab: version control with commits, diffs, merge workflow, and SHA-256 checksums
- Real-time messaging: DMs, group chats, typing indicators, read receipts, reactions, polls
- Study groups: shared resources, scheduled sessions with RSVP, discussion boards
- Content moderation: AI scanning, tiered risk classification (Tier 0-3), admin review queue
- Authentication: WebAuthn passkeys, Google OAuth, JWT httpOnly cookies
- Global search across sheets, courses, users, notes, and groups
- Block/mute system enforced across all social features
- Creator Audit consent, provenance, and publish-flow trust gates
- 49 rate limiters, Prisma field encryption, provenance manifests

## Why StudyHub

- **Open access**: study materials stay free to use
- **Student collaboration**: notes get better when more people improve them
- **Start local, grow outward**: begin at Maryland, then expand campus by campus
- **Privacy-first**: collect only what is needed to run the platform well

## Resources

- Website: [https://www.getstudyhub.org](https://www.getstudyhub.org)
- About and roadmap: [https://www.getstudyhub.org/about](https://www.getstudyhub.org/about)
- Backup domain: [https://www.getstudyhub.net](https://www.getstudyhub.net)
- Source code: [https://github.com/Apexone11/studyhub](https://github.com/Apexone11/studyhub)
- Issues and feedback: [https://github.com/Apexone11/studyhub/issues](https://github.com/Apexone11/studyhub/issues)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to report bugs, suggest features, or submit code.

## Security

See [SECURITY.md](SECURITY.md) for our security policy and how to report vulnerabilities.

## License

StudyHub is released under the [MIT License](LICENSE).
