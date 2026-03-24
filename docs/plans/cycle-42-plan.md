# Cycle 42 Implementation Plan

## Theme
**Sheet experience + collaboration depth + viewer reliability**

## Goal
> Once a student opens a sheet, does the experience feel useful, stable, collaborative, and worth staying in?

## Product objective
Turn StudyHub from "good at helping users discover sheets" into "good at helping users use, revisit, and improve sheets."

---

## Track breakdown

### 42.1 — Sheet Viewer Reliability and Stability
- Investigate and eliminate timeout causes (parallel fetches, race conditions, iframe load timing)
- Improve loading states (initial, preview, comments, related data, attachment)
- Improve degraded-mode behavior (secondary failures don't block primary content)
- Add timeout-safe patterns (abort controllers, settled partial loads, independent async sections)

### 42.2 — Sheet Viewer Experience Polish
- Improve header information design (title, course, author, time, signals, lineage, status)
- Improve action clarity (fork, star, contribute, history, download)
- Improve reading comfort (width, spacing, typography, sticky actions, dark mode)
- Surface useful related context (related sheets, recent updates, origin/fork source)

### 42.3 — Collaboration and Contribution UX
- Improve fork lineage display (forked from, derived from, author attribution)
- Improve contribution CTA clarity (explain how, fork/contribute choice, inline explainer)
- Improve revision/history entry points (version history, contribution review, diffs)
- Surface collaborative activity (recent forks, pending/accepted contributions, last changed by)

### 42.4 — "Continue Learning" and Revisit Loop
- Add "related sheets" or "next up" block (same course, same author, popular, forks)
- Add revisit-oriented signals (recently viewed, continue reading, starred+updated)
- Make next-step actions obvious (fork, star, related sheet, browse course)

### 42.5 — Commenting / Feedback Quality Pass
- Improve comment visibility/layout (connected to sheet, not afterthought)
- Clarify feedback actions (star, helpful, needs work, comment, contribute)
- Improve empty comment states (encourage clarifications, corrections, study tips)

### 42.6 — Visual QA + Reliability Proof
- Before/after screenshots for viewer, collaboration, comments, related, mobile, dark mode
- Visual gallery proof

### 42.7 — Validation and Stability Confidence
- Backend: lint, tests, contribution/history tests
- Frontend: lint, build, component tests
- Playwright: viewer loads reliably, comments visible, fork/contribution visible, mobile, dark mode
- Previously flaky viewer tests now stable

---

## Suggested execution order

1. Viewer reliability first (remove timeout instability)
2. Viewer hierarchy and action polish
3. Collaboration/history entry points
4. Related/revisit loop
5. Comments/feedback pass
6. Visual QA + validation + release docs
