/**
 * LegalAcceptanceEnforcementModal — gates the entire app for any
 * authenticated user who's missing acceptance for the current legal
 * version. Renders nothing when not gating; renders an unskippable
 * dialog otherwise (no Escape close, no backdrop close — only "Sign
 * out" or "Go to Settings → Legal" advance the user).
 *
 * 2026-05-27 — migrated from the bespoke `createPortal` + `useFocusTrap`
 * pattern to the shared `<FocusTrappedDialog>` primitive (modal-focus-
 * trap migration). Behaviour preserved:
 *   - role="alertdialog" (urgent semantic per W3C ARIA APG §3.9.2)
 *   - Escape does NOT close (enforcement — user must act)
 *   - Backdrop click does NOT close (same reason)
 *   - aria-labelledby still points at the visible title heading
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { LEGAL_DOCUMENT_LABELS } from '../lib/legalVersions'
import { useSession } from '../lib/session-context'
import FocusTrappedDialog from './Modal/FocusTrappedDialog'

const styles = {
  overlayOverride: {
    zIndex: 1200,
    background: 'var(--sh-modal-overlay)',
    backdropFilter: 'blur(6px)',
  },
  panelOverride: {
    width: 'min(480px, 100%)',
    maxWidth: '100%',
    borderRadius: 20,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
    padding: '26px 26px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    padding: '6px 10px',
    borderRadius: 999,
    background: 'var(--sh-warning-bg)',
    border: '1px solid var(--sh-warning-border)',
    color: 'var(--sh-warning-text)',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--sh-heading)',
    lineHeight: 1.25,
  },
  body: {
    margin: 0,
    color: 'var(--sh-subtext)',
    fontSize: 14,
    lineHeight: 1.7,
  },
  list: {
    margin: 0,
    paddingLeft: 18,
    color: 'var(--sh-text)',
    fontSize: 13,
    lineHeight: 1.7,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  actions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  secondaryButton: {
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  primaryButton: {
    padding: '10px 16px',
    borderRadius: 12,
    border: 'none',
    background: 'var(--sh-brand)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: 'var(--sh-btn-primary-shadow)',
  },
}

function getDocumentLabel(slug) {
  return LEGAL_DOCUMENT_LABELS[slug] || slug
}

export default function LegalAcceptanceEnforcementModal() {
  const { isAuthenticated, signOut, user } = useSession()
  const navigate = useNavigate()
  const location = useLocation()

  const activeTab = new URLSearchParams(location.search).get('tab')
  const isOnLegalSettings = location.pathname === '/settings' && activeTab === 'legal'
  const legalAcceptance = user?.legalAcceptance || null
  const open = Boolean(isAuthenticated && legalAcceptance?.needsAcceptance && !isOnLegalSettings)

  return (
    <FocusTrappedDialog
      open={open}
      role="alertdialog"
      ariaLabelledBy="legal-enforcement-title"
      // Land initial focus on Sign out (the safe action) rather than
      // letting focus-trap-react pick the first tabbable. Explicit
      // selector makes the contract testable and protects against a
      // brief render race where focus-trap can't find a tabbable and
      // throws — which an error boundary would swallow, letting the
      // user past the enforcement gate unenforced.
      initialFocusSelector="[data-legal-signout]"
      // Enforcement modal: no dismiss pathways. User MUST sign out or
      // navigate to legal settings.
      escapeDeactivates={false}
      clickOutsideDeactivates={false}
      // Stay centered on phones — confirmation-style, not a content
      // sheet.
      mobileLayout="centered"
      overlayStyle={styles.overlayOverride}
      panelStyle={styles.panelOverride}
    >
      <span style={styles.badge}>Action Required</span>
      <h2 id="legal-enforcement-title" style={styles.title}>
        Review the latest StudyHub legal documents to continue
      </h2>
      <p style={styles.body}>
        Your account is missing acceptance for the current StudyHub legal version. Open Settings
        &gt; Legal and accept the latest documents to keep using the platform.
      </p>
      {Array.isArray(legalAcceptance?.missingRequiredDocuments) &&
        legalAcceptance.missingRequiredDocuments.length > 0 && (
          <ul style={styles.list}>
            {legalAcceptance.missingRequiredDocuments.map((slug) => (
              <li key={slug}>{getDocumentLabel(slug)}</li>
            ))}
          </ul>
        )}
      <div style={styles.actions}>
        <button
          data-legal-signout
          type="button"
          onClick={() => {
            void signOut()
          }}
          style={styles.secondaryButton}
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={() => navigate(legalAcceptance?.remediationPath || '/settings?tab=legal')}
          style={styles.primaryButton}
        >
          Go to Settings &gt; Legal
        </button>
      </div>
    </FocusTrappedDialog>
  )
}
