import { useEffect, useRef, useState } from 'react'
import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconShield } from '../../components/Icons'
import { LEGAL_EMAILS } from '../../lib/legalConstants'
import { TERMLY_UUIDS, POLICY_URLS } from '../../lib/legalVersions'

function CookiePolicyPage() {
  const containerRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  // Use Termly's code snippet embed instead of iframe
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Dynamically load the Termly embed SDK if not already present
    if (!document.getElementById('termly-jssdk')) {
      const script = document.createElement('script')
      script.id = 'termly-jssdk'
      script.src = 'https://app.termly.io/embed.min.js'
      script.setAttribute('data-auto-block', 'on')
      document.body.appendChild(script)
    }

    // Create the Termly embed div
    const embed = document.createElement('div')
    embed.setAttribute('name', 'termly-embed')
    embed.setAttribute('data-id', TERMLY_UUIDS.cookies)
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
        <div style={{ position: 'relative', minHeight: 400 }}>
          {!loaded && !timedOut && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 200, color: 'var(--sh-muted)', fontSize: 14,
            }}>
              Loading cookie policy...
            </div>
          )}
          {timedOut && !loaded && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: 200, gap: 12, padding: 20,
            }}>
              <p style={{ color: 'var(--sh-muted)', fontSize: 14, margin: 0, textAlign: 'center' }}>
                The cookie policy could not be loaded inline. You can view it directly:
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
          <div
            ref={containerRef}
            style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
          />
        </div>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default CookiePolicyPage
