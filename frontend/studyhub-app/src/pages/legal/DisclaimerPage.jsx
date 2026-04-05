import { useEffect, useRef, useState } from 'react'
import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconInfoCircle } from '../../components/Icons'
import { LEGAL_EMAILS } from '../../lib/legalConstants'
import { TERMLY_UUIDS, POLICY_URLS } from '../../lib/legalVersions'

function DisclaimerPage() {
  const containerRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  // Use Termly's code snippet embed instead of iframe
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Create the Termly embed div
    const embed = document.createElement('div')
    embed.setAttribute('name', 'termly-embed')
    embed.setAttribute('data-id', TERMLY_UUIDS.disclaimer)
    container.appendChild(embed)

    // Watch for Termly to populate the embed
    const observer = new MutationObserver(() => {
      if (embed.children.length > 0) {
        setLoaded(true)
        observer.disconnect()
      }
    })
    observer.observe(embed, { childList: true, subtree: true })

    // Timeout fallback
    const timer = setTimeout(() => setTimedOut(true), 10000)

    return () => {
      observer.disconnect()
      clearTimeout(timer)
      if (container && embed.parentNode === container) {
        container.removeChild(embed)
      }
    }
  }, [])

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
        <div style={{ position: 'relative', minHeight: 400 }}>
          {!loaded && !timedOut && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 200, color: 'var(--sh-muted)', fontSize: 14,
            }}>
              Loading disclaimer...
            </div>
          )}
          {timedOut && !loaded && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: 200, gap: 12, padding: 20,
            }}>
              <p style={{ color: 'var(--sh-muted)', fontSize: 14, margin: 0, textAlign: 'center' }}>
                The disclaimer could not be loaded inline. You can view it directly:
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
          <div
            ref={containerRef}
            style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
          />
        </div>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default DisclaimerPage
