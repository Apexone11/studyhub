import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import LegalDocumentText from '../../components/LegalDocumentText'
import { useCurrentLegalDocument } from '../../lib/legalService'

const styles = {
  viewer: {
    position: 'relative',
    minHeight: 260,
    borderRadius: 16,
    border: '1px solid var(--sh-panel-border)',
    background: 'var(--sh-panel-bg)',
    boxShadow: 'var(--sh-panel-shadow)',
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

/**
 * Self-hosted legal document renderer.
 *
 * The Termly embed/fallback dual-path was removed 2026-04-30 — every
 * legal document now ships with `bodyText` seeded from
 * `backend/src/modules/legal/content/*.txt` and that's the only render
 * path. No third-party iframe, no `app.termly.io` calls, no
 * cross-origin script execution. If `bodyText` is missing the page
 * shows a generic error instead of falling through to Termly.
 */
export default function LegalDocumentPage({
  slug: _slug,
  tone,
  icon,
  fallbackTitle,
  fallbackSummary,
  fallbackIntro,
  fallbackUpdated,
}) {
  const { document: legalDocument, loading, error } = useCurrentLegalDocument(_slug)

  const title = legalDocument?.title || fallbackTitle
  const summary = legalDocument?.summary || fallbackSummary
  const intro = legalDocument?.intro || fallbackIntro
  const updated = legalDocument?.updatedLabel || fallbackUpdated

  let content = null

  if (loading && !legalDocument) {
    content = <div style={styles.loading}>Loading legal document...</div>
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
