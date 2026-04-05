# Beta v2.0.0 Release Log

## Date: 2026-04-04

### Subscription System Overhaul

**Root Cause Fixed: Invalid Date in Prisma upsert**
- All 4 subscription write paths (admin sync, user sync, webhook checkout, webhook update) were passing `new Date(undefined * 1000)` which produces `Invalid Date`
- Prisma rejects `Invalid Date` for DateTime fields, causing silent write failures
- Fixed with null-safe conversion: `sub.current_period_start ? new Date(sub.current_period_start * 1000) : null`
- This was the root cause of ALL subscription detection failures

**Webhook Error Handling**
- Webhook handler now returns 500 on DB failure (was returning 200, preventing Stripe from retrying)
- Sync endpoints now surface actual Prisma error messages instead of swallowing them

**PricingPage Redesign**
- Complete rewrite with proper subscribed state detection
- Shows "You are on Pro" badge and plan card when subscribed
- Subscribe buttons hidden for Pro users, show "Subscribed (Monthly/Yearly)"
- Special Offers, Referral Codes, Gift Subscription, Redeem Code moved FROM Settings
- Donation section with custom amounts
- FAQ accordion
- All colors use `--sh-*` CSS tokens (dark mode compatible)
- Entrance animations (fadeInUp, staggerEntrance)

**SubscriptionTab Redesign**
- Simplified from 1335 to 553 lines
- Plan status card with plan image (not letter "P")
- Usage dashboard: 4 metric cards with progress bars (sheets, AI messages, groups, video storage)
- Quick actions: Manage Payment Method, Cancel, Reactivate
- Payment history table with pagination and receipt links
- Sync recovery link at bottom

**SupportersPage Dark Mode**
- All hardcoded hex colors replaced with `--sh-*` tokens
- Hero gradient uses CSS variables

**Admin Revenue Tab**
- Sync now shows actual error message when it fails
- MetricCard colors fixed from hardcoded "white" to `var(--sh-heading)`

### Badge System

**DonorBadge Component Created**
- Green gradient "Supporter" badge matching ProBadge pattern
- Props: isDonor, donorLevel (bronze/silver/gold), size (xs/sm/md)
- Tooltip shows level-specific text

**Badges Wired Into Profile**
- UserProfilePage now uses ProBadge and DonorBadge components
- Replaced inline hardcoded badge styles

### Feed Fixes

**For You Feed**
- Fixed `undefined` values in `notIn` array causing Prisma query failure
- Added `.filter(Boolean)` to exclude undefined/null from blocked user IDs
- Error messages now surface actual backend error instead of generic "Could not load"
- Fixed follow button bug (was setting isFollowing=true in error handler)

### Block/Mute System

**New Endpoints Implemented**
- `POST /api/users/:username/block` - Block user (removes follows in both directions)
- `DELETE /api/users/:username/block` - Unblock user
- `POST /api/users/:username/mute` - Mute user (one-directional)
- `DELETE /api/users/:username/mute` - Unmute user
- All rate limited, idempotent, with graceful degradation

### Video Player

- Volume, muted state, and playback speed now persist via localStorage
- Restored on next page load

### Subscription Enforcement (from laptop session)

- Fork route now checks upload quota
- Study group privacy change checks private group limit
- AI message limits synced (10 free, 60 donor, 120 pro)
- Video duration display corrected (30 min free, not 5 min)
- getUserPlan/userBadges/getUserSubscription all include past_due as active

### Notes Rich Text Editor Upgrade

- Replaced markdown textarea with TipTap WYSIWYG editor
- Reuses existing RichTextEditor component from sheets
- Added `themeAware` prop for light/dark mode adaptation
- Backward compatible: detects markdown content and converts to HTML on load
- Full toolbar: headings, formatting, lists, code blocks, math (KaTeX), images, links, undo/redo
- CSS theme overrides in richTextEditor.css for note-specific styling

### Files Changed

Backend:
- `payments.routes.js` - Webhook 500 on failure, sync error surfacing, debug endpoint, user sync
- `payments.service.js` - Invalid Date fix in all handlers
- `feed.discovery.controller.js` - For You undefined fix, error surfacing
- `users.controller.js` - Block/mute endpoints
- `users.routes.js` - Block/mute routes, cleaned unused imports

Frontend:
- `PricingPage.jsx` - Complete redesign
- `SubscriptionTab.jsx` - Simplified redesign with plan images
- `SupportersPage.jsx` - Dark mode tokens
- `RevenueTab.jsx` - Error surfacing, color fix
- `DonorBadge.jsx` - New component
- `UserProfilePage.jsx` - ProBadge + DonorBadge wired in
- `ForYouSection.jsx` - Follow bug fix, error display
- `StudyHubPlayer.jsx` - Volume persistence
- `RichTextEditor.jsx` - themeAware prop
- `EditorToolbar.jsx` - themeAware prop
- `NoteEditor.jsx` - TipTap WYSIWYG upgrade
- `notesComponents.jsx` - HTML content renderer
- `notesConstants.js` - HTML word count
