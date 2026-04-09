# Phase 5 — Study Group Trust and Safety

Hand-off plan for VS Code Claude. Builds on the Phase 4 Track A study groups redesign. Every feature here makes groups safe enough to market publicly without worrying that one bad actor ruins the experience for everyone.

**Design philosophy:** mirror the patterns Facebook, Discord, and Reddit have settled on after years of moderation at scale. Reporter anonymity is an invariant. Graceful degradation is mandatory on every new DB call. Every mod action is audited with actor IP and user agent for forensic accountability.

---

## What Is Already Shipped (from VS Code Claude sessions)

These commits are on `local-main` and should NOT be re-implemented:

| Commit | What it did |
|--------|-------------|
| `35409d5` | Label fix: Group Avatar vs Background copy clarified in edit modal |
| `0389e45` | Schema + migration `20260409000002`: GroupReport, GroupAppeal, GroupAuditLog, GroupBlock tables. StudyGroup gains moderationStatus, warnedUntil, lockedAt, deletedAt, deletedById, memberListPrivate, requirePostApproval. StudyGroupMember gains joinMessage, mutedUntil, mutedReason, mutedById, strikeCount, lastStrikeAt. GroupDiscussionPost gains status, removedAt, removedById. |
| `f4aa3b4` | Backend report service (createReport, resolveReport, maybeEscalate, getHiddenGroupIdsForReporter, writeAuditLog), report routes (POST /:id/report, POST /:id/appeal, GET /:id/my-report), admin review endpoints (GET/PATCH /api/admin/group-reports), reporter hiding filter on listGroups and getGroup, formatGroup surfaces moderation fields, rate limiters (groupReportLimiter 20/h, groupAppealLimiter 5/h, groupJoinLimiter 30/h) |
| `46f5232` | 24 passing Vitest unit tests for the report service |
| `efe1286` | Frontend: ReportGroupModal.jsx, IconFlag + IconLock icons, report button on GroupDetailView, moderation banners (warned amber, locked red) |

---

## Phase A — Remaining Core (3 commits)

### A.6 — Admin Group Reports Tab

**Why:** Admins need a UI to triage reports. The backend endpoints exist (`GET /api/admin/group-reports`, `PATCH /api/admin/group-reports/:id`) but the frontend tab does not.

**Files:**

1. `frontend/studyhub-app/src/pages/admin/GroupReportsTab.jsx` (new)
   - Lazy loaded tab in the admin page, same pattern as `RevenueTab.jsx`.
   - Fetches `GET /api/admin/group-reports?status=pending` via `useFetch` with `swr: 15_000`.
   - Each row: group name (link), reporter username + avatar, reason badge, details preview, time ago, action buttons.
   - Action buttons: Dismiss (ghost), Warn (amber), Lock (red outline), Delete (red solid). Each calls `PATCH /api/admin/group-reports/:id` with `{ action, resolution }`.
   - Filter chips at top: Pending (default), Escalated, Warned, Locked, Deleted, All.
   - Appeal sub-section: when a group has an open appeal, show it inline with Accept/Reject buttons. Accept calls `PATCH` with action=dismiss, Reject does nothing (appeal stays rejected, no further action).
   - Empty state: "No pending reports. Your community is in good shape."
   - All colors via `var(--sh-*)`. Use `createPortal` if any confirmation modals are needed.

2. `frontend/studyhub-app/src/pages/admin/AdminPage.jsx` (edit)
   - Add "Group Reports" tab with `IconFlag` icon, lazy import `GroupReportsTab`.
   - Badge: show pending report count from a lightweight `GET /api/admin/group-reports?status=pending&limit=0` that returns `{ total }`.

**Tests:** Manual smoke on localhost. Confirm Pending/Escalated filters work, Dismiss removes from list, Warn shows amber confirmation.

### A.7 — Private Group Join Notifications

**Why:** When someone requests to join a private group, the creator and mod team should be notified so the request does not sit unnoticed.

**Files:**

1. `backend/src/modules/studyGroups/studyGroups.controller.js` (edit `joinGroup`)
   - After creating a `StudyGroupMember` row with `status: 'pending'`, fire `createNotifications` to every user with `role: 'admin'` or `role: 'moderator'` on that group PLUS the `createdById`. Deduplicate.
   - Notification: `type: 'group_join_request'`, `message: '"{username}" asked to join {groupName}'`, `linkPath: '/study-groups/{id}/members?tab=pending'`, `priority: 'medium'`.
   - Wrap in try/catch. Best effort, never block the join request.

2. `backend/test/studyGroups.joinNotify.test.js` (new)
   - Mock test: confirm notification fires to creator + mods, does not fire for public groups, swallows errors gracefully.

**Capacity:** Notification table handles this with zero concern at any user count. The query to find admins/mods is an indexed scan on (groupId, role, status).

---

## Phase B — Group Level Safety Features (5 features, ~8 commits)

### B.1 — Block Users From Groups

Group owners/mods can ban a user from a group. Blocked user cannot rejoin, sees "You are not able to join this group."

**Backend:**
- `POST /api/study-groups/:id/block` body: `{ userId, reason }`. Creates `GroupBlock` row. Removes existing `StudyGroupMember` row if present. Writes audit log.
- `GET /api/study-groups/:id/blocks` (owner/mod only). Lists blocked users.
- `DELETE /api/study-groups/:id/block/:userId`. Unblocks.
- `joinGroup` check: before creating a member row, query `GroupBlock` for (groupId, userId). If exists, return 403 with `"You are not able to join this group."`.
- Add to `studyGroups.controller.js` or create `studyGroups.blocks.routes.js`.

**Frontend:**
- Members tab: each non-owner member row gets a "Block" option in the actions menu (three dot menu or inline button). Clicking opens a small confirmation with an optional reason field.
- Blocked members sub-tab: list of blocked users with "Unblock" button.
- Join button on group detail: if the user is blocked, disable the button and show the message.

**Tests:** Block creates row + removes membership. Blocked user cannot rejoin. Unblock restores join ability.

### B.2 — Mute Users Inside a Group

Softer than block. Muted user can read but cannot post, comment, or upload for N days.

**Backend:**
- `POST /api/study-groups/:id/mute` body: `{ userId, durationDays, reason }`. Updates `StudyGroupMember` row: `mutedUntil = now + durationDays`, `mutedReason`, `mutedById`. Writes audit log.
- `DELETE /api/study-groups/:id/mute/:userId`. Clears mute fields.
- Every write endpoint (create resource, create discussion, create reply, upload) checks `member.mutedUntil > now`. If muted, return 403: `"You are muted in this group until {date}."`.
- The mute check should be a shared helper: `assertNotMuted(member)` in `studyGroups.helpers.js`.

**Frontend:**
- Members tab: "Mute" option in actions menu, opens a modal with duration picker (1 day, 3 days, 7 days, 30 days) and optional reason.
- Muted badge on the member card.
- When a muted user tries to post, the composer shows a disabled state with the unmute date.

**Tests:** Mute blocks posting. Mute expires after duration. Unmute restores posting.

### B.3 — Member List Privacy Toggle

Private groups can hide their member roster from non-members entirely.

**Backend:**
- `memberListPrivate` column already exists on `StudyGroup` (migration `20260409000002`).
- `updateGroup` already accepts it (wired in Phase A.3 controller changes).
- `getGroupMembers` endpoint: if `group.memberListPrivate` is true and the caller is not a member, return 403 with `"Member list is private."`.
- `formatGroup` already surfaces the field.

**Frontend:**
- Edit Group modal: add a toggle "Hide member list from non-members" under the Privacy section.
- Group detail: if `memberListPrivate` and user is not a member, the Members tab shows "This group keeps its member list private" instead of the roster.

### B.4 — Join Gate Message

When requesting to join a private group, the user can include a short "why I want to join" message. Admin sees it in the pending members list.

**Backend:**
- `joinGroup` controller: accept optional `joinMessage` (string, max 300 chars, strip HTML) in the request body. Store in the `StudyGroupMember.joinMessage` column (already exists from migration).
- Members endpoint (pending tab): include `joinMessage` in the response.

**Frontend:**
- Join button on a private group detail: instead of instant request, open a small modal with a textarea "Tell the group why you want to join (optional)" and a Submit button.
- Pending members tab (owner/mod view): show the `joinMessage` under each pending member's name.

### B.5 — Post Approval Queue

For groups with spam problems, owner toggles "posts require approval before they appear."

**Backend:**
- `requirePostApproval` column already exists on `StudyGroup`.
- `createDiscussion`: if `group.requirePostApproval` is true AND the author is not an admin/mod, set `status: 'pending_approval'` instead of `'published'`.
- New endpoint: `PATCH /api/study-groups/:id/discussions/:postId/approve` (owner/mod only). Flips status to `'published'`. Writes audit log. Notifies the author.
- New endpoint: `PATCH /api/study-groups/:id/discussions/:postId/reject` (owner/mod only). Flips status to `'removed'`, sets `removedAt` + `removedById`. Notifies the author.
- List discussions: exclude `status: 'pending_approval'` for non-mods. Show them with a "Pending" badge for mods.

**Frontend:**
- Edit Group modal: toggle "Require post approval".
- Discussions tab (mod view): pending posts appear with an amber "Awaiting approval" badge and Approve/Reject buttons.
- Author view: their pending post shows "Your post is awaiting approval" with a subtle pending indicator.

---

## Phase C — Advanced Safety (4 features, ~6 commits)

### C.1 — Two Strikes Auto Ban

If a user's post gets removed twice by mods within 30 days, they are auto-removed from the group.

**Backend:**
- When a mod removes a discussion post (reject or manual remove), increment `StudyGroupMember.strikeCount` and set `lastStrikeAt = now`.
- If `strikeCount >= 2` and `lastStrikeAt` is within 30 days of the first strike, auto-remove the member (delete `StudyGroupMember` row or set `status: 'removed'`). Write audit log: `group.auto_ban`. Notify the user.
- Strike counter resets after 30 days of no strikes (check at removal time, not on a cron).
- Add to `studyGroups.discussions.controller.js` in the reject/remove handler.

### C.2 — Link Safety Check (Static Blocklist v1)

Any URL posted in a resource or discussion is checked against a static blocklist of known malicious domains.

**Backend:**
- `backend/src/lib/linkSafety.js` (new): exports `checkUrlSafety(url)` that extracts the hostname and compares against a hardcoded Set of ~200 known phishing/malware domains (sourced from public blocklists like `urlhaus-filter`).
- Returns `{ safe: true }` or `{ safe: false, reason: 'Known malicious domain' }`.
- Called in `createDiscussion` and `POST /resources` when the body or URL field contains links. If unsafe, return 400: `"The link you included has been flagged as potentially harmful."`.
- Future: swap the static list for Google Safe Browsing API (free for <10K checks/day) when traffic justifies it.

### C.3 — Audit Log UI for Group Mods

Group admins/mods can view a log of every moderation action taken in their group.

**Backend:**
- `GET /api/study-groups/:id/audit-log` (owner/mod only). Paginated, returns `GroupAuditLog` rows with actor username + action + context + createdAt. Strips IP/UA from the response (those are for platform admins only, not group mods).
- Rate limited: `readLimiter`.

**Frontend:**
- New tab in group detail: "Audit Log" (visible only to owner/mods).
- Simple chronological list: avatar, "{username} {action} {target}" with relative timestamps.
- Actions rendered as human readable strings: "blocked {user}", "muted {user} for 7 days", "approved a post by {user}", "removed a post by {user}", "changed group background", etc.

### C.4 — Report Cooldown (Limited Visibility)

After someone is reported, their next group or post has a soft delay before it is visible to non-members, giving trust and safety a chance to review.

**Backend:**
- When a user has an active report filed against ANY group they own, new groups they create get `moderationStatus: 'under_review'` instead of `'active'` for 48 hours.
- `under_review` groups are visible to the creator and members but hidden from search and the public feed.
- After 48 hours with no admin action, the status auto-transitions to `'active'` (checked at query time, not a cron: `WHERE moderationStatus = 'under_review' AND createdAt < now - 48h` updates on read).
- Add the check to `createGroup` in the controller.

---

## Phase D — Infrastructure Hardening (3 items, ~3 commits)

### D.1 — Rate Limit Audit

Audit every study group endpoint and ensure it has an appropriate rate limiter from `rateLimiters.js`. Focus on:
- `POST /join` (attach `groupJoinLimiter` already created)
- `POST /resources` and `POST /resources/upload` (already have `groupMediaUploadLimiter`)
- `POST /discussions` and `POST /discussions/:id/replies`
- `PATCH /discussions/:id/approve` and `/reject`
- `POST /block` and `POST /mute`

Add any missing limiters following the `<context><Action>Limiter` naming convention.

### D.2 — Mod Session Tracking

Every mod action endpoint (block, mute, remove post, approve, reject, resolve report, delete group) must call `writeAuditLog` with the full `req` object so IP + UA are captured. Audit the existing Phase A.3 code and extend to cover B.1 through C.1 actions.

Verify: `captureRequestFingerprint(req)` is called in every `writeAuditLog` invocation. If a route handler forgets to pass `req`, the audit row still saves with null IP/UA (non-fatal, but flag in code review).

### D.3 — Shadow Delete Audit

Verify that every "delete" operation in the study groups module uses soft delete (`deletedAt` or `removedAt` timestamps) rather than hard SQL DELETE. Items to check:

- Group deletion (already soft: `deletedAt` column)
- Discussion post removal (already soft: `removedAt`)
- Group resource removal (check if it uses a `deletedAt` or hard delete; add column if needed)
- Member removal on block/auto-ban (check if it hard-deletes the row or sets `status: 'removed'`)

For any hard-delete found, convert to soft-delete with a 30 day retention window. Add a note in CLAUDE.md under "Architecture Notes" documenting the soft-delete convention.

---

## Ordering

Recommended execution order for VS Code Claude, one branch per chunk:

1. A.6 (admin tab) — unlocks the ability to actually triage reports
2. A.7 (join notifications) — small, quick, high value
3. B.1 (block) + B.2 (mute) — shipped together, they share UI patterns
4. B.3 (member privacy) — tiny toggle, 30 min
5. B.4 (join gate) — small modal + backend tweak
6. B.5 (post approval) — medium, new status flow
7. C.1 (auto ban) — hooks into B.5 reject flow
8. C.2 (link check) — standalone utility
9. C.3 (audit log UI) — backend exists, just needs frontend tab
10. C.4 (report cooldown) — small backend check in createGroup
11. D.1 through D.3 — infra sweep, do in one commit

Each step should be committed independently on `local-main`. Run `npm --prefix backend test` and `npm --prefix frontend/studyhub-app run lint` after each.
