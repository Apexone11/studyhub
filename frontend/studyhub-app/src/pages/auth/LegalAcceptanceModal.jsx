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

/* ── Small checkmark SVG ───────────────────────────────────────────────── */
function CheckIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="7" fill="var(--sh-success)" />
      <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
  const privacyEmbed = useTermlyEmbed(privacyContainerRef, privacyDocument.document?.termlyEmbedId, {
    enabled: open && activeTab === 'privacy' && Boolean(privacyDocument.document?.termlyEmbedId),
    onLoad: markPrivacyViewed,
    onTimeout: markPrivacyViewed,
  })

  useEffect(() => {
    if (!open) return
    const frameId = window.requestAnimationFrame(() => {
      setActiveTab('terms')
      setViewedTabs(new Set())
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [open])

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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: 16,
      }}
      onClick={() => {
        // Backdrop click does nothing -- user must explicitly Accept or Decline
      }}
    >
      {/* Modal card */}
      <div
        style={{
          background: 'var(--sh-surface)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          width: '100%',
          maxWidth: 700,
          maxHeight: '75vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'legalModalIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 0',
            borderBottom: '1px solid var(--sh-border)',
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--sh-heading)',
              marginBottom: 16,
              fontFamily: 'var(--font)',
            }}
          >
            Review Our Policies
          </h2>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0 }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key
              const isViewed = viewedTabs.has(tab.key)

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '10px 8px 12px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--sh-brand)' : 'var(--sh-muted)',
                    borderBottom: isActive
                      ? '2px solid var(--sh-brand)'
                      : '2px solid transparent',
                    transition: 'color 0.15s, border-color 0.15s',
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
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Terms embed */}
          {activeTab === 'terms' && (
            <div style={{ position: 'relative', flex: 1, minHeight: 300, overflowY: 'auto' }}>
              {termsDocument.loading && !termsDocument.document && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--sh-soft)',
                  color: 'var(--sh-muted)', fontSize: 13,
                }}>
                  Loading Terms of Use...
                </div>
              )}
              {termsDocument.document && !termsDocument.document.termlyEmbedId && (
                <div style={{
                  padding: 20,
                  background: 'var(--sh-bg)',
                }}>
                  <LegalDocumentText bodyText={termsDocument.document.bodyText} />
                </div>
              )}
              {termsDocument.document?.termlyEmbedId && !termsEmbed.loaded && !termsEmbed.timedOut && !termsDocument.loading && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--sh-soft)',
                  color: 'var(--sh-muted)', fontSize: 13,
                }}>
                  Loading Terms of Use...
                </div>
              )}
              {termsEmbed.timedOut && termsDocument.document?.bodyText && (
                <div style={{ padding: 20, background: 'var(--sh-bg)' }}>
                  <div style={{ marginBottom: 12, fontSize: 11, fontWeight: 800, color: 'var(--sh-info-text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    StudyHub Backup Copy
                  </div>
                  <LegalDocumentText bodyText={termsDocument.document.bodyText} />
                  <a
                    href={termsDocument.document.termlyUrl || POLICY_URLS.terms}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-block', marginTop: 14, color: 'var(--sh-brand)', fontSize: 13, fontWeight: 700 }}
                  >
                    Open the hosted Termly version
                  </a>
                </div>
              )}
              {termsDocument.error && !termsDocument.document && (
                <div style={{ padding: 20, color: 'var(--sh-warning-text)', fontSize: 13, lineHeight: 1.6 }}>
                  {termsDocument.error}
                </div>
              )}
              <div
                ref={termsContainerRef}
                style={{
                  padding: 16,
                  opacity: termsEmbed.loaded ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                  display: termsEmbed.timedOut || !termsDocument.document?.termlyEmbedId ? 'none' : 'block',
                }}
              />
            </div>
          )}

          {/* Privacy embed */}
          {activeTab === 'privacy' && (
            <div style={{ position: 'relative', flex: 1, minHeight: 300, overflowY: 'auto' }}>
              {privacyDocument.loading && !privacyDocument.document && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--sh-soft)',
                  color: 'var(--sh-muted)', fontSize: 13,
                }}>
                  Loading Privacy Policy...
                </div>
              )}
              {privacyDocument.document && !privacyDocument.document.termlyEmbedId && (
                <div style={{
                  padding: 20,
                  background: 'var(--sh-bg)',
                }}>
                  <LegalDocumentText bodyText={privacyDocument.document.bodyText} />
                </div>
              )}
              {privacyDocument.document?.termlyEmbedId && !privacyEmbed.loaded && !privacyEmbed.timedOut && !privacyDocument.loading && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--sh-soft)',
                  color: 'var(--sh-muted)', fontSize: 13,
                }}>
                  Loading Privacy Policy...
                </div>
              )}
              {privacyEmbed.timedOut && privacyDocument.document?.bodyText && (
                <div style={{ padding: 20, background: 'var(--sh-bg)' }}>
                  <div style={{ marginBottom: 12, fontSize: 11, fontWeight: 800, color: 'var(--sh-info-text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    StudyHub Backup Copy
                  </div>
                  <LegalDocumentText bodyText={privacyDocument.document.bodyText} />
                  <a
                    href={privacyDocument.document.termlyUrl || POLICY_URLS.privacy}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-block', marginTop: 14, color: 'var(--sh-brand)', fontSize: 13, fontWeight: 700 }}
                  >
                    Open the hosted Termly version
                  </a>
                </div>
              )}
              {privacyDocument.error && !privacyDocument.document && (
                <div style={{ padding: 20, color: 'var(--sh-warning-text)', fontSize: 13, lineHeight: 1.6 }}>
                  {privacyDocument.error}
                </div>
              )}
              <div
                ref={privacyContainerRef}
                style={{
                  padding: 16,
                  opacity: privacyEmbed.loaded ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                  display: privacyEmbed.timedOut || !privacyDocument.document?.termlyEmbedId ? 'none' : 'block',
                }}
              />
            </div>
          )}

          {/* Guidelines scrollable content */}
          {activeTab === 'guidelines' && (
            <div
              ref={guidelinesRef}
              onScroll={handleGuidelinesScroll}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 24,
              }}
            >
              {guidelinesDocument.loading && !guidelinesDocument.document ? (
                <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading Community Guidelines...</div>
              ) : guidelinesDocument.document?.bodyText ? (
                <LegalDocumentText bodyText={guidelinesDocument.document.bodyText} />
              ) : (
                <div style={{ color: 'var(--sh-warning-text)', fontSize: 13, lineHeight: 1.6 }}>
                  {guidelinesDocument.error || 'Could not load the Community Guidelines.'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--sh-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: 'var(--sh-muted)',
              fontFamily: 'var(--font)',
            }}
          >
            {viewedCount} of 3 reviewed
            {!allViewed && (
              <span style={{ marginLeft: 6, color: 'var(--sh-warning-text)', fontSize: 11 }}>
                -- Please review all documents
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
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sh-soft)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--sh-surface)' }}
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
