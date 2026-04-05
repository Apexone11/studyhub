/* ═══════════════════════════════════════════════════════════════════════════
 * LegalAcceptanceModal.jsx — Full-screen modal for reviewing and accepting
 * Terms of Use, Privacy Policy, and Community Guidelines during registration.
 * Uses createPortal to escape the animated register card's transform context.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { TERMLY_UUIDS, POLICY_URLS } from '../../lib/legalVersions'

const TABS = [
  { key: 'terms', label: 'Terms of Use', type: 'embed' },
  { key: 'privacy', label: 'Privacy Policy', type: 'embed' },
  { key: 'guidelines', label: 'Community Guidelines', type: 'scroll' },
]

const TERMLY_EMBED_SCRIPT = 'https://app.termly.io/embed.min.js'

/**
 * Hook that manages a Termly embed div inside a container ref.
 * Injects the Termly SDK script once, creates the embed div,
 * and uses a MutationObserver to detect when content loads.
 * Calls onLoad when the embed content appears.
 */
function useTermlyEmbed(containerRef, dataId, { enabled, timeout = 15000, onLoad }) {
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const onLoadRef = useRef(onLoad)
  useEffect(() => { onLoadRef.current = onLoad })

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return

    // Inject the Termly SDK script once globally
    if (!document.getElementById('termly-jssdk')) {
      const script = document.createElement('script')
      script.id = 'termly-jssdk'
      script.src = TERMLY_EMBED_SCRIPT
      script.setAttribute('data-auto-block', 'on')
      document.body.appendChild(script)
    }

    // Create the embed placeholder
    const embed = document.createElement('div')
    embed.setAttribute('name', 'termly-embed')
    embed.setAttribute('data-id', dataId)
    container.appendChild(embed)

    // Timeout fallback
    const timer = setTimeout(() => setTimedOut(true), timeout)

    // Watch for Termly to populate the embed
    const observer = new MutationObserver(() => {
      if (embed.children.length > 0) {
        clearTimeout(timer)
        setLoaded(true)
        onLoadRef.current?.()
        observer.disconnect()
      }
    })
    observer.observe(embed, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      clearTimeout(timer)
      if (container && embed.parentNode === container) {
        container.removeChild(embed)
      }
    }
  }, [enabled, dataId, containerRef, timeout])

  return { loaded, timedOut }
}

/* ── Inline guidelines content (matches GuidelinesPage.jsx text) ───────── */
function GuidelinesContent() {
  const sectionStyle = { marginBottom: 20 }
  const headingStyle = {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--sh-heading)',
    marginBottom: 8,
  }
  const listStyle = {
    paddingLeft: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    color: 'var(--sh-text)',
    fontSize: 13,
    lineHeight: 1.7,
  }
  const pStyle = { color: 'var(--sh-text)', fontSize: 13, lineHeight: 1.7, marginBottom: 6 }

  return (
    <>
      <div style={sectionStyle}>
        <h3 style={headingStyle}>What We Expect</h3>
        <p style={pStyle}>You agree to:</p>
        <ul style={listStyle}>
          <li>Be respectful and constructive.</li>
          <li>Avoid plagiarism or harmful content.</li>
          <li>Report suspicious content when seen.</li>
          <li>Follow school guidelines and honor codes.</li>
        </ul>
      </div>

      <div style={sectionStyle}>
        <h3 style={headingStyle}>What We Encourage</h3>
        <ul style={listStyle}>
          <li>Uploading original study guides and notes for your courses.</li>
          <li>Forking and improving existing study materials.</li>
          <li>Writing clear, well-organized practice test questions.</li>
          <li>Leaving constructive comments on study materials.</li>
          <li>Helping classmates understand difficult concepts.</li>
          <li>Contributing to courses at your school and beyond.</li>
        </ul>
      </div>

      <div style={sectionStyle}>
        <h3 style={headingStyle}>What Is Not Allowed</h3>
        <ul style={listStyle}>
          <li>Uploading copyrighted textbook content or publisher materials.</li>
          <li>Posting answers to graded exams or assignments.</li>
          <li>Uploading fake, misleading, or intentionally wrong study content.</li>
          <li>Harassing, bullying, or disrespecting other users.</li>
          <li>Spamming the platform with duplicate or low-quality content.</li>
          <li>Uploading malicious HTML files or files designed to harm users.</li>
          <li>Creating fake accounts or impersonating others.</li>
          <li>Using the platform for anything unrelated to studying and learning.</li>
        </ul>
      </div>

      <div style={sectionStyle}>
        <h3 style={headingStyle}>Content Quality Standards</h3>
        <p style={pStyle}>Good study content on StudyHub should:</p>
        <ul style={listStyle}>
          <li>Be clearly titled with the course and topic.</li>
          <li>Use your own words rather than copied textbook passages.</li>
          <li>Include examples where possible.</li>
          <li>Be organized with headings and sections.</li>
          <li>Be accurate to the best of your knowledge.</li>
        </ul>
      </div>

      <div style={sectionStyle}>
        <h3 style={headingStyle}>Forking and Attribution</h3>
        <p style={pStyle}>When you fork someone else's study sheet:</p>
        <ul style={listStyle}>
          <li>The original author is automatically credited.</li>
          <li>You can improve, expand, or adapt the content freely.</li>
          <li>Do not remove attribution from forked content.</li>
          <li>If you make major improvements, consider contributing them back.</li>
        </ul>
      </div>

      <div style={sectionStyle}>
        <h3 style={headingStyle}>Enforcement</h3>
        <p style={pStyle}>Violations may result in content removal or account suspension. Enforcement follows a progressive approach:</p>
        <ul style={listStyle}>
          <li><strong>First offense:</strong> content removed and warning issued.</li>
          <li><strong>Second offense:</strong> temporary upload restriction.</li>
          <li><strong>Severe or repeated violations:</strong> account suspension.</li>
        </ul>
      </div>

      <div style={sectionStyle}>
        <h3 style={headingStyle}>Reporting</h3>
        <ul style={listStyle}>
          <li>Use the Report button on the relevant study sheet or post.</li>
          <li>Email support@studyhub.academy with details and a link to the content.</li>
        </ul>
        <p style={pStyle}>False or malicious reports are themselves a violation of these guidelines.</p>
      </div>
    </>
  )
}

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

  // Termly embed refs and hooks for Terms and Privacy
  const termsContainerRef = useRef(null)
  const privacyContainerRef = useRef(null)

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

  const termsEmbed = useTermlyEmbed(termsContainerRef, TERMLY_UUIDS.terms, {
    enabled: open,
    onLoad: markTermsViewed,
  })
  const privacyEmbed = useTermlyEmbed(privacyContainerRef, TERMLY_UUIDS.privacy, {
    enabled: open,
    onLoad: markPrivacyViewed,
  })

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
              {!termsEmbed.loaded && !termsEmbed.timedOut && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--sh-soft)',
                  color: 'var(--sh-muted)', fontSize: 13,
                }}>
                  Loading Terms of Use...
                </div>
              )}
              {termsEmbed.timedOut && !termsEmbed.loaded && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--sh-soft)',
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: '0 0 8px', color: 'var(--sh-muted)', fontSize: 13 }}>Could not load inline. </p>
                    <a href={POLICY_URLS.terms} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--sh-brand)', fontSize: 13, fontWeight: 600 }}
                      onClick={() => markViewed('terms')}
                    >View Terms of Use externally</a>
                  </div>
                </div>
              )}
              <div
                ref={termsContainerRef}
                style={{
                  padding: 16,
                  opacity: termsEmbed.loaded ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                }}
              />
            </div>
          )}

          {/* Privacy embed */}
          {activeTab === 'privacy' && (
            <div style={{ position: 'relative', flex: 1, minHeight: 300, overflowY: 'auto' }}>
              {!privacyEmbed.loaded && !privacyEmbed.timedOut && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--sh-soft)',
                  color: 'var(--sh-muted)', fontSize: 13,
                }}>
                  Loading Privacy Policy...
                </div>
              )}
              {privacyEmbed.timedOut && !privacyEmbed.loaded && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--sh-soft)',
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: '0 0 8px', color: 'var(--sh-muted)', fontSize: 13 }}>Could not load inline. </p>
                    <a href={POLICY_URLS.privacy} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--sh-brand)', fontSize: 13, fontWeight: 600 }}
                      onClick={() => markViewed('privacy')}
                    >View Privacy Policy externally</a>
                  </div>
                </div>
              )}
              <div
                ref={privacyContainerRef}
                style={{
                  padding: 16,
                  opacity: privacyEmbed.loaded ? 1 : 0,
                  transition: 'opacity 0.3s ease',
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
              <GuidelinesContent />
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
