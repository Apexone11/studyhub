/**
 * LegalTab.jsx -- Legal documents and privacy controls in Settings.
 *
 * Shows terms acceptance status, links to all legal documents,
 * and privacy controls (consent preferences, data request).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CURRENT_LEGAL_VERSION, LEGAL_DOCUMENT_LABELS } from '../../lib/legalVersions'
import { LEGAL_EMAILS } from '../../lib/legalConstants'
import { acceptCurrentLegalDocuments, fetchMyLegalStatus } from '../../lib/legalService'
import { useSession } from '../../lib/session-context'
import { SectionCard, Button, Message } from './settingsShared'
import { FONT } from './settingsState'

const LEGAL_DOC_ROUTES = {
  terms: '/terms',
  privacy: '/privacy',
  cookies: '/cookies',
  guidelines: '/guidelines',
  disclaimer: '/disclaimer',
}

function formatDateTime(value) {
  if (!value) return 'Not yet accepted'
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

/* ── Main Component ─────────────────────────────────────────────────── */

export default function LegalTab() {
  const { refreshSession, user } = useSession()
  const [termsStatus, setTermsStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')

    fetchMyLegalStatus()
      .then((data) => {
        if (active) {
          setTermsStatus(data)
          setError('')
        }
      })
      .catch((nextError) => {
        if (active) setError(nextError.message || 'Could not load terms acceptance status.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user?.id])

  const isTermsCurrent = Boolean(termsStatus && !termsStatus.needsAcceptance)
  const currentDocuments = termsStatus?.documents || []
  const missingRequiredDocuments = termsStatus?.missingRequiredDocuments || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Section 1: Terms Acceptance Status */}
      <SectionCard title="Terms Acceptance">
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--sh-muted)', padding: '8px 0' }}>
            Checking terms status...
          </div>
        ) : error ? (
          <Message tone="error">{error}</Message>
        ) : isTermsCurrent ? (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              background: 'var(--sh-success-bg)',
              border: '1px solid var(--sh-success-border)',
              color: 'var(--sh-success-text)',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <strong>Up to date</strong> -- Your required legal acceptance is current (version{' '}
            {termsStatus.acceptedVersion || CURRENT_LEGAL_VERSION}). Last confirmed{' '}
            {formatDateTime(termsStatus.lastAcceptedAt || termsStatus.acceptedAt)}.
          </div>
        ) : (
          <>
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: 'var(--sh-warning-bg)',
                border: '1px solid var(--sh-warning-border)',
                color: 'var(--sh-warning-text)',
                fontSize: 13,
                lineHeight: 1.6,
                marginBottom: 12,
              }}
            >
              <strong>Update required</strong> -- Review and accept the latest required legal
              documents to keep using StudyHub. Missing:{' '}
              {missingRequiredDocuments
                .map((slug) => LEGAL_DOCUMENT_LABELS[slug] || slug)
                .join(', ')}
              .
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link to="/settings?tab=legal" style={{ textDecoration: 'none' }}>
                <Button secondary>Review in Settings</Button>
              </Link>
              <Button
                disabled={accepting}
                onClick={async () => {
                  setAccepting(true)
                  setError('')
                  try {
                    const data = await acceptCurrentLegalDocuments()
                    setTermsStatus(data)
                    await refreshSession()
                  } catch (nextError) {
                    setError(nextError.message || 'Could not save your legal acceptance.')
                  } finally {
                    setAccepting(false)
                  }
                }}
              >
                {accepting ? 'Accepting...' : 'Accept Current Documents'}
              </Button>
            </div>
          </>
        )}
      </SectionCard>

      {/* Section 2: Legal Documents */}
      <SectionCard
        title="Legal Documents"
        subtitle="Review all of our legal policies and guidelines."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {currentDocuments.map((doc) => (
            <div
              key={doc.slug}
              style={{
                background: 'var(--sh-bg)',
                border: '1px solid var(--sh-border)',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)' }}>
                  {doc.title}
                </div>
                <span
                  style={{
                    padding: '4px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 800,
                    background:
                      doc.requiredAtSignup && !doc.isAccepted
                        ? 'var(--sh-warning-bg)'
                        : doc.isAccepted
                          ? 'var(--sh-success-bg)'
                          : 'var(--sh-soft)',
                    border: `1px solid ${doc.requiredAtSignup && !doc.isAccepted ? 'var(--sh-warning-border)' : doc.isAccepted ? 'var(--sh-success-border)' : 'var(--sh-border)'}`,
                    color:
                      doc.requiredAtSignup && !doc.isAccepted
                        ? 'var(--sh-warning-text)'
                        : doc.isAccepted
                          ? 'var(--sh-success-text)'
                          : 'var(--sh-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {doc.requiredAtSignup && !doc.isAccepted
                    ? 'Required'
                    : doc.isAccepted
                      ? 'Accepted'
                      : 'Optional'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5, flex: 1 }}>
                {doc.summary}
              </div>
              <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                {doc.updatedLabel}
                {doc.acceptedAt ? ` · Accepted ${formatDateTime(doc.acceptedAt)}` : ''}
              </div>
              <Link
                to={LEGAL_DOC_ROUTES[doc.slug] || '/terms'}
                style={{ textDecoration: 'none', marginTop: 4 }}
              >
                <Button secondary style={{ fontSize: 12, padding: '7px 14px', width: '100%' }}>
                  View Document
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Section 3: Privacy Controls */}
      <SectionCard
        title="Privacy Controls"
        subtitle="Manage your consent preferences and personal data."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {/* Consent Preferences */}
          <div
            style={{
              background: 'var(--sh-bg)',
              border: '1px solid var(--sh-border)',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)' }}>
              Consent Preferences
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5, flex: 1 }}>
              Manage how cookies and tracking technologies are used during your visit.
            </div>
            <a
              href="#"
              className="termly-display-preferences"
              onClick={(e) => e.preventDefault()}
              style={{
                display: 'inline-block',
                padding: '7px 14px',
                borderRadius: 10,
                border: '1px solid var(--sh-btn-secondary-border)',
                background: 'var(--sh-btn-secondary-bg)',
                color: 'var(--sh-btn-secondary-text)',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: FONT,
                textDecoration: 'none',
                textAlign: 'center',
                cursor: 'pointer',
                marginTop: 4,
              }}
            >
              Manage Cookie Consent
            </a>
          </div>

          {/* Data Request */}
          <div
            style={{
              background: 'var(--sh-bg)',
              border: '1px solid var(--sh-border)',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)' }}>
              Data Request
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5, flex: 1 }}>
              Request access to, correction of, or deletion of your personal data.
            </div>
            <Link to="/data-request" style={{ textDecoration: 'none', marginTop: 4 }}>
              <Button secondary style={{ fontSize: 12, padding: '7px 14px', width: '100%' }}>
                Submit Data Request
              </Button>
            </Link>
          </div>
        </div>
      </SectionCard>

      {/* Section 4: Legal Contacts */}
      <SectionCard title="Legal Contacts" subtitle="Reach our legal and privacy teams directly.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Privacy Inquiries & Data Requests', email: LEGAL_EMAILS.privacy },
            { label: 'General Legal Questions', email: LEGAL_EMAILS.legal },
            { label: 'DMCA & Copyright Notices', email: LEGAL_EMAILS.dmca },
          ].map(({ label, email }) => (
            <div
              key={email}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: 10,
                background: 'var(--sh-bg)',
                border: '1px solid var(--sh-border)',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-text)' }}>
                {label}
              </span>
              <a
                href={`mailto:${email}`}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--sh-brand)',
                  textDecoration: 'none',
                  fontFamily: FONT,
                }}
              >
                {email}
              </a>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
