# Sub-project A: Bug Fixes + UI Polish

**Date:** 2026-04-05
**Scope:** Fix visual bugs, improve video upload UX, comment avatars, supporters page premium redesign

---

## 1. Disclaimer Page Empty Iframe

**Problem:** The Disclaimer page at `/disclaimer` renders a Termly iframe that shows a blank white box. The iframe `src` points to `https://app.termly.io/policy-viewer/policy.html?policyUUID=55c02c39-21be-41cf-a1aa-a8ae0181e69b`.

**Root cause:** The iframe loads but Termly content renders as an empty white box. This is likely due to:
- Missing `allow` attribute on the iframe (Termly needs permissions)
- No loading state -- users see a blank box while the iframe loads
- No error fallback if Termly fails to load

**Fix:**
- Add `loading="lazy"` and appropriate `allow` attributes to the iframe
- Add a loading skeleton behind the iframe (absolute-positioned behind it)
- Add an `onLoad` handler and a timeout-based error fallback (if iframe hasn't loaded content after 10s, show a "Failed to load" message with a direct link to the Termly-hosted policy)
- Apply the same fix to CookiePolicyPage.jsx which uses the same pattern

**Files:**
- `frontend/studyhub-app/src/pages/legal/DisclaimerPage.jsx`
- `frontend/studyhub-app/src/pages/legal/CookiePolicyPage.jsx`

---

## 2. Register Page Blocked Resources (No Code Fix)

**Problem:** Network tab shows a Termly tracking script returning `(blocked:other)`.

**Assessment:** This is caused by browser ad blockers blocking Termly's tracking pixel. The consent banner still functions without it. This is expected behavior and not a bug we can fix in our code.

**Action:** No code change. Document as known behavior.

---

## 3. Video Upload Completion Status Indicator

**Problem:** After video upload completes and processing finishes, the FeedComposer still shows "Video uploaded -- processing in the background" with a static blue indicator. Users don't know when they can safely post.

**Current flow:**
1. User uploads video via `VideoUploader` component
2. `handleVideoUploadComplete(videoId)` sets `pendingVideoId` and `videoProcessing = true`
3. The indicator permanently shows the processing message

**Fix:**
- Poll the video status endpoint (`GET /api/video/:videoId`) in FeedComposer when `videoProcessing` is true
- When video status becomes `ready`, update the indicator:
  - Change icon color to green (var(--sh-success))
  - Change text to "Video ready"
  - Set `videoProcessing = false`
- When video status is `failed`, show error state with red icon
- Add a checkmark SVG icon for the ready state (replacing the video camera icon)

**Files:**
- `frontend/studyhub-app/src/pages/feed/FeedComposer.jsx`

---

## 4. Comment Avatars

**Problem:** Comment sections show "AB" initials circle instead of user profile images.

**Current state:** The `Avatar` component in `FeedWidgets.jsx` already wraps `UserAvatar` and supports `avatarUrl`. The `CommentItem` component already passes `avatarUrl` from `comment.author.avatarUrl`. The `CommentInput` and `ReplyInput` components pass `username` and `role` but NOT `avatarUrl`.

**Fix:**
- In `CommentInput`, pass `user.avatarUrl` to the `Avatar` component
- In `ReplyInput`, pass `user.avatarUrl` to the `Avatar` component
- Verify the backend comment API includes `avatarUrl` in the author select (it likely already does since `CommentItem` uses it)

**Files:**
- `frontend/studyhub-app/src/pages/feed/CommentSection.jsx`

---

## 5. Supporters Page Premium Redesign

**Problem:** Current design is minimal -- plain text headings, basic cards, and a simple green-to-blue gradient hero. Needs a premium showcase feel.

**Design direction:** Premium showcase with animated gradients, glowing cards, particle effects.

### 5a. Hero Section
- Replace the flat gradient with an animated multi-color gradient background (purple/blue/teal/indigo) using CSS keyframes
- Add floating particle effect using CSS pseudo-elements (no JS library)
- Glowing text effect on the title with text-shadow animation
- Subtitle with a subtle fade-in

### 5b. Donor Leaderboard Cards
- Glass-morphism card style: `backdrop-filter: blur(12px)`, semi-transparent background
- Animated glow border on hover (box-shadow with color cycling)
- Top 3 donors get special treatment:
  - #1: Gold glow border with pulsing animation
  - #2: Silver glow border
  - #3: Bronze glow border
- Rank badge with gradient background instead of outline border
- Donation amount with a subtle shimmer effect

### 5c. Pro Members Grid
- Glass-morphism cards matching donor cards
- Badge shimmer animation on the plan label
- Hover lift effect with glow shadow

### 5d. CTA Section
- Gradient background card with glass effect
- Primary CTA button with pulse-glow animation
- Outline button with border gradient

### 5e. Empty States
- Animated gradient border around the empty state container
- Pulsing heart icon
- Glowing CTA button

### 5f. CSS Implementation
- All animations via CSS `@keyframes` in a `<style>` tag within the component (or inline keyframe injection via `useEffect`)
- No external animation libraries
- Respect `prefers-reduced-motion` media query for accessibility
- All colors use CSS custom property tokens where possible, with specific palette colors for the premium effects (gold, silver, bronze gradients)

**Files:**
- `frontend/studyhub-app/src/pages/supporters/SupportersPage.jsx`

---

## Architecture Notes

- No new database tables or migrations needed
- No new backend endpoints needed
- All changes are frontend-only except verifying the comment API returns avatarUrl (it already does)
- Video status polling reuses existing `GET /api/video/:id` endpoint

## Testing Plan

- Manual verification of Disclaimer and Cookie Policy iframe loading
- Manual verification of video upload -> processing -> ready flow in FeedComposer
- Manual verification of comment avatars showing profile images
- Visual review of Supporters page in dark mode
- Run `npm --prefix frontend/studyhub-app run lint` after all changes
- Run `npm --prefix frontend/studyhub-app run build` to verify no build errors
