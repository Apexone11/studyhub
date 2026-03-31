/* ═══════════════════════════════════════════════════════════════════════════
 * FeedComposer.jsx — Post composer form for the feed page
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useRef, useState } from 'react'
import { IconUpload, IconX } from '../../components/Icons'
import { COMPOSER_PROMPTS, linkButton } from './feedConstants'

const composerPromptIndex = Math.floor(Date.now() / 60000) % COMPOSER_PROMPTS.length

export default function FeedComposer({ user, onSubmitPost }) {
  const [composer, setComposer] = useState({ content: '', courseId: '' })
  const [composeState, setComposeState] = useState({ saving: false, error: '' })
  const [attachedFile, setAttachedFile] = useState(null)
  const fileInputRef = useRef(null)

  const handleSubmitPost = async (event) => {
    event.preventDefault()
    if (!composer.content.trim()) {
      setComposeState({ saving: false, error: 'Write something before posting.' })
      return
    }

    setComposeState({ saving: true, error: '' })
    try {
      await onSubmitPost({ content: composer.content, courseId: composer.courseId, attachedFile })
      setComposer({ content: '', courseId: '' })
      setAttachedFile(null)
      setComposeState({ saving: false, error: '' })
    } catch (error) {
      setComposeState({ saving: false, error: error.message || 'Could not post to the feed.' })
    }
  }

  return (
    <form onSubmit={handleSubmitPost} style={{ display: 'grid', gap: 12 }}>
      <textarea
        value={composer.content}
        onChange={(event) => setComposer((current) => ({ ...current, content: event.target.value }))}
        placeholder={COMPOSER_PROMPTS[composerPromptIndex]}
        rows={4}
        className="sh-input"
        style={{ width: '100%', resize: 'vertical', borderRadius: 'var(--radius-card)', padding: 14, font: 'inherit' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <select
          value={composer.courseId}
          onChange={(event) => setComposer((current) => ({ ...current, courseId: event.target.value }))}
          className="sh-input"
          style={{ minWidth: 140, maxWidth: 200, width: 'auto' }}
        >
          <option value="">All courses</option>
          {(user?.enrollments || []).map((enrollment) => (
            <option key={enrollment.course.id} value={enrollment.course.id}>{enrollment.course.code}</option>
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
              }
              e.target.value = ''
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} style={linkButton()}>
            <IconUpload size={14} /> Attach file
          </button>
          <button type="submit" disabled={composeState.saving} style={{ ...linkButton(), cursor: composeState.saving ? 'wait' : 'pointer', opacity: composeState.saving ? 0.6 : 1 }}>
            {composeState.saving ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
      {attachedFile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--sh-soft)', borderRadius: 8, fontSize: 12, color: 'var(--sh-subtext)' }}>
          <IconUpload size={12} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</span>
          <span style={{ color: 'var(--sh-muted)', flexShrink: 0 }}>{(attachedFile.size / 1024).toFixed(0)} KB</span>
          <button type="button" onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', display: 'flex', padding: 2 }}><IconX size={12} /></button>
        </div>
      )}
      {composeState.error ? <div style={{ color: 'var(--sh-danger)', fontSize: 13 }}>{composeState.error}</div> : null}
    </form>
  )
}
