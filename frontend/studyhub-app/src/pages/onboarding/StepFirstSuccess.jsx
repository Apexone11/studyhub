/* ═══════════════════════════════════════════════════════════════════════════
 * StepFirstSuccess -- Onboarding step 5: Try one thing before you go
 *
 * Three expandable action cards: star a sheet, generate with AI, upload a note.
 * Only one card expanded at a time.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../../config'

const StepFirstSuccess = forwardRef(function StepFirstSuccess({ onNext, onSkip, submitting }, ref) {
  const [expanded, setExpanded] = useState(null) // 'star' | 'ai' | 'note'

  return (
    <div style={styles.wrapper}>
      <h2 ref={ref} tabIndex={-1} style={styles.heading}>
        Try one thing before you go
      </h2>

      <div style={styles.cardGrid}>
        <StarCard
          expanded={expanded === 'star'}
          onExpand={() => setExpanded(expanded === 'star' ? null : 'star')}
          onNext={onNext}
          submitting={submitting}
        />
        <AiCard
          expanded={expanded === 'ai'}
          onExpand={() => setExpanded(expanded === 'ai' ? null : 'ai')}
          onNext={onNext}
          submitting={submitting}
        />
        <NoteCard
          expanded={expanded === 'note'}
          onExpand={() => setExpanded(expanded === 'note' ? null : 'note')}
          onNext={onNext}
          submitting={submitting}
        />
      </div>

      <button type="button" onClick={onSkip} disabled={submitting} style={styles.skipLink}>
        Skip for now
      </button>
    </div>
  )
})

/* ── Star a popular sheet ──────────────────────────────────────────────── */

function StarCard({ expanded, onExpand, onNext, submitting }) {
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!expanded || sheets.length > 0) return
    let cancelled = false
    setLoading(true)
    async function fetchSheets() {
      try {
        const res = await fetch(`${API}/api/sheets?sort=stars&limit=5`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          const items = data.sheets || data || []
          if (!cancelled) setSheets(Array.isArray(items) ? items.slice(0, 5) : [])
        }
      } catch {
        // Non-blocking
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchSheets()
    return () => {
      cancelled = true
    }
  }, [expanded, sheets.length])

  return (
    <div style={{ ...styles.card, ...(expanded ? styles.cardExpanded : {}) }}>
      <button type="button" onClick={onExpand} style={styles.cardHeader}>
        <span style={styles.cardTitle}>Star a popular sheet</span>
        <span style={styles.cardArrow}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div style={styles.cardBody}>
          {loading ? (
            <div style={styles.cardLoadingMsg}>Loading popular sheets...</div>
          ) : sheets.length === 0 ? (
            <div style={styles.cardEmptyMsg}>No sheets available yet.</div>
          ) : (
            <div style={styles.sheetList}>
              {sheets.map((sheet) => (
                <div key={sheet.id} style={styles.sheetItem}>
                  <div style={styles.sheetInfo}>
                    <span style={styles.sheetTitle}>{sheet.title}</span>
                    {sheet.course?.code && (
                      <span style={styles.sheetCourse}>{sheet.course.code}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onNext({ actionType: 'star', sheetId: sheet.id })}
                    disabled={submitting}
                    style={styles.starBtn}
                  >
                    {submitting ? '...' : 'Star'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Generate with AI ──────────────────────────────────────────────────── */

function AiCard({ expanded, onExpand, onNext, submitting }) {
  const [prompt, setPrompt] = useState('')
  const navigate = useNavigate()

  // After the onboarding action records on the backend, hand off to Hub AI
  // with the prompt prefilled so a real generation happens. The earlier
  // implementation created a fake placeholder sheet on the backend whose
  // content was just the literal prompt text — this routes to the actual
  // streaming AI flow instead. The cap matches AiSuggestionCard's hand-off.
  async function handleGenerate() {
    const trimmed = prompt.trim()
    if (!trimmed) return
    await onNext({ actionType: 'ai_sheet', prompt: trimmed })
    navigate(`/ai?prompt=${encodeURIComponent(trimmed.slice(0, 1000))}`)
  }

  return (
    <div style={{ ...styles.card, ...(expanded ? styles.cardExpanded : {}) }}>
      <button type="button" onClick={onExpand} style={styles.cardHeader}>
        <span style={styles.cardTitle}>Generate with AI</span>
        <span style={styles.cardArrow}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div style={styles.cardBody}>
          <label htmlFor="ai-prompt" className="sr-only">
            AI generation prompt
          </label>
          <textarea
            id="ai-prompt"
            placeholder="e.g., Summarize key concepts in organic chemistry"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={500}
            rows={3}
            style={styles.textarea}
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={prompt.trim().length === 0 || submitting}
            style={{
              ...styles.actionBtn,
              opacity: prompt.trim().length === 0 || submitting ? 0.5 : 1,
            }}
          >
            {submitting ? 'Generating...' : 'Generate'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Upload a note ─────────────────────────────────────────────────────── */

function NoteCard({ expanded, onExpand, onNext, submitting }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  function handleSave() {
    if (title.trim().length > 0 && content.trim().length > 0) {
      onNext({ actionType: 'upload_note', title: title.trim(), content: content.trim() })
    }
  }

  return (
    <div style={{ ...styles.card, ...(expanded ? styles.cardExpanded : {}) }}>
      <button type="button" onClick={onExpand} style={styles.cardHeader}>
        <span style={styles.cardTitle}>Upload a note</span>
        <span style={styles.cardArrow}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div style={styles.cardBody}>
          <label htmlFor="note-title" className="sr-only">
            Note title
          </label>
          <input
            id="note-title"
            type="text"
            placeholder="Note title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            style={styles.input}
          />
          <label htmlFor="note-content" className="sr-only">
            Note content
          </label>
          <textarea
            id="note-content"
            placeholder="Write your note content..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={10000}
            rows={4}
            style={styles.textarea}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={title.trim().length === 0 || content.trim().length === 0 || submitting}
            style={{
              ...styles.actionBtn,
              opacity:
                title.trim().length === 0 || content.trim().length === 0 || submitting ? 0.5 : 1,
            }}
          >
            {submitting ? 'Saving...' : 'Save note'}
          </button>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  heading: {
    fontSize: 'var(--type-lg)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    outline: 'none',
    margin: 0,
  },
  cardGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  card: {
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius)',
    background: 'var(--sh-surface)',
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  },
  cardExpanded: {
    borderColor: 'var(--sh-brand-border)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '14px 16px',
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    color: 'var(--sh-heading)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  cardTitle: {
    flex: 1,
  },
  cardArrow: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-muted)',
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    padding: '0 16px 16px',
  },
  cardLoadingMsg: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
    padding: 'var(--space-4) 0',
    textAlign: 'center',
  },
  cardEmptyMsg: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    padding: 'var(--space-4) 0',
    textAlign: 'center',
  },
  sheetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  sheetItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: 'var(--sh-soft)',
    borderRadius: 'var(--radius-sm)',
  },
  sheetInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    color: 'var(--sh-heading)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sheetCourse: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-muted)',
  },
  starBtn: {
    padding: '6px 14px',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    color: 'var(--sh-brand)',
    background: 'var(--sh-brand-soft-bg)',
    border: '1px solid var(--sh-brand-border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    flexShrink: 0,
    marginLeft: 'var(--space-3)',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-input-text)',
    background: 'var(--sh-input-bg)',
    border: '1px solid var(--sh-input-border)',
    borderRadius: 'var(--radius-control)',
    outline: 'none',
    fontFamily: 'inherit',
  },
  textarea: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-input-text)',
    background: 'var(--sh-input-bg)',
    border: '1px solid var(--sh-input-border)',
    borderRadius: 'var(--radius-control)',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  actionBtn: {
    alignSelf: 'flex-start',
    padding: '8px 20px',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    color: 'var(--sh-btn-primary-text)',
    background: 'var(--sh-btn-primary-bg)',
    border: 'none',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  skipLink: {
    alignSelf: 'center',
    padding: '6px 12px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
}

export default StepFirstSuccess
