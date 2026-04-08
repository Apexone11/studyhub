/**
 * AppFooter.jsx -- Minimal footer for authenticated pages.
 *
 * Displays legal links, consent preferences trigger, and copyright.
 * Designed to be unobtrusive with small text and muted colors.
 */
import { Link } from 'react-router-dom'
import { LEGAL_EMAILS } from '../lib/legalConstants'

const FOOTER_LINKS = [
  { label: 'Terms', to: '/terms' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Cookies', to: '/cookies' },
  { label: 'Guidelines', to: '/guidelines' },
  { label: 'Disclaimer', to: '/disclaimer' },
  { label: 'Data Request', to: '/data-request' },
]

export default function AppFooter() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--sh-border)',
        padding: '16px 24px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--sh-muted)',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <nav
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '4px 6px',
          marginBottom: 8,
        }}
      >
        {FOOTER_LINKS.map((link, i) => (
          <span key={link.to} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ color: 'var(--sh-muted)', opacity: 0.5 }} aria-hidden="true">·</span>}
            <Link
              to={link.to}
              style={{
                color: 'var(--sh-muted)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              {link.label}
            </Link>
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--sh-muted)', opacity: 0.5 }} aria-hidden="true">·</span>
          <a
            href={`mailto:${LEGAL_EMAILS.privacy}`}
            style={{
              color: 'var(--sh-muted)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Contact
          </a>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--sh-muted)', opacity: 0.5 }} aria-hidden="true">·</span>
          <a
            href="#"
            className="termly-display-preferences"
            onClick={(e) => e.preventDefault()}
            style={{
              color: 'var(--sh-muted)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Consent Preferences
          </a>
        </span>
      </nav>
      <div>2026 StudyHub&trade;</div>
    </footer>
  )
}
