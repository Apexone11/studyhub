/* ═══════════════════════════════════════════════════════════════════════════
 * SubmitPage.jsx — Course request submission form
 *
 * Allows students to request a missing course be added to the platform.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { PageShell } from '../shared/pageScaffold'
import { usePageTitle } from '../../lib/usePageTitle'

export default function SubmitPage() {
  usePageTitle('Request a Course')
  const [courseName, setCourseName] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!courseName.trim()) return

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/courses/request`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          courseName: courseName.trim(),
          courseCode: courseCode.trim(),
          reason: reason.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to submit request')
      }

      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell
      nav={<Navbar crumbs={[{ label: 'Request a Course', to: '/submit' }]} hideTabs />}
      sidebar={<AppSidebar />}
    >
      <div style={s.card}>
        <h1 style={s.title}>Request a Missing Course</h1>
        <p style={s.subtitle}>
          Cannot find your course? Let us know and we will add it within 24 hours.
        </p>

        {submitted ? (
          <div style={s.successBox}>
            <h2 style={s.successTitle}>Request submitted</h2>
            <p style={s.successText}>
              Thank you for your request. We will review it and add the course shortly.
            </p>
            <button
              onClick={() => {
                setSubmitted(false)
                setCourseName('')
                setCourseCode('')
                setReason('')
              }}
              style={s.submitBtn}
            >
              Submit Another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={s.form}>
            {error && <div style={s.errorBox}>{error}</div>}

            <div style={s.field}>
              <label htmlFor="course-name" style={s.label}>
                Course Name *
              </label>
              <input
                id="course-name"
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="e.g. Introduction to Psychology"
                required
                style={s.input}
              />
            </div>

            <div style={s.field}>
              <label htmlFor="course-code" style={s.label}>
                Course Code
              </label>
              <input
                id="course-code"
                type="text"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="e.g. PSYC101"
                style={s.input}
              />
            </div>

            <div style={s.field}>
              <label htmlFor="reason" style={s.label}>
                Additional Details
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Which school? Which department? Any other details that help us find the right course."
                rows={4}
                style={{ ...s.input, resize: 'vertical', minHeight: 100 }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !courseName.trim()}
              style={{
                ...s.submitBtn,
                opacity: submitting || !courseName.trim() ? 0.5 : 1,
                cursor: submitting || !courseName.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        )}
      </div>
    </PageShell>
  )
}

const s = {
  card: {
    background: 'var(--sh-surface)',
    borderRadius: 16,
    border: '1px solid var(--sh-border)',
    padding: 32,
    maxWidth: 600,
  },
  title: {
    fontSize: 20,
    fontWeight: 800,
    color: 'var(--sh-heading)',
    marginBottom: 8,
    margin: '0 0 8px',
  },
  subtitle: {
    fontSize: 14,
    color: 'var(--sh-muted)',
    marginBottom: 24,
    margin: '0 0 24px',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--sh-text)',
  },
  input: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-input-bg)',
    color: 'var(--sh-input-text)',
    fontSize: 14,
    fontFamily: 'var(--font)',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  submitBtn: {
    padding: '12px 24px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--sh-brand)',
    color: 'white',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
    alignSelf: 'flex-start',
  },
  errorBox: {
    background: 'var(--sh-danger-bg)',
    border: '1px solid var(--sh-danger-border)',
    color: 'var(--sh-danger-text)',
    borderRadius: 10,
    padding: '12px 16px',
    fontSize: 13,
  },
  successBox: {
    textAlign: 'center',
    padding: '20px 0',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--sh-success-text)',
    margin: '0 0 8px',
  },
  successText: {
    fontSize: 14,
    color: 'var(--sh-muted)',
    margin: '0 0 20px',
  },
}
