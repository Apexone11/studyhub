# Sub-project C: Feed Algorithm + AI Sheet Generation Improvements

**Date:** 2026-04-05
**Scope:** Weighted engagement feed scoring, AI sheet generation truncation handling, subscription enforcement verification

---

## 1. Weighted Engagement Feed Algorithm

**Problem:** Main feed is pure reverse chronological. Popular content gets buried by new but low-quality posts.

**Solution:** Score all feed items with a weighted formula and sort by score descending.

### Scoring Formula

```
score = (likes * 3) + (dislikes * -1) + (comments * 5) + (forks * 8) + recencyBoost
```

Where `recencyBoost = max(0, 1 - ageHours / 720) * 15` (decays linearly over 30 days, worth up to 15 points for brand-new content).

### Implementation

**Modify:** `backend/src/modules/feed/feed.list.controller.js`

The main feed endpoint fetches posts, sheets, notes, and announcements in parallel. After merging them into a single array, apply the scoring function before returning:

```javascript
function scoreFeedItem(item) {
  const likes = item.reactionSummary?.likes || item.stars || 0
  const dislikes = item.reactionSummary?.dislikes || 0
  const comments = item.commentCount || 0
  const forks = item.forkCount || 0
  const ageHours = (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60)
  const recencyBoost = Math.max(0, 1 - ageHours / 720) * 15
  return (likes * 3) + (dislikes * -1) + (comments * 5) + (forks * 8) + recencyBoost
}
```

Apply after merging: `merged.sort((a, b) => scoreFeedItem(b) - scoreFeedItem(a))`

### For You Enhancement

**Modify:** `backend/src/modules/feed/feed.discovery.controller.js`

In the `/for-you` endpoint, add score multipliers:
- Content from enrolled courses: 2x score
- Content from followed users: 1.5x score
- Already interacted (liked/commented): 0.3x (deprioritize seen content)
- Mix in 20% trending content from outside courses

**Files:**
- `backend/src/modules/feed/feed.list.controller.js`
- `backend/src/modules/feed/feed.discovery.controller.js`

---

## 2. AI Sheet Generation - Truncation Handling

**Problem:** Sheet generation uses 12,288 max_tokens. Complex sheets hit this limit and get cut off, producing incomplete HTML. No detection or recovery mechanism exists.

### 2a. Increase Max Tokens

Bump `MAX_OUTPUT_TOKENS_SHEET` from 12,288 to 16,384 in `ai.constants.js`. This gives ~33% more room for complex sheets.

### 2b. Truncation Detection (Backend)

After streaming completes, check if the response was truncated:
- Anthropic SDK provides `stop_reason` in the final message. If `stop_reason === 'max_tokens'`, the response was cut off.
- Send a new SSE event `{ type: 'truncated' }` to the frontend so it knows the response was incomplete.
- Save `metadata: { partial: true, truncated: true }` on the AI message record.

### 2c. Continue Mechanism (Backend)

Add logic in the message endpoint: if the last assistant message has `metadata.truncated === true` and the user sends a follow-up, automatically prepend a system instruction: "Your previous response was cut off at the token limit. Continue EXACTLY where you left off. Do NOT repeat any content that was already generated."

### 2d. Frontend Truncation UI

In `useAiChat.js`, handle the `truncated` SSE event:
- Show a "Response was cut off" banner below the message
- Add a "Continue generating" button that sends a pre-filled message to continue

In `AiSheetPreview.jsx`, detect incomplete HTML:
- Check if response contains `<!DOCTYPE` or `<html` but is missing `</html>`
- Show warning: "This sheet may be incomplete. Click Continue to finish generating."

### 2e. Subscription Daily Limits

The current limits in `ai.constants.js`:
```
default: 10, verified: 20, donor: 60, pro: 120, admin: 200
```

Update to match what users expect:
```
default: 30, verified: 60, pro: 120, admin: 200
```

Remove donor tier from AI limits (donors get video perks, not AI perks). Simplify to 3 tiers: free (30), verified/pro (60/120), admin (200).

**Files:**
- `backend/src/modules/ai/ai.constants.js`
- `backend/src/modules/ai/ai.service.js`
- `frontend/studyhub-app/src/lib/useAiChat.js`
- `frontend/studyhub-app/src/components/ai/AiSheetPreview.jsx`

---

## Testing Plan

- Run `npm --prefix backend run lint`
- Run `npm --prefix frontend/studyhub-app run lint`
- Run `npm --prefix frontend/studyhub-app run build`
- Manual: verify feed reordering with engagement-scored items
- Manual: test AI sheet generation with a complex prompt to trigger truncation
- Manual: verify "continue" mechanism works after truncation
