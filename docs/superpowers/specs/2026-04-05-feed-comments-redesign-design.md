# Feed Card + Comments Redesign + Termly Bug Fix

**Date:** 2026-04-05
**Status:** Approved

## Summary

Redesign feed cards and comment sections across StudyHub to follow a Facebook-inspired layout (Approach B: Facebook structure + StudyHub identity). Fix Termly embed integration for Disclaimer and Cookie Policy pages. Add 3-level comment nesting, comment editing, and a Share button to feed posts.

## Scope

### In Scope
- Feed card layout restructure (Facebook-style stats bar + action bar)
- Comment section redesign across Feed, Sheets, and Notes pages
- 3-level deep comment threading (up from 1-level)
- Share button on feed posts (copy link to clipboard)
- Fix like/dislike icons to render fully with proper thumbs-down SVG
- Fix Termly embed loading for Disclaimer and Cookie Policy pages
- All colors via CSS custom property tokens (zero hardcoded hex)
- UserAvatar component used in all comment avatars
- Comment editing with 15-minute edit window (matches messaging system pattern)

### Out of Scope

- Emoji reactions (future team work)
- External sharing (social media)
- Feed algorithm changes

## Feed Card Design

### Layout Structure (top to bottom)
1. **Author row**: UserAvatar (42px) | username (link) | type badge pill (POST/SHEET/NOTE/ANNOUNCEMENT) | timestamp | menu dots button
2. **Content area**: Title (h3, if present) | body text (MentionText) | attachments/video
3. **Stats bar**: Left side shows reaction icon + count. Right side shows "X comments" and "Y shares" as clickable text links. Separated by top/bottom borders using `--sh-border`.
4. **Action bar**: 4 equal-width buttons, each with 20px SVG icon + label text:
   - Like (thumbs-up outline, fills with `--sh-brand` when active)
   - Dislike (proper thumbs-down SVG, fills with `--sh-danger` when active)
   - Comment (speech bubble icon, toggles comment section)
   - Share (share/upload icon, copies link, shows toast)
5. **Comment section**: Opens inline below action bar

### Sheet and Note Cards
- Sheet cards keep "Helpful" / "Needs work" instead of Like/Dislike (existing behavior)
- Note cards keep "Read note" link
- Comment sections on sheet viewer and note viewer pages adopt the new comment design

## Comment Section Design

### Shared Across All Contexts (Feed, Sheets, Notes)

**Comment input:**
- UserAvatar (34px) + pill-shaped container with `--sh-soft` background, 20px border-radius
- Textarea inside with placeholder "Write a comment..."
- Character counter (0/500) and image attachment button

**Comment bubble:**
- UserAvatar + content column
- Content has pill background (`--sh-soft`), 16px border-radius
- Author name (bold, `--sh-text`) + comment text (`--sh-subtext`)
- Image attachments render below text inside the bubble

**Comment actions (text links below bubble):**
- Like | Dislike | Reply | timestamp
- Active Like uses `--sh-brand`, active Dislike uses `--sh-danger`
- Show reaction count inline when > 0 (e.g., "Like 3")

### 3-Level Nesting

| Level | Avatar Size | Indent | Reply Button |
|-------|------------|--------|-------------|
| 1 (top) | 34px | 0 | Yes |
| 2 | 28px | 20px left margin + 2px left border (`--sh-border`) | Yes |
| 3 (deepest) | 24px | 20px left margin + 2px left border (`--sh-border`) | No |

- Level 3 comments cannot be replied to - replies flatten into the level 3 thread
- Each level's replies are collapsible: "View X more replies" toggle
- Backend `parentId` already supports nesting; frontend currently flattens to 1 level. Change frontend rendering to recursively render up to 3 levels.
- Backend comment fetch should return nested replies in the response (already does via `replies` array).

### Note-Specific Additions
- Inline anchor comments keep their existing anchor UI (highlight, resolve/unresolve)
- The comment bubble and action link styling adopts the new design
- Resolve button appears as an additional action link for note owners

## Comment Editing

### Behavior (matches existing messaging system pattern)

- **Edit window**: 15 minutes from comment creation. After 15 minutes, the Edit action disappears.
- **Who can edit**: Only the comment author, within the edit window.
- **UI**: "Edit" text link appears in comment actions (Like | Dislike | Reply | Edit | timestamp) for own comments within the window.
- **Edit mode**: Clicking Edit replaces the comment bubble text with an inline textarea pre-filled with the current content. Shows Save and Cancel buttons below.
- **Edited indicator**: After saving, comment displays "(edited)" next to the timestamp in `--sh-muted` color.
- **Database**: Uses existing `updatedAt` field on comment records. Frontend compares `updatedAt !== createdAt` to show the edited indicator.

### Backend Endpoints (new)

Add PATCH endpoints for comment editing across all three contexts:

- `PATCH /api/feed/posts/:id/comments/:commentId` - Edit feed comment
- `PATCH /api/sheets/:id/comments/:commentId` - Edit sheet comment
- `PATCH /api/notes/:id/comments/:commentId` - Extend existing endpoint (currently only handles resolve/unresolve) to also support content editing

All PATCH handlers:

- Validate the user is the comment author
- Check the 15-minute edit window (`createdAt` + 15 min > now)
- Validate content length (1-500 chars)
- Update `content` and `updatedAt` fields
- Use `sendError` with appropriate `ERROR_CODES`
- Use existing `commentLimiter` rate limiter

## Share Feature

**Feed posts only (for now):**
- Share button in action bar copies `${window.location.origin}/feed?post=${postId}` to clipboard
- Shows a toast notification: "Link copied to clipboard"
- Share count tracked in a new `shareCount` field on FeedPost (optional - can be deferred if no backend table exists)
- For MVP: share count displayed but not persisted (always 0). Can add persistence later.

## Termly Bug Fix

### Root Cause
`DisclaimerPage.jsx` and `CookiePolicyPage.jsx` create a `<div name="termly-embed" data-id="UUID">` and wait for Termly to populate it. But the Termly embed initialization script is never loaded - only the resource blocker script is in `index.html`.

### Fix
Load the Termly embed script dynamically in the Disclaimer and Cookie Policy pages:
- Inject `<script src="https://app.termly.io/embed.min.js" data-auto-block="on">` when the component mounts
- Keep the existing `MutationObserver` + timeout fallback as a safety net
- Clean up the script tag on unmount

## Video Flash Bug Fix

### Root Cause
When clicking play on a feed video, the browser's native controls trigger playback immediately while the video stream is still loading. The transition from poster thumbnail to the first decoded video frame creates a brief visual artifact (flash/corrupted frame). `preload="metadata"` only loads metadata, not actual video frames.

### Fix
In `FeedCard.jsx` (FeedVideoPlayer) and `AnnouncementMedia.jsx`:
- Add `onPlay` and `onWaiting` handlers to show a loading overlay (spinner + thumbnail background) during initial buffering
- Add `onCanPlay` / `onPlaying` handler to hide the overlay once the first frame is ready
- Keep the poster/thumbnail visible until the video can actually render frames
- This prevents the black/corrupted flash between poster and first video frame

### Files
- `frontend/studyhub-app/src/pages/feed/FeedCard.jsx` - FeedVideoPlayer section
- `frontend/studyhub-app/src/components/AnnouncementMedia.jsx` - same fix

## Icon Fixes

**Like icon (thumbs-up):** Use a clean outline SVG that fills solid when active. 20px in action bar, 14px in comment actions.

**Dislike icon (thumbs-down):** Use a dedicated thumbs-down SVG path (NOT a rotated/flipped thumbs-up). Must be visually distinct and properly oriented. Same sizes as like icon.

## Styling Rules

- All colors use `var(--sh-*)` CSS custom property tokens
- No hardcoded hex/rgb values anywhere
- Use existing tokens: `--sh-brand`, `--sh-danger`, `--sh-text`, `--sh-subtext`, `--sh-muted`, `--sh-border`, `--sh-soft`, `--sh-surface`, `--sh-bg`
- Font sizes: 15px author name, 14px content, 13px comments, 12px action links, 11px timestamps
- UserAvatar component required for all avatar displays

## Files to Modify

### Frontend
- `frontend/studyhub-app/src/pages/feed/FeedCard.jsx` - restructure to Facebook layout
- `frontend/studyhub-app/src/pages/feed/CommentSection.jsx` - full redesign with 3-level nesting
- `frontend/studyhub-app/src/pages/feed/feedConstants.js` - update/add style functions
- `frontend/studyhub-app/src/pages/sheets/viewer/SheetCommentsPanel.jsx` - adopt new comment design
- `frontend/studyhub-app/src/pages/notes/NoteCommentSection.jsx` - adopt new comment design
- `frontend/studyhub-app/src/pages/legal/DisclaimerPage.jsx` - fix Termly embed
- `frontend/studyhub-app/src/pages/legal/CookiePolicyPage.jsx` - fix Termly embed

### Backend

- `backend/src/modules/feed/feed.social.controller.js` - add PATCH handler for comment editing, adjust nesting in replies
- `backend/src/modules/sheets/sheets.social.controller.js` - add PATCH handler for comment editing
- `backend/src/modules/notes/notes.controller.js` - extend existing PATCH to support content editing
- `backend/src/modules/feed/feed.social.routes.js` (or equivalent route file) - add PATCH route
- `backend/src/modules/sheets/sheets.social.routes.js` (or equivalent route file) - add PATCH route
- No new database tables or migrations required (parentId already supports multi-level, updatedAt already exists)

## Testing

- Visual verification of feed cards on feed page
- Comment posting, replying at all 3 levels
- Like/dislike toggle on both posts and comments
- Share button copies link + toast appears
- Comment editing within 15-minute window, "(edited)" indicator after save
- Edit action hidden after 15-minute window expires
- Disclaimer and Cookie Policy pages load Termly content inline
- Icons render fully at all sizes
- Dark theme color token compliance (no hardcoded colors)
