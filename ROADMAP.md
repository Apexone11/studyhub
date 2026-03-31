# Roadmap

This document outlines the current state of StudyHub and the planned direction for future releases. Priorities may shift based on user feedback and campus adoption.

---

## Current Release: V1.7.0

V1.7.0 is the live production release. It builds on V1.5.0 with real-time messaging, study groups, security hardening, and accessibility improvements.

### V1.7.0 Feature Summary

| Area | What shipped |
| ---- | ------------ |
| SheetLab | Commit history, snapshot/restore, side-by-side diffs, SHA-256 checksums |
| Contributions | Fork, improve, submit, review, merge — full GitHub-style workflow |
| Profiles | Cover images, pinned sheets (up to 6), activity heatmap, 12 achievement badges |
| Content Moderation | AI scanning, tiered risk classification (Tier 0-3), admin review queue, strikes, appeals |
| Authentication | WebAuthn passkeys, Google OAuth, JWT httpOnly cookies, bcrypt |
| Search | Full-text PostgreSQL search, global modal search across sheets/courses/users/notes/groups |
| HTML Sheets | Accept-all submission, detect-classify-route pipeline, safe preview sandbox |
| Messaging | Real-time DMs and group chats via Socket.io, typing indicators, read receipts, GIF support, polls, reactions |
| Study Groups | Create/join groups, shared resources, scheduled sessions with RSVP, discussion boards with real-time replies |
| Block/Mute | Bidirectional block system, one-directional mute, enforced across all social features |
| Security | Cookie hardening, rate limiting, attachment validation, trust gate with auto-promotion |
| Accessibility | WCAG 2.1 AA, focus trapping, aria-labels, skip-to-content, keyboard shortcuts, reduced motion support |
| Infrastructure | Feature flags, provenance manifests, PWA offline support, Sentry + PostHog telemetry |
| Performance | Skeleton loading states, Suspense boundaries, code-split routes |

---

## V2.0 — Next Major Release

V2.0 focuses on three themes: **smarter studying**, **deeper collaboration**, and **sustainable growth**.

### AI Tutor

- Ask questions about any study sheet and get contextual answers grounded in the sheet content
- Explain-this-to-me mode for highlighted sections
- Generate practice questions from a sheet
- Powered by LLM with retrieval-augmented generation over sheet content

### Practice Tests

- Create quizzes from study sheet content (multiple choice, short answer, fill-in-the-blank)
- Auto-scoring with immediate feedback and explanations
- Spaced repetition scheduling for missed questions
- Course-level question banks built from community sheets

### Mobile App

- Native mobile experience for iOS and Android
- Offline sheet reading with background sync
- Push notifications for stars, comments, contributions, and group activity
- Camera-to-sheet: photograph handwritten notes and convert to digital sheets

### Smarter Recommendations

- Personalized sheet recommendations based on enrolled courses and study history
- "Students who studied X also studied Y" discovery
- Trending sheets per course with time-decay scoring
- Weekly digest emails with recommended sheets and course activity

### Campus Expansion

- Multi-campus support with school-level feeds and leaderboards
- Campus ambassador program with onboarding tools
- School-specific branding and course catalog imports
- Cross-campus sheet discovery for shared courses

### Monetization (StudyHub Pro)

- **Ad-supported free tier**: tasteful, non-intrusive ads on public pages to sustain the platform
- **StudyHub Pro subscription**: ad-free experience, AI Tutor access, advanced analytics, priority support, and extended storage
- **Institutional licenses**: campus-wide Pro access for universities that partner with StudyHub
- Core study tools (sheets, forks, contributions, groups, messaging) remain free

---

## V2.1 — Quality of Life

These items are planned for the release following V2.0. Scope may shift based on V2.0 adoption.

### Collaboration Enhancements

- Inline comments on specific lines or sections within a sheet
- Suggested edits (like Google Docs suggestions) as an alternative to full fork-and-contribute
- Co-author attribution on sheets with multiple contributors
- Contribution analytics showing impact across the platform

### Content and Discovery

- Rich media embeds (LaTeX equations, interactive code blocks, embedded diagrams)
- Sheet templates for common formats (lecture notes, exam review, lab report)
- Course syllabus integration for automatic sheet organization by topic and week
- Advanced filters: date range, minimum stars, content type, has-attachments

### Platform and Infrastructure

- API rate limiting dashboard for admins
- Webhook integrations for LMS platforms (Canvas, Blackboard)
- Bulk import/export for course materials
- Advanced analytics for course instructors (opt-in)

---

## How Priorities Are Set

1. **User feedback** — feature requests and bug reports from active students
2. **Adoption metrics** — what features drive engagement and retention
3. **Campus needs** — requirements from new schools joining the platform
4. **Technical debt** — infrastructure improvements that unblock future features
5. **Sustainability** — features that help StudyHub sustain long-term through revenue

---

## Contributing to the Roadmap

Have an idea? Open a GitHub Issue with the `enhancement` label. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
