/**
 * LegalTab.jsx -- Legal documents and privacy controls in Settings.
 *
 * Shows terms acceptance status, links to all legal documents,
 * and privacy controls (consent preferences, data request).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'
import { CURRENT_TERMS_VERSION } from '../../lib/legalVersions'
import { SectionCard, Button, Message } from './settingsShared'
import { FONT } from './settingsState'

/* ── Legal documents config ─────────────────────────────────────────── */

const LEGAL_DOCS = [
  { title: 'Terms of Use', description: 'Rules governing your use of StudyHub.', to: '/terms' },
  { title: 'Privacy Policy', description: 'How we collect, use, and protect your data.', to: '/privacy' },
  { title: 'Cookie Policy', description: 'How StudyHub uses cookies and tracking technologies.', to: '/cookies' },
  { title: 'Community Guidelines', description: 'Standards for respectful collaboration.', to: '/guidelines' },
  { title: 'Disclaimer', description: 'Limitations of liability for StudyHub content.', to: '/disclaimer' },
]

/* ── Main Component ─────────────────────────────────────────────────── */

export default function LegalTab() {
  const [termsStatus, setTermsStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch(`${API}/api/users/me/terms-status`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load terms status.')
        return r.json()
      })
      .then((data) => {
        if (active) setTermsStatus(data)
      })
      .catch(() => {
        if (active) setError('Could not load terms acceptance status.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const isTermsCurrent = termsStatus?.termsAcceptedVersion === CURRENT_TERMS_VERSION

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
          <div style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: 'var(--sh-success-bg)',
            border: '1px solid var(--sh-success-border)',
            color: 'var(--sh-success-text)',
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            <strong>Up to date</strong> -- Your terms acceptance is current (version {termsStatus.termsAcceptedVersion}).
          </div>
        ) : (
          <>
            <div style={{
              padding: '12px 16px',
              borderRadius: 10,
              background: 'var(--sh-warning-bg)',
              border: '1px solid var(--sh-warning-border)',
              color: 'var(--sh-warning-text)',
              fontSize: 13,
              lineHeight: 1.6,
              marginBottom: 12,
            }}>
              <strong>Update required</strong> -- Our terms have been updated. Please review and accept the latest version.
            </div>
            <Link to="/terms" style={{ textDecoration: 'none' }}>
              <Button>Review and Accept</Button>
            </Link>
          </>
        )}
      </SectionCard>

      {/* Section 2: Legal Documents */}
      <SectionCard title="Legal Documents" subtitle="Review all of our legal policies and guidelines.">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}>
          {LEGAL_DOCS.map((doc) => (
            <div
              key={doc.to}
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
                {doc.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5, flex: 1 }}>
                {doc.description}
              </div>
              <Link to={doc.to} style={{ textDecoration: 'none', marginTop: 4 }}>
                <Button secondary style={{ fontSize: 12, padding: '7px 14px', width: '100%' }}>
                  View Document
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Section 3: Privacy Controls */}
      <SectionCard title="Privacy Controls" subtitle="Manage your consent preferences and personal data.">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}>
          {/* Consent Preferences */}
          <div style={{
            background: 'var(--sh-bg)',
            border: '1px solid var(--sh-border)',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
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
          <div style={{
            background: 'var(--sh-bg)',
            border: '1px solid var(--sh-border)',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
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
    </div>
  )
}
