# Bug Fixes + UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix iframe loading bugs on legal pages, add video processing completion indicator, fix comment avatars, and redesign the Supporters page with premium showcase aesthetics.

**Architecture:** All changes are frontend-only. No new backend endpoints or database migrations. The video status polling reuses the existing `GET /api/video/:id` endpoint. The Supporters page redesign replaces inline styles with premium animated CSS.

**Tech Stack:** React 19, CSS keyframes (no external animation libs), existing `UserAvatar` component, Termly iframe embeds.

---

### Task 1: Fix Disclaimer and Cookie Policy Iframe Loading

**Files:**
- Modify: `frontend/studyhub-app/src/pages/legal/DisclaimerPage.jsx`
- Modify: `frontend/studyhub-app/src/pages/legal/CookiePolicyPage.jsx`

- [ ] **Step 1: Update DisclaimerPage.jsx with loading state and error fallback**

Replace the entire file content:

```jsx
import { useState, useEffect } from 'react'
import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconInfoCircle } from '../../components/Icons'
import { LEGAL_EMAILS } from '../../lib/legalConstants'
import { POLICY_URLS } from '../../lib/legalVersions'

function DisclaimerPage() {
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (loaded) return
    const timer = setTimeout(() => setTimedOut(true), 10000)
    return () => clearTimeout(timer)
  }, [loaded])

  return (
    <LegalPageLayout
      tone="amber"
      title="Disclaimer"
      updated="Effective Date: April 2026"
      summary="Limitations of liability for StudyHub and its content."
      intro="This disclaimer outlines the limitations of liability for StudyHub and its content. StudyHub provides study materials created by students and does not guarantee their accuracy."
      icon={<IconInfoCircle size={26} />}
    >
      <LegalSection title="Disclaimer">
        <p>
          This disclaimer outlines the limitations of liability for StudyHub and its content.
          For full details, please review the disclaimer below.
        </p>
        <p>
          For legal inquiries, contact{' '}
          <a href={`mailto:${LEGAL_EMAILS.legal}`} style={{ color: 'var(--sh-brand)', textDecoration: 'none' }}>{LEGAL_EMAILS.legal}</a>.
        </p>
        <div style={{ position: 'relative', minHeight: 600 }}>
          {!loaded && !timedOut && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'var(--sh-soft)', borderRadius: 8,
              color: 'var(--sh-muted)', fontSize: 14,
            }}>
              Loading disclaimer...
            </div>
          )}
          {timedOut && !loaded && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: 'var(--sh-soft)',
              borderRadius: 8, gap: 12, padding: 20,
            }}>
              <p style={{ color: 'var(--sh-muted)', fontSize: 14, margin: 0, textAlign: 'center' }}>
                The disclaimer failed to load. You can view it directly on Termly:
              </p>
              <a
                href={POLICY_URLS.disclaimer}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--sh-brand)', fontSize: 14, fontWeight: 600 }}
              >
                View Disclaimer
              </a>
            </div>
          )}
          <iframe
            src={POLICY_URLS.disclaimer}
            style={{
              width: '100%', minHeight: 600, border: 'none', borderRadius: 8,
              opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease',
            }}
            title="Disclaimer"
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default DisclaimerPage
```

- [ ] **Step 2: Update CookiePolicyPage.jsx with the same loading/error pattern**

Replace the entire file content:

```jsx
import { useState, useEffect } from 'react'
import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconShield } from '../../components/Icons'
import { LEGAL_EMAILS } from '../../lib/legalConstants'
import { POLICY_URLS } from '../../lib/legalVersions'

function CookiePolicyPage() {
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (loaded) return
    const timer = setTimeout(() => setTimedOut(true), 10000)
    return () => clearTimeout(timer)
  }, [loaded])

  return (
    <LegalPageLayout
      tone="green"
      title="Cookie Policy"
      updated="Effective Date: April 2026"
      summary="How StudyHub uses cookies and similar tracking technologies."
      intro="This policy explains how StudyHub uses cookies and similar tracking technologies to recognize you when you visit our platform."
      icon={<IconShield size={26} />}
    >
      <LegalSection title="Cookie Policy">
        <p>
          This policy explains how StudyHub uses cookies and similar tracking technologies.
          For full details, please review the policy below.
        </p>
        <p>
          For cookie-related questions, contact{' '}
          <a href={`mailto:${LEGAL_EMAILS.privacy}`} style={{ color: 'var(--sh-brand)', textDecoration: 'none' }}>{LEGAL_EMAILS.privacy}</a>.
        </p>
        <div style={{ position: 'relative', minHeight: 600 }}>
          {!loaded && !timedOut && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'var(--sh-soft)', borderRadius: 8,
              color: 'var(--sh-muted)', fontSize: 14,
            }}>
              Loading cookie policy...
            </div>
          )}
          {timedOut && !loaded && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: 'var(--sh-soft)',
              borderRadius: 8, gap: 12, padding: 20,
            }}>
              <p style={{ color: 'var(--sh-muted)', fontSize: 14, margin: 0, textAlign: 'center' }}>
                The cookie policy failed to load. You can view it directly on Termly:
              </p>
              <a
                href={POLICY_URLS.cookies}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--sh-brand)', fontSize: 14, fontWeight: 600 }}
              >
                View Cookie Policy
              </a>
            </div>
          )}
          <iframe
            src={POLICY_URLS.cookies}
            style={{
              width: '100%', minHeight: 600, border: 'none', borderRadius: 8,
              opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease',
            }}
            title="Cookie Policy"
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default CookiePolicyPage
```

- [ ] **Step 3: Run lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS (no new lint errors)

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/src/pages/legal/DisclaimerPage.jsx frontend/studyhub-app/src/pages/legal/CookiePolicyPage.jsx
git commit -m "fix: add loading states and error fallbacks to Termly iframe legal pages"
```

---

### Task 2: Video Upload Completion Status Indicator

**Files:**
- Modify: `frontend/studyhub-app/src/pages/feed/FeedComposer.jsx`

- [ ] **Step 1: Add video status polling and update the indicator**

In `FeedComposer.jsx`, add a `useEffect` that polls the video status when `videoProcessing` is true and `pendingVideoId` is set. Update the indicator to show "Video ready" with a green icon when done, or error state if failed.

Replace the entire file content:

```jsx
/* =======================================================================
 * FeedComposer.jsx -- Post composer form for the feed page
 *
 * Supports text posts, file attachments, and video uploads.
 * ======================================================================= */
import { useEffect, useRef, useState } from 'react'
import { IconUpload, IconX } from '../../components/Icons'
import { COMPOSER_PROMPTS, linkButton } from './feedConstants'
import { VideoUploader } from '../../components/video'
import { API } from '../../config'

const composerPromptIndex = Math.floor(Date.now() / 60000) % COMPOSER_PROMPTS.length

export default function FeedComposer({ user, onSubmitPost }) {
  const [composer, setComposer] = useState({ content: '', courseId: '' })
  const [composeState, setComposeState] = useState({ saving: false, error: '' })
  const [attachedFile, setAttachedFile] = useState(null)
  const [showVideoUploader, setShowVideoUploader] = useState(false)
  const [pendingVideoId, setPendingVideoId] = useState(null)
  const [videoProcessing, setVideoProcessing] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const fileInputRef = useRef(null)

  // Poll video status when processing
  useEffect(() => {
    if (!videoProcessing || !pendingVideoId) return
    let active = true

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/video/${pendingVideoId}`, { credentials: 'include' })
        if (!res.ok || !active) return
        const data = await res.json()
        if (data.status === 'ready') {
          setVideoProcessing(false)
          setVideoReady(true)
          clearInterval(poll)
        } else if (data.status === 'failed') {
          setVideoProcessing(false)
          setVideoFailed(true)
          clearInterval(poll)
        }
      } catch {
        /* silent -- will retry next interval */
      }
    }, 3000)

    return () => {
      active = false
      clearInterval(poll)
    }
  }, [videoProcessing, pendingVideoId])

  const handleSubmitPost = async (event) => {
    event.preventDefault()
    if (!composer.content.trim() && !pendingVideoId) {
      setComposeState({ saving: false, error: 'Write something before posting.' })
      return
    }

    setComposeState({ saving: true, error: '' })
    try {
      await onSubmitPost({
        content: composer.content,
        courseId: composer.courseId,
        attachedFile,
        videoId: pendingVideoId || null,
      })
      setComposer({ content: '', courseId: '' })
      setAttachedFile(null)
      setPendingVideoId(null)
      setShowVideoUploader(false)
      setVideoProcessing(false)
      setVideoReady(false)
      setVideoFailed(false)
      setComposeState({ saving: false, error: '' })
    } catch (error) {
      setComposeState({ saving: false, error: error.message || 'Could not post to the feed.' })
    }
  }

  const handleVideoUploadComplete = (videoId) => {
    setPendingVideoId(videoId)
    setVideoProcessing(true)
    setVideoReady(false)
    setVideoFailed(false)
    setShowVideoUploader(false)
  }

  const handleRemoveVideo = () => {
    setPendingVideoId(null)
    setVideoProcessing(false)
    setVideoReady(false)
    setVideoFailed(false)
    setShowVideoUploader(false)
  }

  const handleToggleVideo = () => {
    if (showVideoUploader) {
      setShowVideoUploader(false)
    } else {
      // Clear file attachment when switching to video
      setAttachedFile(null)
      setShowVideoUploader(true)
    }
  }

  // Determine indicator state
  let indicatorColor = 'var(--sh-brand)'
  let indicatorBg = 'var(--sh-brand-soft-bg)'
  let indicatorText = 'Video attached'
  if (videoProcessing) {
    indicatorText = 'Processing video...'
  } else if (videoReady) {
    indicatorColor = 'var(--sh-success)'
    indicatorBg = 'var(--sh-success-bg)'
    indicatorText = 'Video ready'
  } else if (videoFailed) {
    indicatorColor = 'var(--sh-danger)'
    indicatorBg = 'var(--sh-danger-bg)'
    indicatorText = 'Video processing failed'
  }

  return (
    <form onSubmit={handleSubmitPost} style={{ display: 'grid', gap: 12 }}>
      <textarea
        value={composer.content}
        onChange={(event) =>
          setComposer((current) => ({ ...current, content: event.target.value }))
        }
        placeholder={
          pendingVideoId ? 'Add a caption for your video...' : COMPOSER_PROMPTS[composerPromptIndex]
        }
        rows={4}
        className="sh-input"
        style={{
          width: '100%',
          resize: 'vertical',
          borderRadius: 'var(--radius-card)',
          padding: 14,
          font: 'inherit',
        }}
      />

      {/* Video uploader */}
      {showVideoUploader && !pendingVideoId && (
        <VideoUploader
          onUploadComplete={handleVideoUploadComplete}
          onCancel={() => setShowVideoUploader(false)}
          compact
        />
      )}

      {/* Video attached indicator */}
      {pendingVideoId && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: indicatorBg,
            borderRadius: 8,
            fontSize: 12,
            color: indicatorColor,
          }}
        >
          {videoReady ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : videoFailed ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          )}
          <span style={{ flex: 1, fontWeight: 600 }}>
            {indicatorText}
          </span>
          {videoProcessing && (
            <span style={{
              width: 12, height: 12, border: '2px solid currentColor',
              borderTopColor: 'transparent', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', flexShrink: 0,
            }} />
          )}
          <button
            type="button"
            onClick={handleRemoveVideo}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: indicatorColor,
              display: 'flex',
              padding: 2,
            }}
          >
            <IconX size={12} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <select
          value={composer.courseId}
          onChange={(event) =>
            setComposer((current) => ({ ...current, courseId: event.target.value }))
          }
          className="sh-chip"
          style={{
            minWidth: 140,
            maxWidth: 200,
            width: 'auto',
            appearance: 'none',
            WebkitAppearance: 'none',
            paddingRight: 28,
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23636e80' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            cursor: 'pointer',
          }}
        >
          <option value="">All courses</option>
          {(user?.enrollments || []).map((enrollment) => (
            <option key={enrollment.course.id} value={enrollment.course.id}>
              {enrollment.course.code}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                if (file.size > 10 * 1024 * 1024) {
                  setComposeState((s) => ({ ...s, error: 'File must be under 10 MB.' }))
                  return
                }
                setAttachedFile(file)
                // Clear video if switching to file
                setPendingVideoId(null)
                setVideoProcessing(false)
                setVideoReady(false)
                setVideoFailed(false)
                setShowVideoUploader(false)
              }
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!showVideoUploader) fileInputRef.current?.click()
            }}
            disabled={showVideoUploader}
            style={{ ...linkButton(), opacity: showVideoUploader ? 0.4 : 1 }}
          >
            <IconUpload size={14} /> Attach file
          </button>
          <button
            type="button"
            onClick={handleToggleVideo}
            style={{
              ...linkButton(),
              color: showVideoUploader || pendingVideoId ? 'var(--sh-brand)' : undefined,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>{' '}
            Video
          </button>
          <button
            type="submit"
            disabled={composeState.saving}
            style={{
              ...linkButton(),
              cursor: composeState.saving ? 'wait' : 'pointer',
              opacity: composeState.saving ? 0.6 : 1,
            }}
          >
            {composeState.saving ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
      {attachedFile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: 'var(--sh-soft)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--sh-subtext)',
          }}
        >
          <IconUpload size={12} />
          <span
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {attachedFile.name}
          </span>
          <span style={{ color: 'var(--sh-muted)', flexShrink: 0 }}>
            {(attachedFile.size / 1024).toFixed(0)} KB
          </span>
          <button
            type="button"
            onClick={() => setAttachedFile(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--sh-muted)',
              display: 'flex',
              padding: 2,
            }}
          >
            <IconX size={12} />
          </button>
        </div>
      )}
      {composeState.error ? (
        <div style={{ color: 'var(--sh-danger)', fontSize: 13 }}>{composeState.error}</div>
      ) : null}
    </form>
  )
}
```

- [ ] **Step 2: Run lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/feed/FeedComposer.jsx
git commit -m "feat: add video processing status polling with ready/failed indicators in FeedComposer"
```

---

### Task 3: Fix Comment Avatars

**Files:**
- Modify: `frontend/studyhub-app/src/pages/feed/CommentSection.jsx`

- [ ] **Step 1: Pass avatarUrl to Avatar in ReplyInput and CommentInput**

In `CommentSection.jsx`, find the `ReplyInput` function (line 205). The `Avatar` on line 262 currently receives only `username` and `role`. Add `avatarUrl`:

Find:
```jsx
      <Avatar username={user?.username} role={user?.role} size={32} />
```
(inside `ReplyInput`, around line 262)

Replace with:
```jsx
      <Avatar username={user?.username} avatarUrl={user?.avatarUrl} role={user?.role} size={32} />
```

Then find the same pattern in `CommentInput` (around line 431):
```jsx
      <Avatar username={user?.username} role={user?.role} size={32} />
```

Replace with:
```jsx
      <Avatar username={user?.username} avatarUrl={user?.avatarUrl} role={user?.role} size={32} />
```

- [ ] **Step 2: Run lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/feed/CommentSection.jsx
git commit -m "fix: pass avatarUrl to Avatar in comment input components"
```

---

### Task 4: Supporters Page Premium Redesign

**Files:**
- Modify: `frontend/studyhub-app/src/pages/supporters/SupportersPage.jsx`

- [ ] **Step 1: Rewrite SupportersPage.jsx with premium showcase design**

Replace the entire file with the premium redesign. This is a large single-file change. The new version keeps the same data-fetching logic and component structure but replaces all styles with premium animated effects.

Key changes:
- Hero: animated gradient background (purple/blue/teal), glowing title text-shadow, floating particles via `::before`/`::after` pseudo-elements (injected as CSS keyframes)
- Donor cards: glass-morphism (`backdrop-filter: blur(12px)`), animated glow borders for top 3 (gold/silver/bronze)
- Subscriber cards: glass-morphism, hover lift with glow shadow, shimmer badge
- CTA: gradient background card, pulse-glow primary button
- Empty states: animated gradient border, pulsing heart icon
- CSS keyframes injected via a `<style>` element in the component
- `prefers-reduced-motion` media query disables all animations

The full replacement code is large. The implementer should write the component following the spec sections 5a-5f exactly, maintaining the existing data flow (`donors`, `subscribers`, `loading`, `error` state, `DonorCard`, `SubscriberCard`, `EmptyState` sub-components) but replacing all style objects with the premium design. Preserve the `UserAvatar` import and usage, `Link` navigation, payment status banner, and all existing prop interfaces.

Critical implementation details:
- Inject keyframes via `useEffect` that creates a `<style>` element and appends to `document.head` (cleanup on unmount)
- Hero gradient: `linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4, #6366f1)` with `background-size: 300% 300%` and `animation: gradientShift 8s ease infinite`
- Particles: 6-8 absolute-positioned small circles with `animation: float [random duration] ease-in-out infinite`
- Gold glow: `box-shadow: 0 0 20px rgba(255, 215, 0, 0.3)` with pulse keyframe
- Silver glow: `box-shadow: 0 0 20px rgba(192, 192, 192, 0.3)`
- Bronze glow: `box-shadow: 0 0 20px rgba(205, 127, 50, 0.3)`
- Glass cards: `background: rgba(255, 255, 255, 0.05)`, `backdrop-filter: blur(12px)`, `border: 1px solid rgba(255, 255, 255, 0.1)`
- Shimmer effect: `background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)` with `animation: shimmer 2s infinite`
- All colors use CSS custom properties where semantic (danger, success, brand), specific hex for premium effects (gold, silver, bronze)

- [ ] **Step 2: Run lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `npm --prefix frontend/studyhub-app run build`
Expected: PASS (no build errors)

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/src/pages/supporters/SupportersPage.jsx
git commit -m "feat: redesign Supporters page with premium showcase aesthetics"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run full lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS

- [ ] **Step 2: Run full build**

Run: `npm --prefix frontend/studyhub-app run build`
Expected: PASS

- [ ] **Step 3: Final commit (if any fixups needed)**

Only if lint/build revealed issues that required fixes.
