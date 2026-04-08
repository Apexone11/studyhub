# Roadmap

This document outlines the current state of StudyHub and the planned direction for future releases. Priorities may shift based on user feedback and campus adoption.

---

## Current Release: V2.0.0

V2.0.0 is the live production release. It represents a major milestone that combines everything from V1.0 through V1.7 with significant new features.

### V2.0.0 Feature Summary

| Area               | What shipped                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Hub AI             | Claude-powered AI assistant with streaming responses, context-aware suggestions, AI-generated study sheets, conversation history |
| Video Platform     | Chunked video uploads to Cloudflare R2, custom Video.js player with theater mode, video feed posts, HLS streaming                |
| Announcements      | Rich media announcements with image galleries (up to 5), video attachments, 25K character limit                                  |
| Admin Analytics    | DAU/WAU/MAU metrics, engagement trend charts, content performance rankings, top contributors leaderboard                         |
| SheetLab           | Commit history, snapshot/restore, side-by-side diffs, SHA-256 checksums                                                          |
| Contributions      | Fork, improve, submit, review, merge -- full GitHub-style workflow                                                               |
| Profiles           | Cover images, pinned sheets (up to 6), activity heatmap, 12 achievement badges                                                   |
| Content Moderation | AI scanning, tiered risk classification (Tier 0-3), admin review queue, strikes, appeals                                         |
| Authentication     | WebAuthn passkeys, Google OAuth, JWT httpOnly cookies, bcrypt                                                                    |
| Search             | Full-text PostgreSQL search, global modal search across sheets/courses/users/notes/groups                                        |
| HTML Sheets        | Accept-all submission, detect-classify-route pipeline, safe preview sandbox                                                      |
| Messaging          | Real-time DMs and group chats via Socket.io, typing indicators, read receipts, GIF support, polls, reactions                     |
| Study Groups       | Create/join groups, shared resources, scheduled sessions with RSVP, discussion boards with real-time replies                     |
| Block/Mute         | Bidirectional block system, one-directional mute, enforced across all social features                                            |
| Security           | Cookie hardening, rate limiting (49 limiters), attachment validation, trust gate with auto-promotion, Prisma field encryption    |
| Accessibility      | WCAG 2.1 AA, focus trapping, aria-labels, skip-to-content, keyboard shortcuts, reduced motion support                            |
| Infrastructure     | Feature flags, provenance manifests, PWA offline support, Sentry + PostHog telemetry, SWR caching, skeleton loading              |
| Performance        | Code-split routes, Suspense boundaries, sidebar prefetch on hover, HTTP cache headers                                            |

---

## V2.5 -- Next Release (Target: 2-3 months)

V2.5 focuses on **monetization**, **account flexibility**, and **content tools**.

### Subscription and Payments

- Stripe-powered subscription tiers (Free, Pro) with secure checkout
- Donation system with public leaderboard
- Subscription management in user settings (cancel, upgrade, downgrade, payment history)
- Prorated billing on plan changes
- Admin dashboard for revenue metrics, subscriber analytics, and transaction logs
- PCI-compliant: zero card data stored on our servers

### Account Flexibility

- "Other" account type: users can skip school and course selection during registration
- Posts from "Other" users visible to everyone in the global feed
- All platform features remain accessible regardless of account type

### Study Tools

- Flashcard mode: auto-generate flashcards from study sheet content
- Study session timer with Pomodoro technique integration
- Sheet templates library for common formats (lecture notes, exam review, lab report)
- Advanced search filters (by date range, minimum stars, content type, attachments)

### Platform Quality

- Push notifications for web (stars, comments, contributions, group activity)
- Weekly digest emails with personalized sheet recommendations
- Trending sheets per course with time-decay scoring

---

## V3.0 -- Future Release (Target: 4-6 months)

V3.0 focuses on **smarter studying**, **deeper collaboration**, and **campus expansion**.

### AI-Powered Learning

- AI study plan generator: builds personalized plans from enrolled courses and study history
- Practice test engine: generate quizzes from sheet content (multiple choice, short answer, fill-in-the-blank)
- Auto-scoring with explanations and spaced repetition for missed questions
- Course-level question banks built from community sheets

### Collaboration Enhancements

- Real-time collaborative sheet editing (multiple cursors, live sync)
- Inline comments on specific sections within a sheet
- Suggested edits as an alternative to full fork-and-contribute
- Co-author attribution on sheets with multiple contributors

### Campus Expansion

- Multi-campus support with school-level feeds and leaderboards
- Campus ambassador program with onboarding tools
- LMS integration (Canvas, Blackboard) for course catalog imports
- Cross-campus sheet discovery for shared courses

### Mobile Experience

- Progressive Web App enhancements for mobile
- Offline sheet reading with background sync
- Camera-to-sheet: photograph handwritten notes and convert to digital sheets

---

## How Priorities Are Set

1. **User feedback** -- feature requests and bug reports from active students
2. **Adoption metrics** -- what features drive engagement and retention
3. **Campus needs** -- requirements from new schools joining the platform
4. **Technical debt** -- infrastructure improvements that unblock future features
5. **Sustainability** -- features that help StudyHub sustain long-term through revenue

---

## Contributing to the Roadmap

Have an idea? Open a GitHub Issue with the `enhancement` label. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
