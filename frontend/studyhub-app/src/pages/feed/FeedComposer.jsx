/* ═══════════════════════════════════════════════════════════════════════════
 * FeedComposer.jsx — Post composer form for the feed page
 *
 * Supports text posts, file attachments, and video uploads.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useRef, useState } from 'react'
import { IconUpload, IconX } from '../../components/Icons'
import { COMPOSER_PROMPTS, linkButton } from './feedConstants'
import { VideoUploader } from '../../components/video'

const composerPromptIndex = Math.floor(Date.now() / 60000) % COMPOSER_PROMPTS.length

export default function FeedComposer({ user, onSubmitPost }) {
  const [composer, setComposer] = useState({ content: '', courseId: '' })
  const [composeState, setComposeState] = useState({ saving: false, error: '' })
  const [attachedFile, setAttachedFile] = useState(null)
  const [showVideoUploader, setShowVideoUploader] = useState(false)
  const [pendingVideoId, setPendingVideoId] = useState(null)
  const [videoProcessing, setVideoProcessing] = useState(false)
  const fileInputRef = useRef(null)

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
      setComposeState({ saving: false, error: '' })
    } catch (error) {
      setComposeState({ saving: false, error: error.message || 'Could not post to the feed.' })
    }
  }

  const handleVideoUploadComplete = (videoId) => {
    setPendingVideoId(videoId)
    setVideoProcessing(true)
    setShowVideoUploader(false)
  }

  const handleRemoveVideo = () => {
    setPendingVideoId(null)
    setVideoProcessing(false)
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
            background: 'var(--sh-brand-soft-bg)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--sh-brand)',
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
          </svg>
          <span style={{ flex: 1, fontWeight: 600 }}>
            {videoProcessing ? 'Video uploaded -- processing in the background' : 'Video attached'}
          </span>
          <button
            type="button"
            onClick={handleRemoveVideo}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--sh-brand)',
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
