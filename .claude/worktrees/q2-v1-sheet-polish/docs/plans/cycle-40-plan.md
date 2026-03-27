# Cycle 40 Implementation Plan

## Theme

**Launch UX + onboarding polish + first-success flow**

## Goal

> Can a new student arrive, understand the product quickly, succeed on their first session, and trust the platform enough to come back?

## Product objective

Turn StudyHub from "technically capable beta" into "a product a student can actually land on and understand in minutes."

---

## Track 1 -- First-Run Onboarding Experience

**Objective:** Help a new user understand what StudyHub is, what they can do first, where to start, and why they should trust the platform.

### Required implementation

**A. First-run guidance card**
Show a clear, dismissible onboarding panel for new or low-activity users:
- Browse sheets for your courses
- Upload your first study sheet
- Complete your profile
- Star or fork useful content

**B. Role-aware first actions**
- Regular students: find course, browse sheets, upload first sheet
- Admins: separate admin surface prompt only if relevant

**C. Reduce first-run emptiness**
Where a screen is sparse, add a useful starter path: example CTA, suggested courses, "how this works" snippet.

**D. Make "what to do next" obvious**
Every first-run screen should have a clear primary CTA.

### Deliverables
- Onboarding card/banner
- First-action guidance
- Better empty/sparse states

### Definition of done
A new user can land in the product and immediately know what to do next.

---

## Track 2 -- Signup, Verification, and Account Confidence

**Objective:** Make the account journey feel reliable and human.

### Required implementation

**A. Explain account state clearly**
- "Your account is active. Verify your email to unlock all features."
- "You still have access during the grace period."
- "Verification is required before publishing after the grace period."

**B. Improve success/error messaging**
For: verification email sent, code expired, resend success, invalid code, session expired.

**C. Make next steps clearer**
If blocked from an action: explain why, provide the next action, include direct CTA if possible.

### Deliverables
- Better verification banners/messages
- Clearer blocked-state UX
- Stronger trust signals in settings/profile

### Definition of done
Users understand their account status and what they need to do without guessing.

---

## Track 3 -- First Upload Success Flow

**Objective:** Make uploading the first sheet feel guided and successful, not intimidating.

### Required implementation

**A. First-upload helper panel**
Explain: what formats are supported, what scan does, what happens after submit, what "pending review" means.

**B. Improve post-submit states**
After submit: success confirmation, next step, where to see the uploaded sheet, where to see status/findings.

**C. Make scan outcomes feel informative, not scary**
Use supportive language: accepted and scanned, flagged for review, pending review, quarantined because scanner detected a security risk.

**D. Add clearer "return path"**
From upload flow back to: my sheets, pending items, preview/report.

### Deliverables
- First-upload helper UI
- Improved post-submit confirmation flow
- Clearer scan result explanations

### Definition of done
A first-time uploader understands what happened and where their sheet went.

---

## Track 4 -- Browse and Discovery Polish

**Objective:** Make the app more useful immediately for non-uploaders too.

### Required implementation

**A. Improve "browse first" messaging**
- "Start with your courses"
- "See what classmates already shared"
- "Browse recent and starred sheets"

**B. Sharpen empty states**
If no sheets: suggest upload, suggest switching course/filter, explain what will show up here.

**C. Improve dashboard/feed guidance**
Make the app answer: why am I here? what's new? what should I click?

**D. Highlight value quickly**
Recent course activity, latest sheets, starred by classmates, pending feedback.

### Deliverables
- Better browse-first copy/CTAs
- Improved empty states
- Better dashboard/feed guidance

### Definition of done
A user who doesn't upload immediately still sees clear value in the product.

---

## Track 5 -- Product Trust and Transparency

**Objective:** Make the platform feel trustworthy around scanning, moderation, and content state.

### Required implementation

**A. Short trust-language blocks**
- "Every HTML sheet is scanned for security risks before broader access."
- "False positive? Contact support."

**B. Make support paths obvious**
Where users are blocked, flagged, or quarantined: show next step, link to support/help, avoid dead-end messaging.

**C. Improve moderation transparency**
Show: why a status exists, what it affects, who can review it, what the user can do next.

### Deliverables
- Better trust copy
- Support CTAs in blocked/review states
- Moderation transparency improvements

### Definition of done
Users feel informed, not arbitrarily blocked.

---

## Track 6 -- Launch Surface Polish (Design + UX)

**Objective:** Polish the first surfaces users see most often.

### Priority surfaces
Dashboard, sheets page, upload page, feed, profile/account state banners.

### Required implementation

**A. CTA hierarchy review**
Every page: one obvious primary CTA, clearly secondary actions, no competing emphasis.

**B. Banner cleanup**
Standardize: success, info, warning, blocked, pending review.

**C. Reduce clutter**
Remove anything that distracts from first success, is repeated too often, or feels too technical for the main user flow.

**D. Polish dark/light consistency**
Especially on first-run and core task surfaces.

### Deliverables
- Launch-ready polish on primary surfaces
- Clearer CTA hierarchy
- More consistent banners and spacing

### Definition of done
The main user-facing pages feel intentional and production-ready.

---

## Track 7 -- Visual QA + Launch Proof

**Objective:** Make Cycle 40 visually reviewable and shareable.

### Must-capture screens
- Dashboard first-run
- Sheets browse state
- Sheets empty state
- Upload helper state
- Upload flagged/pending state
- Verification/account banner state
- Profile/account trust state
- Feed browse state

### Folder structure
```
docs/release-visuals/cycle-40/
  onboarding/
  account/
  upload/
  sheets/
  feed/
  dashboard/
```

### Deliverables
- Visual gallery for Cycle 40
- Before/after proof for major UX improvements

---

## Track 8 -- Validation and Release Confidence

### Required validation
- Backend: lint + tests
- Frontend: lint + build + unit tests
- Playwright: new user onboarding, browse sheets, first upload, pending state, verification blocked state, support CTAs

### Deliverables
- Validation pass
- Release note entry
- Known-risks section if anything remains rough

---

## Suggested execution order

### Phase 1 -- Onboarding + upload flow clarity
Highest impact for first-time users.

### Phase 2 -- Verification/account trust states
Reduce confusion around blocked actions.

### Phase 3 -- Browse/discovery polish
Make non-upload sessions valuable.

### Phase 4 -- Visual QA + validation + release notes

---

## Files most likely to change

### Frontend
- Dashboard page/components
- Sheets page/components
- Upload page/components
- Feed page/components
- Settings/profile/account banner components
- Onboarding/tutorial helpers
- Status/banner components

### Docs
- Release log, changelog, visual gallery
- Possibly onboarding/help docs

### Tests
- Playwright onboarding/browse/upload flows
- Component tests for new states

---

## Success criteria

Cycle 40 is successful if:
- A new user can understand the product quickly
- Account/verification state is clear
- First upload feels guided and successful
- Browsing feels useful even before uploading
- Blocked/review states feel transparent
- Primary surfaces feel launch-ready
- Visual proof exists for all major changes
