import { useState } from 'react'
import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconShieldCheck } from '../../components/Icons'
import { LEGAL_EMAILS } from '../../lib/legalConstants'
import { API } from '../../config'

const REQUEST_TYPES = [
  { value: 'access', label: 'Access — request a copy of my data' },
  { value: 'correction', label: 'Correction — fix inaccurate data' },
  { value: 'deletion', label: 'Deletion — delete my account and data' },
  { value: 'portability', label: 'Portability — export my data' },
  { value: 'other', label: 'Other — I will explain below' },
]

const LAW_OPTIONS = [
  { value: 'CCPA', label: 'CCPA (California, USA)' },
  { value: 'GDPR', label: 'GDPR (European Union / UK)' },
  { value: 'Both', label: 'Both CCPA and GDPR' },
  { value: 'Other', label: 'Other privacy law' },
]

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--sh-input-border)',
  borderRadius: 8,
  fontSize: 14,
  color: 'var(--sh-input-text)',
  background: 'var(--sh-input-bg)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--sh-text)',
  marginBottom: 6,
}

const fieldStyle = { marginBottom: 16 }

function DataRequestPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [requestType, setRequestType] = useState('')
  const [law, setLaw] = useState('')
  const [message, setMessage] = useState('')
  // Honeypot: hidden field bots will fill but humans never see.
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState({ kind: 'idle', text: '' })

  function validate() {
    if (!name.trim()) return 'Please enter your name.'
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Please enter a valid email address.'
    }
    if (!requestType) return 'Please choose a request type.'
    if (!law) return 'Please choose the governing privacy law.'
    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return

    const validationError = validate()
    if (validationError) {
      setStatus({ kind: 'error', text: validationError })
      return
    }

    setSubmitting(true)
    setStatus({ kind: 'idle', text: '' })

    try {
      const response = await fetch(`${API}/api/legal/data-request`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          requestType,
          law,
          message: message.trim(),
          website,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const errorText =
          response.status === 429
            ? 'Too many requests. Please try again in an hour.'
            : data.error || 'Could not submit your request. Please email us directly.'
        setStatus({ kind: 'error', text: errorText })
        return
      }

      setStatus({
        kind: 'success',
        text: 'Your request has been submitted. We will respond within 24 hours.',
      })
      setName('')
      setEmail('')
      setRequestType('')
      setLaw('')
      setMessage('')
    } catch {
      setStatus({
        kind: 'error',
        text: 'Network error. Please try again or email us directly.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <LegalPageLayout
      tone="blue"
      title="Data Request"
      updated="Your Privacy Rights"
      summary="Request access to, correction of, or deletion of your personal data."
      intro="Under privacy laws including CCPA and GDPR, you have the right to manage your personal data. Use this page to submit a request."
      icon={<IconShieldCheck size={26} />}
    >
      <LegalSection title="Submit a Data Request">
        <p>
          Under privacy laws including CCPA and GDPR, you have the right to request access to your
          personal data, ask for corrections, or request deletion. Use the form below to submit your
          request. We will respond within 24 hours.
        </p>
        <p>
          You can also email us directly at{' '}
          <a
            href={`mailto:${LEGAL_EMAILS.privacy}`}
            style={{ color: 'var(--sh-brand)', textDecoration: 'none' }}
          >
            {LEGAL_EMAILS.privacy}
          </a>
          .
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
          style={{
            marginTop: 24,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 12,
            padding: 24,
          }}
        >
          {/* Honeypot — hidden from users, bots fill it. */}
          <div
            style={{
              position: 'absolute',
              left: '-10000px',
              top: 'auto',
              width: 1,
              height: 1,
              overflow: 'hidden',
            }}
            aria-hidden="true"
          >
            <label>
              Website
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>

          <div style={fieldStyle}>
            <label htmlFor="dsar-name" style={labelStyle}>
              Your name <span style={{ color: 'var(--sh-danger-text)' }}>*</span>
            </label>
            <input
              id="dsar-name"
              type="text"
              autoComplete="name"
              maxLength={120}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="dsar-email" style={labelStyle}>
              Email used on StudyHub <span style={{ color: 'var(--sh-danger-text)' }}>*</span>
            </label>
            <input
              id="dsar-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="dsar-type" style={labelStyle}>
              Request type <span style={{ color: 'var(--sh-danger-text)' }}>*</span>
            </label>
            <select
              id="dsar-type"
              required
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select a request type…</option>
              {REQUEST_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label htmlFor="dsar-law" style={labelStyle}>
              Under which privacy law? <span style={{ color: 'var(--sh-danger-text)' }}>*</span>
            </label>
            <select
              id="dsar-law"
              required
              value={law}
              onChange={(e) => setLaw(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select a privacy law…</option>
              {LAW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label htmlFor="dsar-message" style={labelStyle}>
              Additional details (optional)
            </label>
            <textarea
              id="dsar-message"
              maxLength={2000}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: 'var(--sh-muted)',
                textAlign: 'right',
              }}
            >
              {message.length} / 2000
            </div>
          </div>

          {status.kind === 'error' && (
            <div
              role="alert"
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--sh-danger-bg)',
                border: '1px solid var(--sh-danger-border)',
                color: 'var(--sh-danger-text)',
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {status.text}
            </div>
          )}

          {status.kind === 'success' && (
            <div
              role="status"
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--sh-success-bg)',
                border: '1px solid var(--sh-success-border)',
                color: 'var(--sh-success-text)',
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {status.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '12px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--sh-brand)',
              color: 'var(--sh-btn-primary-text)',
              fontSize: 14,
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </form>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default DataRequestPage
