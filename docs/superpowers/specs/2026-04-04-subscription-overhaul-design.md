# Subscription System Overhaul + Site Polish

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Fix subscription detection, redesign PricingPage/SubscriptionTab/SupportersPage, wire badges, fix ForYou feed, polish video player, fix admin revenue

---

## 1. Root Cause: Subscription DB Write Failure

**Symptom:** Stripe has active subscription for userId 8, but DB has `raw: null`. Admin sync shows "1 error(s)".

**Diagnosis:** The `prisma.subscription.upsert({ where: { userId } })` is failing. Prisma requires `where` to reference a `@unique` field. The schema has `@@unique([userId])` but the actual DB constraint may be missing or the migration partially failed.

**Fix:**
- Surface actual Prisma error in sync endpoints (not swallow it)
- In admin sync, log full error object (not just message)
- Add webhook error handling: return 500 on DB failure so Stripe retries
- After sync succeeds, frontend calls `refreshSession()` to update navbar

## 2. PricingPage Redesign

**Goal:** Professional pricing page like GitHub/Stripe. Subscribed users see plan management, not subscribe buttons.

**Layout:**
- Hero banner with `--sh-brand` gradient tokens
- If subscribed: "Your Plan" card with status, renewal, manage/cancel buttons
- If free: 3-column comparison (Free/Pro/Institution) with CTAs
- Special Offers section (moved from Settings) - free users only
- Gift + Referral section (moved from Settings) - all users
- Donation section
- FAQ accordion
- All colors use `--sh-*` tokens, entrance animations

## 3. SubscriptionTab Redesign

**Goal:** Clean plan dashboard (~400 lines vs current 1335).

**Layout:**
- Plan status card with badge
- Usage dashboard (4 metric cards with progress bars)
- Quick actions (portal, upgrade, cancel, reactivate)
- Payment history table with pagination
- Sync recovery link

**Removed:** Special Offers, Referral Codes, Gift Subscription, Redeem Code (moved to Pricing)

## 4. SupportersPage Dark Mode

- Replace all hardcoded hex with `--sh-*` tokens
- Hero gradient uses CSS variables
- Card/text colors use semantic tokens

## 5. Badge System

- Wire `ProBadge` into UserProfilePage, SearchResultItems, comment sections
- Create `DonorBadge` component (green, heart icon, same size variants)
- Replace all inline badge styles with components

## 6. ForYou Feed Fixes

- Fix follow button bug (sets true in error handler)
- Add toast notifications on follow/join
- Add retry button on error

## 7. Video Player Polish

- Volume/speed persistence via localStorage
- Processing state indicator
- Download button gated by `video.downloadable`

## 8. Admin Revenue Tab

- Fix sync error surfacing (log full error, show in UI)
- Revenue stats should query actual Payment/Subscription tables
- Show meaningful error when tables are empty vs errored

## 9. Documentation

- Update beta release log with all changes
