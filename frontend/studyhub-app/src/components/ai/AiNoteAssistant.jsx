/* ═══════════════════════════════════════════════════════════════════════════
 * AiNoteAssistant.jsx — AI helper card for the Notes viewer page.
 *
 * Three actions:
 *   - Summarize (short / medium / long)
 *   - Generate flashcards
 *   - Ask a question about the note
 *
 * All requests run against /api/ai/notes/:noteId/* which enforces the
 * same can-read rule the page itself does. Read-only — nothing
 * persists. Users can copy/export results back into their note
 * manually.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { IconSpark } from '../Icons'
import { summarizeNote, generateNoteFlashcards, askAboutNote } from '../../lib/aiSheetService'

const MODES = [
  { id: 'summary', label: 'Summarize' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'ask', label: 'Ask question' },
]

export default function AiNoteAssistant({ noteId }) {
  const [mode, setMode] = useState('summary')
  const [length, setLength] = useState('medium')
  const [count, setCount] = useState(10)
  const [question, setQuestion] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  const [summary, setSummary] = useState(null)
  const [cards, setCards] = useState(null)
  const [answer, setAnswer] = useState(null)

  if (!noteId) return null

  const run = async () => {
    setRunning(true)
    setError(null)
    setSummary(null)
    setCards(null)
    setAnswer(null)
    let res
    if (mode === 'summary') res = await summarizeNote(noteId, length)
    else if (mode === 'flashcards') res = await generateNoteFlashcards(noteId, Number(count) || 10)
    else if (mode === 'ask') {
      if (!question.trim()) {
        setError('Type a question first.')
        setRunning(false)
        return
      }
      res = await askAboutNote(noteId, question.trim())
    }
    setRunning(false)
    if (!res?.ok) {
      setError(res?.error || 'Request failed.')
      return
    }
    if (mode === 'summary') setSummary(res.data.summary || '')
    if (mode === 'flashcards') setCards(res.data.cards || [])
    if (mode === 'ask') setAnswer(res.data.answer || '')
  }

  return (
    <section
      aria-label="AI assistant for this note"
      style={{
        marginTop: 16,
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'var(--sh-ai-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconSpark size={14} style={{ color: '#fff' }} />
        </div>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)' }}>
          Hub AI · this note
        </h3>
      </header>

      {/* Mode picker */}
      <div
        role="tablist"
        aria-label="AI action"
        style={{ display: 'flex', gap: 6, marginBottom: 10 }}
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              background: mode === m.id ? 'var(--sh-brand)' : 'var(--sh-bg)',
              color: mode === m.id ? '#fff' : 'var(--sh-text)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Mode-specific inputs */}
      {mode === 'summary' ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {['short', 'medium', 'long'].map((opt) => (
            <button
              key={opt}
              onClick={() => setLength(opt)}
              aria-pressed={length === opt}
              style={chipStyle(length === opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}
      {mode === 'flashcards' ? (
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 10 }}
        >
          <span style={{ color: 'var(--sh-muted)' }}>How many cards:</span>
          <input
            type="number"
            value={count}
            min={3}
            max={30}
            onChange={(e) => setCount(e.target.value)}
            style={{
              width: 60,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-bg)',
              color: 'var(--sh-text)',
              fontSize: 12,
            }}
          />
        </label>
      ) : null}
      {mode === 'ask' ? (
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 1500))}
          rows={2}
          placeholder="Ask anything about this note..."
          aria-label="Your question about this note"
          style={{
            width: '100%',
            padding: 8,
            borderRadius: 8,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-bg)',
            color: 'var(--sh-text)',
            fontSize: 12.5,
            marginBottom: 10,
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      ) : null}

      <button
        type="button"
        onClick={run}
        disabled={running}
        style={{
          background: running ? 'var(--sh-soft)' : 'var(--sh-brand)',
          color: running ? 'var(--sh-muted)' : '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: running ? 'not-allowed' : 'pointer',
        }}
      >
        {running
          ? 'Working…'
          : mode === 'summary'
            ? 'Summarize'
            : mode === 'flashcards'
              ? 'Generate'
              : 'Ask'}
      </button>

      {error ? (
        <div
          role="alert"
          style={{
            marginTop: 10,
            background: 'var(--sh-danger-bg)',
            color: 'var(--sh-danger-text)',
            border: '1px solid var(--sh-danger-border, var(--sh-border))',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      {summary ? <ResultCard heading="Summary" body={summary} /> : null}
      {cards?.length ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: 13, color: 'var(--sh-heading)' }}>
            Flashcards ({cards.length})
          </strong>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 12.5 }}>
            {cards.map((c, i) => (
              <li key={i} style={{ lineHeight: 1.5 }}>
                <div style={{ color: 'var(--sh-heading)', fontWeight: 600 }}>{c.question}</div>
                <div style={{ color: 'var(--sh-text)' }}>{c.answer}</div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {answer ? <ResultCard heading="Answer" body={answer} /> : null}
    </section>
  )
}

function ResultCard({ heading, body }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        border: '1px solid var(--sh-border)',
        background: 'var(--sh-soft)',
      }}
    >
      <strong
        style={{ fontSize: 12, color: 'var(--sh-heading)', display: 'block', marginBottom: 4 }}
      >
        {heading}
      </strong>
      <div
        style={{ fontSize: 13, color: 'var(--sh-text)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}
      >
        {body}
      </div>
    </div>
  )
}

function chipStyle(active) {
  return {
    padding: '4px 10px',
    fontSize: 11,
    borderRadius: 999,
    border: '1px solid var(--sh-border)',
    background: active ? 'var(--sh-brand)' : 'var(--sh-bg)',
    color: active ? '#fff' : 'var(--sh-text)',
    cursor: 'pointer',
    fontWeight: 600,
    textTransform: 'capitalize',
  }
}
