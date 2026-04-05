import { useState, useEffect } from 'react'
import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconInfoCircle } from '../../components/Icons'
import { LEGAL_EMAILS } from '../../lib/legalConstants'
import { POLICY_URLS } from '../../lib/legalVersions'

function DisclaimerPage() {
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (loaded) return
    const timer = setTimeout(() => setTimedOut(true), 10000)
    return () => clearTimeout(timer)
  }, [loaded])

  return (
    <LegalPageLayout
      tone="amber"
      title="Disclaimer"
      updated="Effective Date: April 2026"
      summary="Limitations of liability for StudyHub and its content."
      intro="This disclaimer outlines the limitations of liability for StudyHub and its content. StudyHub provides study materials created by students and does not guarantee their accuracy."
      icon={<IconInfoCircle size={26} />}
    >
      <LegalSection title="Disclaimer">
        <p>
          This disclaimer outlines the limitations of liability for StudyHub and its content.
          For full details, please review the disclaimer below.
        </p>
        <p>
          For legal inquiries, contact{' '}
          <a href={`mailto:${LEGAL_EMAILS.legal}`} style={{ color: 'var(--sh-brand)', textDecoration: 'none' }}>{LEGAL_EMAILS.legal}</a>.
        </p>
        <div style={{ position: 'relative', minHeight: 600 }}>
          {!loaded && !timedOut && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'var(--sh-soft)', borderRadius: 8,
              color: 'var(--sh-muted)', fontSize: 14,
            }}>
              Loading disclaimer...
            </div>
          )}
          {timedOut && !loaded && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: 'var(--sh-soft)',
              borderRadius: 8, gap: 12, padding: 20,
            }}>
              <p style={{ color: 'var(--sh-muted)', fontSize: 14, margin: 0, textAlign: 'center' }}>
                The disclaimer failed to load. You can view it directly on Termly:
              </p>
              <a
                href={POLICY_URLS.disclaimer}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--sh-brand)', fontSize: 14, fontWeight: 600 }}
              >
                View Disclaimer
              </a>
            </div>
          )}
          <iframe
            src={POLICY_URLS.disclaimer}
            style={{
              width: '100%', minHeight: 600, border: 'none', borderRadius: 8,
              opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease',
            }}
            title="Disclaimer"
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default DisclaimerPage
