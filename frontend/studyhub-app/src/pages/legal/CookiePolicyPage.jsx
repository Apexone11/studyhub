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
