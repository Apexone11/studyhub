import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import LegalDocumentText from '../../components/LegalDocumentText'
import { LEGAL_DOCUMENT_LABELS, POLICY_URLS } from '../../lib/legalVersions'
import { useCurrentLegalDocument } from '../../lib/legalService'
import useTermlyEmbed from '../../lib/useTermlyEmbed'

const TABS = [
  { key: 'terms', label: LEGAL_DOCUMENT_LABELS.terms },
  { key: 'privacy', label: LEGAL_DOCUMENT_LABELS.privacy },
  { key: 'guidelines', label: LEGAL_DOCUMENT_LABELS.guidelines },
]

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(7, 16, 34, 0.62)',
    backdropFilter: 'blur(8px)',
    padding: 20,
  },
  modal: {
    background: 'var(--sh-surface)',
    borderRadius: 24,
    boxShadow: '0 30px 80px rgba(9, 17, 34, 0.34)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    width: '100%',
    maxWidth: 920,
    maxHeight: '82vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'legalModalIn 0.24s ease-out',
  },
  header: {
    padding: '24px 28px 18px',
    borderBottom: '1px solid var(--sh-border)',
    background: 'linear-gradient(180deg, var(--sh-surface) 0%, var(--sh-soft) 100%)',
  },
  overline: {
    margin: '0 0 8px',
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--sh-brand)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font)',
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: 'var(--sh-heading)',
    margin: 0,
    fontFamily: 'var(--font)',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '10px 0 18px',
    fontSize: 14,
    color: 'var(--sh-muted)',
    lineHeight: 1.65,
    fontFamily: 'var(--font)',
    maxWidth: 620,
  },
  tabBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 10,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    background: 'var(--sh-bg)',
  },
  scrollRegion: {
    position: 'relative',
    flex: 1,
    minHeight: 340,
    overflowY: 'auto',
    padding: '24px 28px',
  },
  loading: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--sh-soft)',
    color: 'var(--sh-muted)',
    fontSize: 13,
  },
  fallbackPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: '22px 24px',
    borderRadius: 22,
    border: '1px solid var(--sh-border)',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, var(--sh-surface) 100%)',
    boxShadow: 'var(--shadow-md)',
  },
  fallbackHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    flexWrap: 'wrap',
  },
  fallbackBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 11px',
    borderRadius: 999,
    background: 'var(--sh-info-bg)',
    border: '1px solid var(--sh-info-border)',
    color: 'var(--sh-info-text)',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  fallbackNote: {
    margin: 0,
    maxWidth: 420,
    color: 'var(--sh-muted)',
    fontSize: 12.5,
    lineHeight: 1.65,
  },
  fallbackLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--sh-brand)',
    fontSize: 13,
    fontWeight: 700,
    textDecoration: 'none',
  },
  footer: {
    padding: '18px 28px',
    borderTop: '1px solid var(--sh-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    background: 'var(--sh-surface)',
  },
}

/* ── Small checkmark SVG ───────────────────────────────────────────────── */
function CheckIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="7" fill="var(--sh-success)" />
      <path
        d="M5 8l2 2 4-4"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── Dot indicator (not yet viewed) ────────────────────────────────────── */
function DotIcon({ size = 8 }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--sh-border-strong)',
        flexShrink: 0,
      }}
    />
  )
}

function HostedLinkArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5 11L11 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M6 5h5v5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FallbackDocumentPanel({ bodyText, linkUrl, showBackupBadge = false, note }) {
  return (
    <div style={styles.fallbackPanel}>
      {(showBackupBadge || note) && (
        <div style={styles.fallbackHeader}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {showBackupBadge ? (
              <span style={styles.fallbackBadge}>StudyHub Backup Copy</span>
            ) : null}
            {note ? <p style={styles.fallbackNote}>{note}</p> : null}
          </div>
          {linkUrl ? (
            <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={styles.fallbackLink}>
              Open hosted version
              <HostedLinkArrow />
            </a>
          ) : null}
        </div>
      )}

      <LegalDocumentText bodyText={bodyText} variant="modal" />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LegalAcceptanceModal
 * ═══════════════════════════════════════════════════════════════════════════ */
export default function LegalAcceptanceModal({ open, onAccept, onDecline }) {
  const [activeTab, setActiveTab] = useState('terms')
  const [viewedTabs, setViewedTabs] = useState(new Set())
  const guidelinesRef = useRef(null)
  const termsContainerRef = useRef(null)
  const privacyContainerRef = useRef(null)

  const termsDocument = useCurrentLegalDocument('terms', { enabled: open })
  const privacyDocument = useCurrentLegalDocument('privacy', { enabled: open })
  const guidelinesDocument = useCurrentLegalDocument('guidelines', { enabled: open })

  const markViewed = useCallback((key) => {
    setViewedTabs((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

  const markTermsViewed = useCallback(() => markViewed('terms'), [markViewed])
  const markPrivacyViewed = useCallback(() => markViewed('privacy'), [markViewed])

  const termsEmbed = useTermlyEmbed(termsContainerRef, termsDocument.document?.termlyEmbedId, {
    enabled: open && activeTab === 'terms' && Boolean(termsDocument.document?.termlyEmbedId),
    onLoad: markTermsViewed,
    onTimeout: markTermsViewed,
  })
  const privacyEmbed = useTermlyEmbed(
    privacyContainerRef,
    privacyDocument.document?.termlyEmbedId,
    {
      enabled: open && activeTab === 'privacy' && Boolean(privacyDocument.document?.termlyEmbedId),
      onLoad: markPrivacyViewed,
      onTimeout: markPrivacyViewed,
    },
  )

  useEffect(() => {
    if (!open) return
    const frameId = window.requestAnimationFrame(() => {
      setActiveTab('terms')
      setViewedTabs(new Set())
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [open])

  useEffect(() => {
    if (!open || activeTab !== 'terms') return

    const shouldMarkTermsViewed = Boolean(
      termsDocument.document?.bodyText &&
      (!termsDocument.document?.termlyEmbedId || termsEmbed.timedOut),
    )

    if (shouldMarkTermsViewed) {
      const frameId = window.requestAnimationFrame(() => {
        markViewed('terms')
      })
      return () => window.cancelAnimationFrame(frameId)
    }

    return undefined
  }, [
    activeTab,
    markViewed,
    open,
    termsDocument.document?.bodyText,
    termsDocument.document?.termlyEmbedId,
    termsEmbed.timedOut,
  ])

  useEffect(() => {
    if (!open || activeTab !== 'privacy') return

    const shouldMarkPrivacyViewed = Boolean(
      privacyDocument.document?.bodyText &&
      (!privacyDocument.document?.termlyEmbedId || privacyEmbed.timedOut),
    )

    if (shouldMarkPrivacyViewed) {
      const frameId = window.requestAnimationFrame(() => {
        markViewed('privacy')
      })
      return () => window.cancelAnimationFrame(frameId)
    }

    return undefined
  }, [
    activeTab,
    markViewed,
    open,
    privacyDocument.document?.bodyText,
    privacyDocument.document?.termlyEmbedId,
    privacyEmbed.timedOut,
  ])

  const handleGuidelinesScroll = useCallback(
    (e) => {
      const el = e.target
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 30) {
        markViewed('guidelines')
      }
    },
    [markViewed],
  )

  const allViewed = viewedTabs.size === 3
  const viewedCount = viewedTabs.size

  if (!open) return null

  const overlay = (
    <div
      style={styles.overlay}
      onClick={() => {
        // Backdrop click does nothing -- user must explicitly Accept or Decline
      }}
    >
      {/* Modal card */}
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <p style={styles.overline}>Required Before Signup</p>
          <h2 style={styles.title}>Review Our Policies</h2>
          <p style={styles.subtitle}>
            Read each required document before creating your account. If the hosted Termly document
            is unavailable, StudyHub will show the current backup copy stored with the same legal
            version.
          </p>

          {/* Tab bar */}
          <div style={styles.tabBar}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key
              const isViewed = viewedTabs.has(tab.key)

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '12px 14px',
                    borderRadius: 14,
                    border: isActive ? '1px solid var(--sh-brand)' : '1px solid var(--sh-border)',
                    background: isActive ? 'var(--sh-surface)' : 'rgba(255,255,255,0.35)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--sh-brand)' : 'var(--sh-muted)',
                    boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                    transition:
                      'color 0.15s, border-color 0.15s, background 0.15s, box-shadow 0.15s',
                  }}
                >
                  {isViewed ? <CheckIcon size={14} /> : <DotIcon size={8} />}
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content area */}
        <div style={styles.content}>
          {/* Terms embed */}
          {activeTab === 'terms' && (
            <div style={styles.scrollRegion}>
              {termsDocument.loading && !termsDocument.document && (
                <div style={styles.loading}>Loading Terms of Use...</div>
              )}
              {termsDocument.document && !termsDocument.document.termlyEmbedId && (
                <FallbackDocumentPanel
                  bodyText={termsDocument.document.bodyText}
                  linkUrl={termsDocument.document.termlyUrl || POLICY_URLS.terms}
                  showBackupBadge={false}
                  note="This version is served directly from StudyHub because no hosted Termly embed is configured for the current Terms of Use document."
                />
              )}
              {termsDocument.document?.termlyEmbedId &&
                !termsEmbed.loaded &&
                !termsEmbed.timedOut &&
                !termsDocument.loading && <div style={styles.loading}>Loading Terms of Use...</div>}
              {termsEmbed.timedOut && termsDocument.document?.bodyText && (
                <FallbackDocumentPanel
                  bodyText={termsDocument.document.bodyText}
                  linkUrl={termsDocument.document.termlyUrl || POLICY_URLS.terms}
                  showBackupBadge
                  note="The hosted Terms of Use viewer did not load in time, so StudyHub is showing the matching backup copy for this legal version."
                />
              )}
              {termsDocument.error && !termsDocument.document && (
                <div
                  style={{
                    padding: 20,
                    color: 'var(--sh-warning-text)',
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  {termsDocument.error}
                </div>
              )}
              <div
                ref={termsContainerRef}
                style={{
                  minHeight: 320,
                  opacity: termsEmbed.loaded ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                  display:
                    termsEmbed.timedOut || !termsDocument.document?.termlyEmbedId
                      ? 'none'
                      : 'block',
                }}
              />
            </div>
          )}

          {/* Privacy embed */}
          {activeTab === 'privacy' && (
            <div style={styles.scrollRegion}>
              {privacyDocument.loading && !privacyDocument.document && (
                <div style={styles.loading}>Loading Privacy Policy...</div>
              )}
              {privacyDocument.document && !privacyDocument.document.termlyEmbedId && (
                <FallbackDocumentPanel
                  bodyText={privacyDocument.document.bodyText}
                  linkUrl={privacyDocument.document.termlyUrl || POLICY_URLS.privacy}
                  showBackupBadge={false}
                  note="This version is served directly from StudyHub because no hosted Termly embed is configured for the current Privacy Policy document."
                />
              )}
              {privacyDocument.document?.termlyEmbedId &&
                !privacyEmbed.loaded &&
                !privacyEmbed.timedOut &&
                !privacyDocument.loading && (
                  <div style={styles.loading}>Loading Privacy Policy...</div>
                )}
              {privacyEmbed.timedOut && privacyDocument.document?.bodyText && (
                <FallbackDocumentPanel
                  bodyText={privacyDocument.document.bodyText}
                  linkUrl={privacyDocument.document.termlyUrl || POLICY_URLS.privacy}
                  showBackupBadge
                  note="The hosted Privacy Policy viewer did not load in time, so StudyHub is showing the matching backup copy for this legal version."
                />
              )}
              {privacyDocument.error && !privacyDocument.document && (
                <div
                  style={{
                    padding: 20,
                    color: 'var(--sh-warning-text)',
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  {privacyDocument.error}
                </div>
              )}
              <div
                ref={privacyContainerRef}
                style={{
                  minHeight: 320,
                  opacity: privacyEmbed.loaded ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                  display:
                    privacyEmbed.timedOut || !privacyDocument.document?.termlyEmbedId
                      ? 'none'
                      : 'block',
                }}
              />
            </div>
          )}

          {/* Guidelines scrollable content */}
          {activeTab === 'guidelines' && (
            <div ref={guidelinesRef} onScroll={handleGuidelinesScroll} style={styles.scrollRegion}>
              {guidelinesDocument.loading && !guidelinesDocument.document ? (
                <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>
                  Loading Community Guidelines...
                </div>
              ) : guidelinesDocument.document?.bodyText ? (
                <FallbackDocumentPanel
                  bodyText={guidelinesDocument.document.bodyText}
                  note="Community Guidelines are served directly from StudyHub so you always review the current moderation and conduct rules during signup."
                />
              ) : (
                <div style={{ color: 'var(--sh-warning-text)', fontSize: 13, lineHeight: 1.6 }}>
                  {guidelinesDocument.error || 'Could not load the Community Guidelines.'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--sh-muted)',
              fontFamily: 'var(--font)',
            }}
          >
            {viewedCount} of 3 reviewed
            {!allViewed && (
              <span
                style={{
                  marginLeft: 6,
                  color: 'var(--sh-warning-text)',
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                Please review all documents before accepting
              </span>
            )}
          </span>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onDecline}
              style={{
                padding: '9px 20px',
                borderRadius: 10,
                border: '1px solid var(--sh-border)',
                background: 'var(--sh-surface)',
                color: 'var(--sh-subtext)',
                fontFamily: 'var(--font)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--sh-soft)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--sh-surface)'
              }}
            >
              Decline
            </button>

            <button
              type="button"
              disabled={!allViewed}
              onClick={onAccept}
              style={{
                padding: '9px 24px',
                borderRadius: 10,
                border: 'none',
                background: allViewed ? 'var(--sh-brand)' : 'var(--sh-border)',
                color: allViewed ? '#fff' : 'var(--sh-muted)',
                fontFamily: 'var(--font)',
                fontSize: 13,
                fontWeight: 700,
                cursor: allViewed ? 'pointer' : 'not-allowed',
                boxShadow: allViewed ? 'var(--sh-btn-primary-shadow)' : 'none',
                transition: 'background 0.15s, box-shadow 0.15s',
                opacity: allViewed ? 1 : 0.7,
              }}
              onMouseEnter={(e) => {
                if (allViewed) e.currentTarget.style.background = 'var(--sh-brand-hover)'
              }}
              onMouseLeave={(e) => {
                if (allViewed) e.currentTarget.style.background = 'var(--sh-brand)'
              }}
            >
              Accept All
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe animation injected once */}
      <style>{`
        @keyframes legalModalIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )

  return createPortal(overlay, document.body)
}
