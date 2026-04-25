# Reference 08 — Block / Mute System Security

## Files to Read

- `backend/src/lib/social/blockFilter.js` — exports: `getBlockedUserIds`, `getMutedUserIds`, `blockFilterClause`, `hasBlocked`, `isBlockedEitherWay`
- `backend/src/modules/feed/feed.service.js` — uses block filter
- `backend/src/modules/search/search.routes.js` — user results must filter blocked users
- `backend/src/modules/messaging/messaging.routes.js` — DM creation must check block
- `backend/src/modules/users/users.routes.js` — user listing endpoints

---

## Check 8.1 — All Block/Mute Calls Wrapped in try-catch

**Rule per CLAUDE.md:** `getBlockedUserIds` and `getMutedUserIds` will throw if the `UserBlock`/`UserMute` tables are temporarily unavailable. EVERY call MUST be wrapped in try-catch with an empty array fallback.

**Violation (historical bug pattern #3 from CLAUDE.md):**

```js
// WRONG — will crash endpoint if UserBlock table unavailable
const blockedIds = await getBlockedUserIds(userId)
```

**Correct pattern:**

```js
// CORRECT
let blockedIds = []
try {
  blockedIds = await getBlockedUserIds(userId)
} catch {
  /* graceful degradation — show unfiltered content rather than crash */
}
```

**Grep for unguarded calls:**

```
await getBlockedUserIds\|await getMutedUserIds
```

For every match, verify it is inside a try-catch block. Any unguarded call is HIGH severity.

---

## Check 8.2 — Block Filtering is Bidirectional

**Rule:** If A blocks B, NEITHER A sees B's content NOR does B see A's content. Block is bidirectional.

**Verify in feed, search, and listings:**

```js
// CORRECT — both directions excluded
const blockedIds = await getBlockedUserIds(userId) // includes users who blocked YOU
const posts = await prisma.feedPost.findMany({
  where: { authorId: { notIn: blockedIds } },
})
```

**Verify** that `getBlockedUserIds` returns IDs in BOTH directions (not just users the requester has blocked, but also users who have blocked the requester).

---

## Check 8.3 — Mute Filtering is One-Directional

**Rule:** Muting is one-directional — only the muter's view is affected. The muted user still sees the muter's content.

**Verify in feed only** (mute should NOT affect search or user profile visibility):

```js
let mutedIds = []
try {
  mutedIds = await getMutedUserIds(userId)
} catch {
  /* degradation */
}
const posts = await prisma.feedPost.findMany({
  where: { authorId: { notIn: [...blockedIds, ...mutedIds] } },
})
```

---

## Check 8.4 — Endpoints That MUST Apply Block Filter

The following endpoints return user-related data and MUST apply block filtering:

| Endpoint                                       | Must Filter                   |
| ---------------------------------------------- | ----------------------------- |
| `GET /api/feed`                                | Block + Mute                  |
| `GET /api/search?q=`                           | Block (user results)          |
| `GET /api/users` (listings)                    | Block                         |
| `GET /api/messages/conversations`              | Block                         |
| `POST /api/messages/conversations` (DM create) | Block — reject if blocked     |
| `GET /api/study-groups/:id/members`            | Block                         |
| Notifications sent to users                    | Block — don't send to blocker |
| Comments / reactions visible to requester      | Block                         |

**For each of these endpoints:** grep for the route handler and verify `getBlockedUserIds` is called (with try-catch).

---

## Check 8.5 — Admin un-blockable (Decision #16)

**Rule (LOCKED):** Admin accounts CANNOT be blocked. An attempt to block an admin must be rejected with a 403.

**Verify in block creation endpoint:**

```js
// CORRECT
const target = await prisma.user.findUnique({ where: { id: targetId } })
if (target.role === 'admin') {
  return sendError(res, 403, 'Cannot block admin users', ERROR_CODES.FORBIDDEN)
}
```

**Admin IS mutable.** Muting an admin is allowed. Only blocking is forbidden.

---

## Check 8.6 — Announcement Urgency Bypasses Mute (Decision #16 continued)

**Rule:** `Announcement.urgency` field on `Announcement` model. If `urgency === 'urgent'`, the announcement bypasses mute filters and is shown to everyone.

**Verify in notification dispatch logic:**

```js
// CORRECT — urgent bypasses mute
const mutedIds = announcement.urgency === 'urgent' ? [] : await getMutedUserIds(userId)
```

---

## Severity Reference for Block/Mute Issues

| Issue                                             | OWASP | Severity |
| ------------------------------------------------- | ----- | -------- |
| DM sent to user who blocked sender                | A01   | HIGH     |
| Feed shows posts from users who blocked requester | A01   | HIGH     |
| Unguarded `getBlockedUserIds` (no try-catch)      | A05   | HIGH     |
| Block not applied on user search results          | A01   | MEDIUM   |
| Admin blockable (Decision #16 violated)           | A01   | MEDIUM   |
| Mute applied to profile page (wrong scope)        | A01   | LOW      |
