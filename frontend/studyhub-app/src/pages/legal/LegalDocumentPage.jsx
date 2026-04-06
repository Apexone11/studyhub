import { useRef } from 'react'
import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import LegalDocumentText from '../../components/LegalDocumentText'
import { POLICY_URLS } from '../../lib/legalVersions'
import { useCurrentLegalDocument } from '../../lib/legalService'
import useTermlyEmbed from '../../lib/useTermlyEmbed'

const styles = {
  viewer: {
    position: 'relative',
    minHeight: 260,
    borderRadius: 16,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-bg)',
    overflow: 'hidden',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    color: 'var(--sh-muted)',
    fontSize: 14,
  },
  fallbackWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: '20px 22px',
  },
  fallbackBadge: {
    alignSelf: 'flex-start',
    padding: '6px 10px',
    borderRadius: 999,
    background: 'var(--sh-info-bg)',
    border: '1px solid var(--sh-info-border)',
    color: 'var(--sh-info-text)',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  fallbackLink: {
    color: 'var(--sh-brand)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 700,
  },
  errorBox: {
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    color: 'var(--sh-muted)',
    fontSize: 14,
    textAlign: 'center',
  },
}

export default function LegalDocumentPage({
  slug,
  tone,
  icon,
  fallbackTitle,
  fallbackSummary,
  fallbackIntro,
  fallbackUpdated,
}) {
  const containerRef = useRef(null)
  const { document: legalDocument, loading, error } = useCurrentLegalDocument(slug)
  const termlyEmbed = useTermlyEmbed(containerRef, legalDocument?.termlyEmbedId, {
    enabled: Boolean(legalDocument?.termlyEmbedId),
  })

  const title = legalDocument?.title || fallbackTitle
  const summary = legalDocument?.summary || fallbackSummary
  const intro = legalDocument?.intro || fallbackIntro
  const updated = legalDocument?.updatedLabel || fallbackUpdated
  const policyUrl = legalDocument?.termlyUrl || POLICY_URLS[slug] || null
  const showFallback = Boolean(legalDocument && (!legalDocument.termlyEmbedId || termlyEmbed.timedOut))

  let content = null

  if (loading && !legalDocument) {
    content = <div style={styles.loading}>Loading legal document...</div>
  } else if (showFallback && legalDocument?.bodyText) {
    content = (
      <div style={styles.fallbackWrap}>
        <span style={styles.fallbackBadge}>StudyHub Backup Copy</span>
        <LegalDocumentText bodyText={legalDocument.bodyText} />
        {policyUrl && (
          <a href={policyUrl} target="_blank" rel="noopener noreferrer" style={styles.fallbackLink}>
            Open the hosted Termly version
          </a>
        )}
      </div>
    )
  } else if (legalDocument?.termlyEmbedId) {
    content = (
      <>
        {!termlyEmbed.loaded && (
          <div style={styles.loading}>Loading legal document...</div>
        )}
        <div
          ref={containerRef}
          style={{
            padding: 16,
            opacity: termlyEmbed.loaded ? 1 : 0,
            transition: 'opacity 0.25s ease',
          }}
        />
      </>
    )
  } else if (legalDocument?.bodyText) {
    content = (
      <div style={styles.fallbackWrap}>
        <LegalDocumentText bodyText={legalDocument.bodyText} />
      </div>
    )
  } else {
    content = (
      <div style={styles.errorBox}>
        <div>{error || 'This legal document is unavailable right now.'}</div>
        {policyUrl && (
          <a href={policyUrl} target="_blank" rel="noopener noreferrer" style={styles.fallbackLink}>
            Open the hosted Termly version
          </a>
        )}
      </div>
    )
  }

  return (
    <LegalPageLayout
      tone={tone}
      title={title}
      updated={updated}
      summary={summary}
      intro={intro}
      icon={icon}
    >
      <LegalSection title={title}>
        <div style={styles.viewer}>{content}</div>
      </LegalSection>
    </LegalPageLayout>
  )
}