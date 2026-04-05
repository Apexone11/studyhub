# Feed Card + Comments Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign feed cards and comment sections to Facebook-style layout, add 3-level comment nesting, comment editing, share button, fix video flash bug, and fix Termly embed loading.

**Architecture:** Build on existing component structure. FeedCard gets restructured layout (stats bar + action bar). CommentSection gets recursive 3-level rendering with editing. Backend gets PATCH endpoints for comment editing. Termly pages get proper script loading.

**Tech Stack:** React 19, Express 5, Prisma 6.x, CSS custom properties (--sh-* tokens), UserAvatar component

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/.../pages/feed/FeedCard.jsx` | Modify | Restructure to Facebook layout (stats bar, action bar, share) + fix video flash |
| `frontend/.../pages/feed/CommentSection.jsx` | Modify | Full redesign: pill bubbles, 3-level nesting, editing, proper icons |
| `frontend/.../pages/feed/feedConstants.js` | Modify | Add new style functions for Facebook layout |
| `frontend/.../pages/sheets/viewer/SheetCommentsPanel.jsx` | Modify | Adopt new comment bubble/action design |
| `frontend/.../pages/notes/NoteCommentSection.jsx` | Modify | Adopt new comment design, keep anchor/resolve features |
| `frontend/.../components/AnnouncementMedia.jsx` | Modify | Fix video flash bug |
| `frontend/.../pages/legal/DisclaimerPage.jsx` | Modify | Fix Termly embed script loading |
| `frontend/.../pages/legal/CookiePolicyPage.jsx` | Modify | Fix Termly embed script loading |
| `backend/src/modules/feed/feed.social.controller.js` | Modify | Add PATCH comment edit endpoint |
| `backend/src/modules/sheets/sheets.social.controller.js` | Modify | Add PATCH comment edit endpoint |
| `backend/src/modules/notes/notes.controller.js` | Modify | Extend PATCH to support content editing |
| `backend/src/modules/notes/notes.routes.js` | No change | PATCH route already exists |

**Frontend base path:** `frontend/studyhub-app/src`

---

### Task 1: Backend - Add Comment Edit Endpoints

**Files:**
- Modify: `backend/src/modules/feed/feed.social.controller.js`
- Modify: `backend/src/modules/sheets/sheets.social.controller.js`
- Modify: `backend/src/modules/notes/notes.controller.js`

- [ ] **Step 1: Add PATCH handler for feed comments**

In `backend/src/modules/feed/feed.social.controller.js`, add after the DELETE handler (after line ~360):

```javascript
// ── PATCH /posts/:id/comments/:commentId ── edit comment content
router.patch('/posts/:id/comments/:commentId', requireAuth, commentLimiter, async (req, res) => {
  try {
    const postId = Number(req.params.id)
    const commentId = Number(req.params.commentId)
    const { content } = req.body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return sendError(res, 400, 'Comment content is required.', ERROR_CODES.VALIDATION)
    }
    if (content.length > 500) {
      return sendError(res, 400, 'Comment must be 500 characters or fewer.', ERROR_CODES.VALIDATION)
    }

    const comment = await prisma.feedComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, postId: true, createdAt: true },
    })

    if (!comment || comment.postId !== postId) {
      return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)
    }
    if (comment.userId !== req.user.id) {
      return sendError(res, 403, 'You can only edit your own comments.', ERROR_CODES.FORBIDDEN)
    }

    const fifteenMinutes = 15 * 60 * 1000
    if (Date.now() - new Date(comment.createdAt).getTime() > fifteenMinutes) {
      return sendError(res, 403, 'Can only edit comments within 15 minutes.', ERROR_CODES.FORBIDDEN)
    }

    const updated = await prisma.feedComment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true, role: true, plan: true } },
      },
    })

    res.json(updated)
  } catch (err) {
    console.error('Edit feed comment error:', err)
    sendError(res, 500, 'Failed to edit comment.', ERROR_CODES.INTERNAL)
  }
})
```

Import `sendError` and `ERROR_CODES` at the top of the file if not already imported:
```javascript
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
```

- [ ] **Step 2: Add PATCH handler for sheet comments**

In `backend/src/modules/sheets/sheets.social.controller.js`, add after the DELETE handler (after line ~434):

```javascript
// ── PATCH /:id/comments/:commentId ── edit comment content
router.patch('/:id/comments/:commentId', requireAuth, commentLimiter, async (req, res) => {
  try {
    const sheetId = Number(req.params.id)
    const commentId = Number(req.params.commentId)
    const { content } = req.body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return sendError(res, 400, 'Comment content is required.', ERROR_CODES.VALIDATION)
    }
    if (content.length > 500) {
      return sendError(res, 400, 'Comment must be 500 characters or fewer.', ERROR_CODES.VALIDATION)
    }

    const comment = await prisma.sheetComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, sheetId: true, createdAt: true },
    })

    if (!comment || comment.sheetId !== sheetId) {
      return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)
    }
    if (comment.userId !== req.user.id) {
      return sendError(res, 403, 'You can only edit your own comments.', ERROR_CODES.FORBIDDEN)
    }

    const fifteenMinutes = 15 * 60 * 1000
    if (Date.now() - new Date(comment.createdAt).getTime() > fifteenMinutes) {
      return sendError(res, 403, 'Can only edit comments within 15 minutes.', ERROR_CODES.FORBIDDEN)
    }

    const updated = await prisma.sheetComment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true, role: true, plan: true } },
      },
    })

    res.json(updated)
  } catch (err) {
    console.error('Edit sheet comment error:', err)
    sendError(res, 500, 'Failed to edit comment.', ERROR_CODES.INTERNAL)
  }
})
```

Import `sendError` and `ERROR_CODES` at top if not already imported.

- [ ] **Step 3: Extend notes PATCH handler to support content editing**

In `backend/src/modules/notes/notes.controller.js`, modify the `updateNoteComment` function (lines 514-545) to also handle content editing:

```javascript
async function updateNoteComment(req, res) {
  try {
    const noteId = Number(req.params.id)
    const commentId = Number(req.params.commentId)
    const { resolved, content } = req.body

    const comment = await prisma.noteComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, noteId: true, createdAt: true },
    })

    if (!comment || comment.noteId !== noteId) {
      return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)
    }

    const data = {}

    // Handle resolve/unresolve (note owner or admin only)
    if (typeof resolved === 'boolean') {
      const note = await prisma.note.findUnique({ where: { id: noteId }, select: { userId: true } })
      if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
      if (req.user.id !== note.userId && req.user.role !== 'admin') {
        return sendError(res, 403, 'Only the note owner or admin can resolve comments.', ERROR_CODES.FORBIDDEN)
      }
      data.resolved = resolved
    }

    // Handle content editing (comment author only, 15-minute window)
    if (typeof content === 'string') {
      const trimmed = content.trim()
      if (trimmed.length === 0) {
        return sendError(res, 400, 'Comment content is required.', ERROR_CODES.VALIDATION)
      }
      if (trimmed.length > 500) {
        return sendError(res, 400, 'Comment must be 500 characters or fewer.', ERROR_CODES.VALIDATION)
      }
      if (comment.userId !== req.user.id) {
        return sendError(res, 403, 'You can only edit your own comments.', ERROR_CODES.FORBIDDEN)
      }
      const fifteenMinutes = 15 * 60 * 1000
      if (Date.now() - new Date(comment.createdAt).getTime() > fifteenMinutes) {
        return sendError(res, 403, 'Can only edit comments within 15 minutes.', ERROR_CODES.FORBIDDEN)
      }
      data.content = trimmed
    }

    if (Object.keys(data).length === 0) {
      return sendError(res, 400, 'Nothing to update.', ERROR_CODES.VALIDATION)
    }

    const updated = await prisma.noteComment.update({
      where: { id: commentId },
      data,
      include: {
        author: { select: { id: true, username: true, avatarUrl: true, role: true, plan: true } },
      },
    })

    res.json(updated)
  } catch (err) {
    console.error('Update note comment error:', err)
    sendError(res, 500, 'Failed to update comment.', ERROR_CODES.INTERNAL)
  }
}
```

- [ ] **Step 4: Verify backend runs**

Run: `npm --prefix backend run lint`
Expected: No new errors

- [ ] **Step 5: Commit backend changes**

```bash
git add backend/src/modules/feed/feed.social.controller.js backend/src/modules/sheets/sheets.social.controller.js backend/src/modules/notes/notes.controller.js
git commit -m "feat: add comment editing endpoints (15-min window) for feed, sheets, and notes"
```

---

### Task 2: Feed Card Redesign - Layout Restructure

**Files:**
- Modify: `frontend/studyhub-app/src/pages/feed/feedConstants.js`
- Modify: `frontend/studyhub-app/src/pages/feed/FeedCard.jsx`

- [ ] **Step 1: Add new style functions to feedConstants.js**

Add these new style exports at the end of `feedConstants.js` (before the closing of the file):

```javascript
/* ── Facebook-style feed card styles ── */

export const statsBarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderTop: '1px solid var(--sh-border)',
  borderBottom: '1px solid var(--sh-border)',
  marginTop: 14,
}

export const statsCountStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: 'var(--sh-muted)',
  fontSize: 13,
}

export const statsLinkStyle = {
  color: 'var(--sh-muted)',
  fontSize: 13,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: FONT,
}

export const actionBarStyle = {
  display: 'flex',
  padding: '4px 0',
}

export function actionBarButton(isActive, activeColor) {
  return {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '8px 4px',
    background: 'none',
    border: 'none',
    color: isActive ? `var(${activeColor})` : 'var(--sh-muted)',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: FONT,
    cursor: 'pointer',
    borderRadius: 8,
    transition: 'background 0.15s',
  }
}

export const shareToastStyle = {
  position: 'fixed',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'var(--sh-brand)',
  color: '#fff',
  padding: '10px 20px',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: FONT,
  fontWeight: 500,
  zIndex: 10000,
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
}
```

- [ ] **Step 2: Add SVG icon components to FeedCard.jsx**

At the top of `FeedCard.jsx`, after the existing imports, add icon components that will be used in the action bar. These are inline SVG components for clean, full-size rendering:

```javascript
function ThumbUpIcon({ size = 20, filled = false }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M2 21h4V9H2v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
    </svg>
  )
}

function ThumbDownIcon({ size = 20, filled = false }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22 3h-4v12h4V3zm-8 12c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.58-6.59c.37-.36.59-.86.59-1.41V5c0-1.1-.9-2-2-2H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06z" transform="rotate(180 12 12)"/>
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15V19a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/>
    </svg>
  )
}

function CommentIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function ShareIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  )
}
```

- [ ] **Step 3: Restructure the post reaction section in FeedCardInner**

Replace the current like/dislike buttons and comment count section (the `isPost` block in FeedCardInner that renders actionButton-styled Like/Dislike and the comment count pill) with the new Facebook-style layout:

**Stats bar** (between content and action buttons):
```jsx
{isPost && (
  <>
    {/* Stats Bar */}
    <div style={statsBarStyle}>
      <div style={statsCountStyle}>
        {(reaction?.likes || 0) > 0 && (
          <>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, background: 'var(--sh-brand)', borderRadius: '50%',
            }}>
              <ThumbUpIcon size={12} filled />
            </span>
            <span>{reaction.likes}</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <button style={statsLinkStyle} onClick={() => setShowComments(c => !c)}>
          {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
        </button>
      </div>
    </div>

    {/* Action Bar */}
    <div style={actionBarStyle}>
      <button
        style={actionBarButton(reaction?.userReaction === 'like', '--sh-brand')}
        onClick={() => onReact(item.id, 'like')}
      >
        <ThumbUpIcon size={20} filled={reaction?.userReaction === 'like'} />
        Like
      </button>
      <button
        style={actionBarButton(reaction?.userReaction === 'dislike', '--sh-danger')}
        onClick={() => onReact(item.id, 'dislike')}
      >
        <ThumbDownIcon size={20} filled={reaction?.userReaction === 'dislike'} />
        Dislike
      </button>
      <button
        style={actionBarButton(false, '--sh-brand')}
        onClick={() => setShowComments(c => !c)}
      >
        <CommentIcon size={20} />
        Comment
      </button>
      <button
        style={actionBarButton(false, '--sh-brand')}
        onClick={handleShare}
      >
        <ShareIcon size={20} />
        Share
      </button>
    </div>
  </>
)}
```

Add `showComments` state and `handleShare` function inside `FeedCardInner`:

```javascript
const [showComments, setShowComments] = useState(!!targetCommentId)
const [showShareToast, setShowShareToast] = useState(false)

const handleShare = useCallback(() => {
  const url = `${window.location.origin}/feed?post=${item.id}`
  navigator.clipboard.writeText(url).then(() => {
    setShowShareToast(true)
    setTimeout(() => setShowShareToast(false), 2000)
  })
}, [item.id])
```

Add share toast at the end of the component JSX (before closing `</article>`):
```jsx
{showShareToast && <div style={shareToastStyle}>Link copied to clipboard</div>}
```

- [ ] **Step 4: Update CommentSection rendering to use showComments**

Change the CommentSection rendering from the current toggle to use the `showComments` state:

```jsx
{isPost && showComments && (
  <CommentSection
    postId={item.id}
    commentCount={commentCount}
    user={currentUser}
    targetCommentId={targetCommentId}
  />
)}
```

- [ ] **Step 5: Import new styles in FeedCard.jsx**

Update the feedConstants import to include the new exports:
```javascript
import {
  FONT, timeAgo, actionButton, linkButton, pillStyle,
  statsBarStyle, statsCountStyle, statsLinkStyle,
  actionBarStyle, actionBarButton, shareToastStyle,
} from './feedConstants'
```

- [ ] **Step 6: Lint check**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add frontend/studyhub-app/src/pages/feed/FeedCard.jsx frontend/studyhub-app/src/pages/feed/feedConstants.js
git commit -m "feat: restructure feed card to Facebook-style layout with stats bar, action bar, and share button"
```

---

### Task 3: CommentSection Redesign - Pill Bubbles, 3-Level Nesting, Editing

**Files:**
- Modify: `frontend/studyhub-app/src/pages/feed/CommentSection.jsx`

This is the largest task. The entire CommentSection.jsx (851 lines) needs to be rewritten with:
1. Facebook-style pill comment bubbles
2. Recursive 3-level nesting
3. Inline comment editing with 15-minute window
4. Proper ThumbUp/ThumbDown icons
5. All `var(--sh-*)` color tokens
6. UserAvatar component for all avatars

- [ ] **Step 1: Add UserAvatar import and editing state to useComments hook**

At the top of CommentSection.jsx, add UserAvatar import:
```javascript
import UserAvatar from '../../components/UserAvatar'
```

Add `editComment` function to the `useComments` hook (after `reactToComment`):

```javascript
const editComment = useCallback(async (commentId, newContent) => {
  try {
    const res = await fetch(`${API}/api/feed/posts/${postId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({ content: newContent }),
    })
    if (!res.ok) {
      const err = await readJsonSafely(res)
      throw new Error(err?.error || 'Failed to edit comment')
    }
    const updated = await res.json()
    setComments(prev => prev.map(c => {
      if (c.id === commentId) return { ...c, content: updated.content, updatedAt: updated.updatedAt }
      if (c.replies) {
        return {
          ...c,
          replies: c.replies.map(r => {
            if (r.id === commentId) return { ...r, content: updated.content, updatedAt: updated.updatedAt }
            if (r.replies) {
              return {
                ...r,
                replies: r.replies.map(rr =>
                  rr.id === commentId ? { ...rr, content: updated.content, updatedAt: updated.updatedAt } : rr
                ),
              }
            }
            return r
          }),
        }
      }
      return c
    }))
    return true
  } catch (err) {
    console.error('Edit comment error:', err)
    return false
  }
}, [postId])
```

Return `editComment` from the hook alongside existing methods.

- [ ] **Step 2: Rewrite CommentReactions with proper icons**

Replace the existing `CommentReactions` component with:

```jsx
function CommentReactions({ commentId, reactionCounts, userReaction, onReact }) {
  const counts = reactionCounts || { like: 0, dislike: 0 }
  const isLiked = userReaction === 'like'
  const isDisliked = userReaction === 'dislike'

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <button
        onClick={() => onReact(commentId, 'like')}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: isLiked ? 'var(--sh-brand)' : 'var(--sh-muted)',
          fontSize: 12, fontWeight: 500, fontFamily: FONT,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        Like{counts.like > 0 ? ` ${counts.like}` : ''}
      </button>
      <button
        onClick={() => onReact(commentId, 'dislike')}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: isDisliked ? 'var(--sh-danger)' : 'var(--sh-muted)',
          fontSize: 12, fontWeight: 500, fontFamily: FONT,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        Dislike{counts.dislike > 0 ? ` ${counts.dislike}` : ''}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite CommentItem with pill bubbles, nesting, and editing**

Replace the `CommentItem` component with a recursive version that supports 3-level nesting and inline editing:

```jsx
function CommentItem({ comment, user, onDelete, onReact, onReply, onEdit, depth = 0 }) {
  const [replying, setReplying] = useState(false)
  const [showReplies, setShowReplies] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [editSaving, setEditSaving] = useState(false)

  const isOwn = user && comment.author?.id === user.id
  const canDelete = isOwn || (user && user.role === 'admin')
  const maxDepth = 2 // 0, 1, 2 = 3 levels
  const canReply = depth < maxDepth && !!user

  // 15-minute edit window
  const fifteenMin = 15 * 60 * 1000
  const canEdit = isOwn && (Date.now() - new Date(comment.createdAt).getTime() < fifteenMin)
  const wasEdited = comment.updatedAt && comment.updatedAt !== comment.createdAt

  const avatarSizes = [34, 28, 24]
  const avatarSize = avatarSizes[Math.min(depth, 2)]

  const handleEdit = async () => {
    if (!editContent.trim() || editContent.trim() === comment.content) {
      setEditing(false)
      return
    }
    setEditSaving(true)
    const success = await onEdit(comment.id, editContent.trim())
    setEditSaving(false)
    if (success) setEditing(false)
  }

  const wrapperStyle = depth > 0
    ? { marginLeft: 20, paddingLeft: 12, borderLeft: '2px solid var(--sh-border)' }
    : {}

  return (
    <div style={{ marginTop: depth > 0 ? 8 : 12, ...wrapperStyle }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <UserAvatar
          username={comment.author?.username}
          avatarUrl={comment.author?.avatarUrl}
          role={comment.author?.role}
          plan={comment.author?.plan}
          size={avatarSize}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Bubble */}
          <div style={{
            background: 'var(--sh-soft)',
            borderRadius: 16,
            padding: '10px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link to={`/profile/${comment.author?.username}`} style={{
                color: 'var(--sh-text)', fontWeight: 600, fontSize: 13,
                textDecoration: 'none', fontFamily: FONT,
              }}>
                {comment.author?.username || 'Unknown'}
              </Link>
            </div>
            {editing ? (
              <div style={{ marginTop: 6 }}>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  maxLength={500}
                  style={{
                    width: '100%', minHeight: 60, background: 'var(--sh-surface)',
                    border: '1px solid var(--sh-border)', borderRadius: 8,
                    color: 'var(--sh-text)', fontSize: 13, fontFamily: FONT,
                    padding: '8px 10px', resize: 'vertical', outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    onClick={handleEdit}
                    disabled={editSaving || !editContent.trim()}
                    style={{
                      background: 'var(--sh-brand)', color: '#fff', border: 'none',
                      borderRadius: 6, padding: '4px 12px', fontSize: 12,
                      fontFamily: FONT, cursor: 'pointer', fontWeight: 500,
                    }}
                  >
                    {editSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setEditContent(comment.content) }}
                    style={{
                      background: 'none', color: 'var(--sh-muted)', border: '1px solid var(--sh-border)',
                      borderRadius: 6, padding: '4px 12px', fontSize: 12,
                      fontFamily: FONT, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--sh-subtext)', fontSize: 13, marginTop: 2, wordBreak: 'break-word' }}>
                <MentionText text={comment.content} />
              </div>
            )}
            {/* Attachments */}
            {comment.attachments?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {comment.attachments.map(att => (
                  <img
                    key={att.id}
                    src={att.url}
                    alt="attachment"
                    style={{ maxWidth: '100%', borderRadius: 8, maxHeight: 200 }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Actions row */}
          {!editing && (
            <div style={{ display: 'flex', gap: 16, padding: '4px 14px', alignItems: 'center' }}>
              <CommentReactions
                commentId={comment.id}
                reactionCounts={comment.reactionCounts}
                userReaction={comment.userReaction}
                onReact={onReact}
              />
              {canReply && (
                <button
                  onClick={() => setReplying(r => !r)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: 'var(--sh-muted)', fontSize: 12, fontWeight: 500, fontFamily: FONT,
                  }}
                >
                  Reply
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => setEditing(true)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: 'var(--sh-muted)', fontSize: 12, fontWeight: 500, fontFamily: FONT,
                  }}
                >
                  Edit
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => onDelete(comment.id)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: 'var(--sh-danger)', fontSize: 12, fontWeight: 500, fontFamily: FONT,
                  }}
                >
                  Delete
                </button>
              )}
              <span style={{ color: 'var(--sh-muted)', fontSize: 11, fontFamily: FONT }}>
                {timeAgo(comment.createdAt || comment.timestamp)}
                {wasEdited && ' (edited)'}
              </span>
            </div>
          )}

          {/* Reply input */}
          {replying && (
            <div style={{ marginTop: 8 }}>
              <ReplyInput
                user={user}
                onReply={(content, attachments) => {
                  onReply(comment.id, content, attachments)
                  setReplying(false)
                }}
              />
            </div>
          )}

          {/* Nested replies */}
          {comment.replies?.length > 0 && (
            <div>
              {comment.replies.length > 2 && (
                <button
                  onClick={() => setShowReplies(s => !s)}
                  style={{
                    background: 'none', border: 'none', padding: '4px 14px', cursor: 'pointer',
                    color: 'var(--sh-brand)', fontSize: 12, fontWeight: 600, fontFamily: FONT,
                  }}
                >
                  {showReplies ? 'Hide replies' : `View ${comment.replies.length} replies`}
                </button>
              )}
              {showReplies && comment.replies.map(reply => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  user={user}
                  onDelete={onDelete}
                  onReact={onReact}
                  onReply={onReply}
                  onEdit={onEdit}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update CommentInput to use UserAvatar and pill styling**

Replace the avatar rendering inside `CommentInput` (currently uses `Avatar` from FeedWidgets) with:

```jsx
<UserAvatar
  username={user?.username}
  avatarUrl={user?.avatarUrl}
  role={user?.role}
  plan={user?.plan}
  size={34}
/>
```

Update the textarea container to use pill shape:
```jsx
<div style={{
  flex: 1,
  background: 'var(--sh-soft)',
  borderRadius: 20,
  padding: '8px 14px',
}}>
```

- [ ] **Step 5: Update ReplyInput to use UserAvatar**

Same UserAvatar replacement in `ReplyInput`.

- [ ] **Step 6: Update CommentList and main CommentSection to pass onEdit**

In `CommentList`, pass `onEdit` prop through to `CommentItem`:
```jsx
function CommentList({ comments, loading, user, onDelete, onReact, onReply, onEdit }) {
  // ... map comments with onEdit prop
}
```

In the main `CommentSection` component, pass `editComment` from the hook:
```jsx
<CommentList
  comments={comments}
  loading={loading}
  user={user}
  onDelete={deleteComment}
  onReact={reactToComment}
  onReply={handleReply}
  onEdit={editComment}
/>
```

- [ ] **Step 7: Update the comment input area in main CommentSection**

Replace the input area to use the new pill style with UserAvatar:
```jsx
<div style={{ display: 'flex', gap: 10, padding: '12px 0', alignItems: 'flex-start' }}>
  <UserAvatar
    username={user?.username}
    avatarUrl={user?.avatarUrl}
    role={user?.role}
    plan={user?.plan}
    size={34}
  />
  <div style={{
    flex: 1,
    background: 'var(--sh-soft)',
    borderRadius: 20,
    padding: '8px 14px',
  }}>
    {/* textarea and footer inside */}
  </div>
</div>
```

- [ ] **Step 8: Lint check**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: No new errors

- [ ] **Step 9: Commit**

```bash
git add frontend/studyhub-app/src/pages/feed/CommentSection.jsx
git commit -m "feat: redesign comment section with Facebook-style bubbles, 3-level nesting, and inline editing"
```

---

### Task 4: Sheet Comments Panel Redesign

**Files:**
- Modify: `frontend/studyhub-app/src/pages/sheets/viewer/SheetCommentsPanel.jsx`

- [ ] **Step 1: Add UserAvatar import**

```javascript
import UserAvatar from '../../../components/UserAvatar'
```

- [ ] **Step 2: Rewrite CommentReactionsSheet with text-link style**

Replace the SVG-based reaction buttons with text-link style matching the feed redesign:

```jsx
function CommentReactionsSheet({ commentId, reactionCounts, userReaction, onReact }) {
  const counts = reactionCounts || { like: 0, dislike: 0 }
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <button
        onClick={() => onReact(commentId, 'like')}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: userReaction === 'like' ? 'var(--sh-brand)' : 'var(--sh-muted)',
          fontSize: 12, fontWeight: 500, fontFamily: FONT,
        }}
      >
        Like{counts.like > 0 ? ` ${counts.like}` : ''}
      </button>
      <button
        onClick={() => onReact(commentId, 'dislike')}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: userReaction === 'dislike' ? 'var(--sh-danger)' : 'var(--sh-muted)',
          fontSize: 12, fontWeight: 500, fontFamily: FONT,
        }}
      >
        Dislike{counts.dislike > 0 ? ` ${counts.dislike}` : ''}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Update comment rendering to use pill bubbles and UserAvatar**

In the main comment list rendering, replace the avatar + content structure with:

```jsx
<div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
  <UserAvatar
    username={c.author?.username}
    avatarUrl={c.author?.avatarUrl}
    role={c.author?.role}
    plan={c.author?.plan}
    size={34}
  />
  <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{
      background: 'var(--sh-soft)',
      borderRadius: 16,
      padding: '10px 14px',
    }}>
      <Link to={`/profile/${c.author?.username}`} style={{
        color: 'var(--sh-text)', fontWeight: 600, fontSize: 13,
        textDecoration: 'none', fontFamily: FONT,
      }}>
        {c.author?.username}
      </Link>
      <div style={{ color: 'var(--sh-subtext)', fontSize: 13, marginTop: 2, wordBreak: 'break-word' }}>
        <MentionText text={c.content} />
      </div>
    </div>
    <div style={{ display: 'flex', gap: 16, padding: '4px 14px', alignItems: 'center' }}>
      <CommentReactionsSheet
        commentId={c.id}
        reactionCounts={c.reactionCounts}
        userReaction={c.userReaction}
        onReact={onReactToComment}
      />
      <span style={{ color: 'var(--sh-muted)', fontSize: 11, fontFamily: FONT }}>
        {timeAgo(c.createdAt)}
      </span>
      {canDelete && (
        <button onClick={() => deleteComment(c.id)} style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--sh-danger)', fontSize: 12, fontFamily: FONT,
        }}>
          Delete
        </button>
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 4: Update comment input to use UserAvatar and pill shape**

Replace the avatar in the input area:
```jsx
<UserAvatar
  username={user?.username}
  avatarUrl={user?.avatarUrl}
  size={34}
/>
```

Wrap the textarea in a pill container with `borderRadius: 20, background: 'var(--sh-soft)'`.

- [ ] **Step 5: Lint and commit**

Run: `npm --prefix frontend/studyhub-app run lint`

```bash
git add frontend/studyhub-app/src/pages/sheets/viewer/SheetCommentsPanel.jsx
git commit -m "feat: redesign sheet comments panel with Facebook-style pill bubbles and UserAvatar"
```

---

### Task 5: Note Comment Section Redesign

**Files:**
- Modify: `frontend/studyhub-app/src/pages/notes/NoteCommentSection.jsx`

- [ ] **Step 1: Update CommentReactions to text-link style**

Same pattern as feed and sheet comments - replace SVG icon buttons with text-link "Like / Dislike" buttons using `var(--sh-brand)` and `var(--sh-danger)` active colors.

- [ ] **Step 2: Update CommentItem to pill bubble style**

Apply the same pill bubble design (background: `var(--sh-soft)`, borderRadius: 16). Keep anchor-specific UI (anchor status badge, resolve/reopen button) as additional elements. Add editing support with the same 15-minute window pattern.

Add edit comment function:
```javascript
const editComment = useCallback(async (commentId, newContent) => {
  try {
    const res = await fetch(`${API}/api/notes/${noteId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content: newContent }),
    })
    if (!res.ok) throw new Error('Failed to edit')
    const updated = await res.json()
    // Update local state
    return true
  } catch { return false }
}, [noteId])
```

- [ ] **Step 3: Update CommentInput pill styling**

Same pill input pattern. UserAvatar is already used in NoteCommentSection.

- [ ] **Step 4: Add 3-level nesting support**

Apply the recursive `depth` prop pattern from the feed CommentItem. Anchor comments are always top-level, so nesting applies to regular replies.

- [ ] **Step 5: Lint and commit**

Run: `npm --prefix frontend/studyhub-app run lint`

```bash
git add frontend/studyhub-app/src/pages/notes/NoteCommentSection.jsx
git commit -m "feat: redesign note comments with pill bubbles, 3-level nesting, and editing"
```

---

### Task 6: Video Flash Bug Fix

**Files:**
- Modify: `frontend/studyhub-app/src/pages/feed/FeedCard.jsx` (FeedVideoPlayer)
- Modify: `frontend/studyhub-app/src/components/AnnouncementMedia.jsx` (AnnouncementVideoPlayer)

- [ ] **Step 1: Fix FeedVideoPlayer flash**

In the `FeedVideoPlayer` component, add buffering state management. After the existing state declarations, add:

```javascript
const [buffering, setBuffering] = useState(true)
```

Add event handlers to the `<video>` element:
```jsx
<video
  src={streamUrl}
  poster={thumbnailUrl || undefined}
  controls
  playsInline
  preload="metadata"
  onCanPlay={() => setBuffering(false)}
  onWaiting={() => setBuffering(true)}
  onPlaying={() => setBuffering(false)}
  controlsList="nodownload"
  disablePictureInPicture={item?.downloadProtected}
  style={{
    width: '100%',
    display: 'block',
    maxHeight: 500,
    opacity: buffering ? 0 : 1,
    transition: 'opacity 0.2s',
  }}
/>
```

Keep the thumbnail visible behind the video while buffering:
```jsx
<div style={{ position: 'relative' }}>
  {buffering && thumbnailUrl && (
    <img
      src={thumbnailUrl}
      alt=""
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        objectFit: 'cover', borderRadius: 8,
      }}
    />
  )}
  <video ... />
</div>
```

- [ ] **Step 2: Fix AnnouncementVideoPlayer flash**

Apply the same pattern in `AnnouncementVideoPlayer` (lines 12-86 of AnnouncementMedia.jsx):

Add `buffering` state, `onCanPlay`/`onWaiting`/`onPlaying` handlers, opacity transition, and thumbnail overlay.

- [ ] **Step 3: Lint and commit**

Run: `npm --prefix frontend/studyhub-app run lint`

```bash
git add frontend/studyhub-app/src/pages/feed/FeedCard.jsx frontend/studyhub-app/src/components/AnnouncementMedia.jsx
git commit -m "fix: prevent video flash on play by showing thumbnail until first frame decodes"
```

---

### Task 7: Termly Embed Bug Fix

**Files:**
- Modify: `frontend/studyhub-app/src/pages/legal/DisclaimerPage.jsx`
- Modify: `frontend/studyhub-app/src/pages/legal/CookiePolicyPage.jsx`

- [ ] **Step 1: Fix DisclaimerPage Termly embed**

In `DisclaimerPage.jsx`, update the `useEffect` to dynamically load the Termly embed script. Replace the current embed approach:

```javascript
useEffect(() => {
  let cancelled = false
  const embedRef = containerRef.current

  // Inject Termly embed script
  const script = document.createElement('script')
  script.src = 'https://app.termly.io/embed.min.js'
  script.id = 'termly-jssdk'
  script.setAttribute('data-auto-block', 'on')

  // Only add if not already present
  if (!document.getElementById('termly-jssdk')) {
    document.body.appendChild(script)
  }

  // Create embed div
  const embedDiv = document.createElement('div')
  embedDiv.setAttribute('name', 'termly-embed')
  embedDiv.setAttribute('data-id', TERMLY_UUIDS.disclaimer)
  if (embedRef) {
    embedRef.innerHTML = ''
    embedRef.appendChild(embedDiv)
  }

  // Watch for Termly to populate
  const observer = new MutationObserver(() => {
    if (!cancelled && embedDiv.children.length > 0) {
      setLoaded(true)
      observer.disconnect()
    }
  })
  observer.observe(embedDiv, { childList: true, subtree: true })

  // Timeout fallback
  const timeout = setTimeout(() => {
    if (!cancelled && !loaded) {
      setTimedOut(true)
      observer.disconnect()
    }
  }, 10000)

  return () => {
    cancelled = true
    clearTimeout(timeout)
    observer.disconnect()
  }
}, [])
```

- [ ] **Step 2: Fix CookiePolicyPage with same pattern**

Apply the identical Termly script injection pattern but with `TERMLY_UUIDS.cookies` instead.

- [ ] **Step 3: Lint and commit**

Run: `npm --prefix frontend/studyhub-app run lint`

```bash
git add frontend/studyhub-app/src/pages/legal/DisclaimerPage.jsx frontend/studyhub-app/src/pages/legal/CookiePolicyPage.jsx
git commit -m "fix: load Termly embed script dynamically for Disclaimer and Cookie Policy pages"
```

---

### Task 8: Final Validation

- [ ] **Step 1: Run full frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: 0 errors

- [ ] **Step 2: Run frontend build**

Run: `npm --prefix frontend/studyhub-app run build`
Expected: Build succeeds

- [ ] **Step 3: Run backend lint**

Run: `npm --prefix backend run lint`
Expected: 0 errors

- [ ] **Step 4: Run backend tests**

Run: `npm --prefix backend test`
Expected: All tests pass

- [ ] **Step 5: Final commit with any fixes**

If any lint/build/test issues were found and fixed:
```bash
git add -A
git commit -m "fix: resolve lint and build issues from feed/comments redesign"
```
