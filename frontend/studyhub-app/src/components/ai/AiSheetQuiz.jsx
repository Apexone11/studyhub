/* ═══════════════════════════════════════════════════════════════════════════
 * AiSheetQuiz.jsx — in-bubble "Quiz me" mode for the sheet AI report card.
 *
 * Renders INSIDE the AiBubble in place of the AiSheetReport card while the
 * user is taking a quiz. Generates {count} questions at the requested
 * difficulty against `POST /api/ai/sheets/:sheetId/quiz`, then walks
 * through them one at a time with a "Show answer" toggle and Prev/Next
 * navigation. Local state only — quizzes do not persist.
 *
 * Permissions: any logged-in user who can read the sheet. The backend
 * enforces the same canRead() check the analyze endpoint uses; the UI
 * mirrors that by being available on every sheet (no canEdit gate).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useMemo, useState } from 'react'
import { API } from '../../config'

const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]
const QUESTION_COUNTS = [3, 5, 8, 10, 15]

/**
 * Minimal client for the quiz endpoint. Lives inline rather than in
 * aiSheetService.js to keep this loop's diff to the single new component
 * file.
 */
async function fetchQuiz(sheetId, { count, difficulty }) {
  try {
    const res = await fetch(`${API}/api/ai/sheets/${sheetId}/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ count, difficulty }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = data?.error?.message || data?.error || data?.message || `HTTP ${res.status}`
      return { ok: false, error: message, status: res.status }
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err?.message || 'Network error.', status: 0 }
  }
}

/**
 * Normalize a quiz response so the renderer can trust the shape. The
 * backend already shape-guards, but a defensive client clamp keeps the
 * UI resilient if the contract ever drifts.
 */
function normalizeQuestion(q) {
  if (!q || typeof q !== 'object') return null
  const type = q.type
  if (type !== 'multiple_choice' && type !== 'short_answer' && type !== 'true_false') {
    return null
  }
  const question = typeof q.question === 'string' ? q.question : ''
  const answer = typeof q.answer === 'string' ? q.answer : ''
  const explanation = typeof q.explanation === 'string' ? q.explanation : ''
  if (!question || !answer) return null
  const shaped = { type, question, answer, explanation }
  if (type === 'multiple_choice') {
    shaped.choices = Array.isArray(q.choices)
      ? q.choices.filter((c) => typeof c === 'string' && c.length > 0)
      : []
    if (shaped.choices.length < 2) return null
  }
  return shaped
}

export default function AiSheetQuiz({ sheetId, onClose }) {
  // Configuration phase → loading → in-progress → completed.
  const [phase, setPhase] = useState('configure')
  const [count, setCount] = useState(5)
  const [difficulty, setDifficulty] = useState('medium')
  const [error, setError] = useState(null)
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  // Map of questionIndex → { selectedAnswer, revealed } so re-navigation
  // preserves the user's working state without re-fetching.
  const [responses, setResponses] = useState({})

  const handleStart = useCallback(async () => {
    setPhase('loading')
    setError(null)
    const res = await fetchQuiz(sheetId, { count, difficulty })
    if (!res.ok) {
      setError(res.error)
      setPhase('configure')
      return
    }
    const normalized = Array.isArray(res.data?.questions)
      ? res.data.questions.map(normalizeQuestion).filter(Boolean)
      : []
    if (normalized.length === 0) {
      setError('AI returned no usable questions. Please try again.')
      setPhase('configure')
      return
    }
    setQuestions(normalized)
    setIndex(0)
    setResponses({})
    setPhase('in_progress')
  }, [sheetId, count, difficulty])

  const handleReveal = useCallback(() => {
    setResponses((prev) => ({
      ...prev,
      [index]: { ...(prev[index] || {}), revealed: true },
    }))
  }, [index])

  const handleSelectChoice = useCallback(
    (choice) => {
      setResponses((prev) => ({
        ...prev,
        [index]: { ...(prev[index] || {}), selectedAnswer: choice },
      }))
    },
    [index],
  )

  const handlePrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const handleNext = useCallback(() => {
    setIndex((i) => Math.min(questions.length - 1, i + 1))
  }, [questions.length])

  const handleFinish = useCallback(() => {
    setPhase('completed')
  }, [])

  const handleRestart = useCallback(() => {
    setPhase('configure')
    setQuestions([])
    setResponses({})
    setIndex(0)
    setError(null)
  }, [])

  // Score: count of questions where the user's selectedAnswer matches
  // the canonical answer (case-insensitive trim). short_answer questions
  // self-score on reveal — we mark them correct iff the user revealed
  // and acknowledged "I knew it" via the same selectedAnswer field.
  const score = useMemo(() => {
    if (questions.length === 0) return { correct: 0, total: 0 }
    let correct = 0
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i]
      const r = responses[i]
      if (!r) continue
      const selected = String(r.selectedAnswer || '')
        .trim()
        .toLowerCase()
      const expected = String(q.answer || '')
        .trim()
        .toLowerCase()
      if (selected && selected === expected) correct += 1
    }
    return { correct, total: questions.length }
  }, [questions, responses])

  // ── Render branches ──────────────────────────────────────────────

  return (
    <div
      style={{
        border: '1px solid var(--sh-border)',
        borderRadius: 12,
        background: 'var(--sh-soft)',
        padding: 12,
        marginBottom: 12,
        fontSize: 12.5,
        color: 'var(--sh-text)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 12.5, color: 'var(--sh-heading)' }}>
          Quiz me on this sheet
        </strong>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quiz"
            style={ghostButtonStyle()}
          >
            Back
          </button>
        ) : null}
      </header>

      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      {phase === 'configure' ? (
        <ConfigurePanel
          count={count}
          difficulty={difficulty}
          onCountChange={setCount}
          onDifficultyChange={setDifficulty}
          onStart={handleStart}
        />
      ) : null}

      {phase === 'loading' ? (
        <p style={{ margin: 0, color: 'var(--sh-muted)', fontSize: 12 }}>Generating your quiz…</p>
      ) : null}

      {phase === 'in_progress' && questions.length > 0 ? (
        <QuestionView
          question={questions[index]}
          index={index}
          total={questions.length}
          response={responses[index]}
          onSelect={handleSelectChoice}
          onReveal={handleReveal}
          onPrev={handlePrev}
          onNext={handleNext}
          onFinish={handleFinish}
        />
      ) : null}

      {phase === 'completed' ? (
        <Scorecard
          score={score}
          questions={questions}
          responses={responses}
          onRestart={handleRestart}
        />
      ) : null}
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────

function ConfigurePanel({ count, difficulty, onCountChange, onDifficultyChange, onStart }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, color: 'var(--sh-muted)', fontSize: 11.5 }}>
        Hub AI will generate a mix of multiple-choice, true/false, and short-answer questions from
        this sheet.
      </p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={fieldLabelStyle()} htmlFor="ai-quiz-count">
          Questions
        </label>
        <select
          id="ai-quiz-count"
          value={count}
          onChange={(e) => onCountChange(Number(e.target.value))}
          style={selectStyle()}
        >
          {QUESTION_COUNTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <label style={fieldLabelStyle()} htmlFor="ai-quiz-difficulty">
          Difficulty
        </label>
        <select
          id="ai-quiz-difficulty"
          value={difficulty}
          onChange={(e) => onDifficultyChange(e.target.value)}
          style={selectStyle()}
        >
          {DIFFICULTIES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <button type="button" onClick={onStart} style={primaryActionStyle(false)}>
          Start quiz
        </button>
      </div>
    </div>
  )
}

function QuestionView({
  question,
  index,
  total,
  response,
  onSelect,
  onReveal,
  onPrev,
  onNext,
  onFinish,
}) {
  const revealed = !!response?.revealed
  const selected = response?.selectedAnswer || ''
  const isLast = index === total - 1
  const expected = String(question.answer || '')
    .trim()
    .toLowerCase()

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--sh-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          fontWeight: 700,
        }}
      >
        Question {index + 1} of {total} · {humanizeType(question.type)}
      </div>

      <div
        style={{
          fontSize: 13,
          color: 'var(--sh-heading)',
          lineHeight: 1.5,
          fontWeight: 600,
        }}
      >
        {question.question}
      </div>

      {/* Answer interaction depends on the question type. */}
      {question.type === 'multiple_choice' ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {question.choices.map((choice, i) => {
            const checked = selected === choice
            const isCorrect = revealed && String(choice).trim().toLowerCase() === expected
            const isWrongSelection = revealed && checked && !isCorrect
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(choice)}
                disabled={revealed}
                style={choiceButtonStyle({ checked, isCorrect, isWrongSelection, revealed })}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>{choice}</span>
                {revealed && isCorrect ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-success-text)' }}>
                    Correct
                  </span>
                ) : null}
                {isWrongSelection ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-danger-text)' }}>
                    Your pick
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {question.type === 'true_false' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          {['true', 'false'].map((opt) => {
            const checked = selected === opt
            const isCorrect = revealed && opt === expected
            const isWrongSelection = revealed && checked && !isCorrect
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onSelect(opt)}
                disabled={revealed}
                style={choiceButtonStyle({ checked, isCorrect, isWrongSelection, revealed })}
              >
                <span style={{ flex: 1, textAlign: 'left', textTransform: 'capitalize' }}>
                  {opt}
                </span>
                {revealed && isCorrect ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-success-text)' }}>
                    Correct
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {question.type === 'short_answer' ? (
        <textarea
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          disabled={revealed}
          rows={2}
          placeholder="Type your answer (then click Show answer to self-check)…"
          style={{
            width: '100%',
            padding: 8,
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-bg)',
            color: 'var(--sh-text)',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      ) : null}

      {/* Reveal + explanation */}
      {revealed ? (
        <div
          style={{
            border: '1px solid var(--sh-border)',
            borderRadius: 8,
            background: 'var(--sh-surface)',
            padding: 8,
            fontSize: 12,
            color: 'var(--sh-text)',
            display: 'grid',
            gap: 4,
          }}
        >
          <div style={{ color: 'var(--sh-heading)', fontWeight: 600 }}>
            Answer: {question.answer}
          </div>
          {question.explanation ? (
            <div style={{ color: 'var(--sh-muted)', lineHeight: 1.45 }}>{question.explanation}</div>
          ) : null}
        </div>
      ) : (
        <div>
          <button type="button" onClick={onReveal} style={secondaryActionStyle()}>
            Show answer
          </button>
        </div>
      )}

      {/* Navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 6,
          paddingTop: 6,
          borderTop: '1px solid var(--sh-border)',
        }}
      >
        <button
          type="button"
          onClick={onPrev}
          disabled={index === 0}
          style={secondaryActionStyle(index === 0)}
        >
          Previous
        </button>
        {isLast ? (
          <button type="button" onClick={onFinish} style={primaryActionStyle(false)}>
            Finish quiz
          </button>
        ) : (
          <button type="button" onClick={onNext} style={primaryActionStyle(false)}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}

function Scorecard({ score, questions, responses, onRestart }) {
  // For short_answer the score helper only counts exact matches — most
  // open-ended answers will read as "skipped." Surface a breakdown row
  // per question so the user can self-assess.
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: 'var(--sh-success-bg, var(--sh-soft))',
          border: '1px solid var(--sh-success-border, var(--sh-border))',
          color: 'var(--sh-success-text, var(--sh-heading))',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        You scored {score.correct} of {score.total}.
      </div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 0,
          listStyle: 'none',
          display: 'grid',
          gap: 6,
        }}
      >
        {questions.map((q, i) => {
          const r = responses[i]
          const selected = String(r?.selectedAnswer || '')
            .trim()
            .toLowerCase()
          const expected = String(q.answer || '')
            .trim()
            .toLowerCase()
          const correct = selected && selected === expected
          return (
            <li
              key={i}
              style={{
                fontSize: 11.5,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                lineHeight: 1.4,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  marginTop: 4,
                  flexShrink: 0,
                  background: correct ? 'var(--sh-success, #22c55e)' : 'var(--sh-warning, #f59e0b)',
                  boxShadow: '0 0 0 2px var(--sh-soft)',
                }}
              />
              <span>
                <strong style={{ color: 'var(--sh-heading)' }}>Q{i + 1}.</strong>{' '}
                <span style={{ color: 'var(--sh-text)' }}>{q.question}</span>
                <br />
                <span style={{ color: 'var(--sh-muted)' }}>Answer: {q.answer}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <div>
        <button type="button" onClick={onRestart} style={primaryActionStyle(false)}>
          New quiz
        </button>
      </div>
    </div>
  )
}

function ErrorBanner({ message, onDismiss }) {
  return (
    <div
      role="alert"
      style={{
        background: 'var(--sh-danger-bg)',
        color: 'var(--sh-danger-text)',
        border: '1px solid var(--sh-danger-border, var(--sh-border))',
        borderRadius: 8,
        padding: '6px 8px',
        marginBottom: 8,
        fontSize: 11.5,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 11,
          padding: 0,
        }}
      >
        Dismiss
      </button>
    </div>
  )
}

// ── Helpers + styles ─────────────────────────────────────────────────

function humanizeType(type) {
  if (type === 'multiple_choice') return 'Multiple choice'
  if (type === 'true_false') return 'True / false'
  if (type === 'short_answer') return 'Short answer'
  return 'Question'
}

function primaryActionStyle(disabled) {
  return {
    background: disabled ? 'var(--sh-soft)' : 'var(--sh-brand)',
    color: disabled ? 'var(--sh-muted)' : '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

function secondaryActionStyle(disabled = false) {
  return {
    background: 'var(--sh-surface)',
    color: disabled ? 'var(--sh-muted)' : 'var(--sh-text)',
    border: '1px solid var(--sh-border)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

function ghostButtonStyle() {
  return {
    background: 'transparent',
    border: 'none',
    color: 'var(--sh-muted)',
    fontSize: 11,
    cursor: 'pointer',
    padding: 2,
  }
}

function choiceButtonStyle({ checked, isCorrect, isWrongSelection, revealed }) {
  let border = '1px solid var(--sh-border)'
  let background = 'var(--sh-surface)'
  if (checked && !revealed) {
    border = '1px solid var(--sh-brand)'
    background = 'var(--sh-soft)'
  }
  if (revealed && isCorrect) {
    border = '1px solid var(--sh-success-border, var(--sh-success, #22c55e))'
    background = 'var(--sh-success-bg, var(--sh-soft))'
  }
  if (isWrongSelection) {
    border = '1px solid var(--sh-danger-border, var(--sh-danger, #ef4444))'
    background = 'var(--sh-danger-bg, var(--sh-soft))'
  }
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 10px',
    fontSize: 12,
    color: 'var(--sh-text)',
    background,
    border,
    borderRadius: 8,
    cursor: revealed ? 'default' : 'pointer',
    textAlign: 'left',
  }
}

function fieldLabelStyle() {
  return {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--sh-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  }
}

function selectStyle() {
  return {
    padding: '4px 6px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-bg)',
    color: 'var(--sh-text)',
  }
}
