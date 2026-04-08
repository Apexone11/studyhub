import { Link } from 'react-router-dom'
import Navbar from './navbar/Navbar'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config'

const RELATED_LINKS = [
  { label: 'Terms of Use', to: '/terms' },
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Cookie Policy', to: '/cookies' },
  { label: 'Community Guidelines', to: '/guidelines' },
  { label: 'Disclaimer', to: '/disclaimer' },
  { label: 'Data Request', to: '/data-request' },
]

export function LegalSection({ title, children }) {
  return (
    <section className="legal-section">
      <h2 className="legal-section-title">{title}</h2>
      <div className="legal-section-body">{children}</div>
    </section>
  )
}

export default function LegalPageLayout({
  tone = 'blue',
  title,
  updated,
  summary,
  intro,
  icon,
  asideTitle = 'Related Pages',
  asideNote,
  children,
}) {
  const resolvedAsideNote = asideNote || (
    <>
      Questions or concerns can always be sent to{' '}
      <a href={SUPPORT_MAILTO} style={{ color: 'var(--sh-link, #2563eb)', textDecoration: 'none', fontWeight: 600 }}>
        {SUPPORT_EMAIL}
      </a>
      .
    </>
  )

  return (
    <div className="legal-page sh-public-page sh-public-page--legal">
      <Navbar variant="landing" hideSearch />

      <main className="legal-shell">
        <section className={`legal-hero legal-hero--${tone}`}>
          <div className="legal-hero-head">
            <div className={`legal-hero-icon-shell legal-hero-icon-shell--${tone}`} aria-hidden="true">
              {icon}
            </div>
            <div className="legal-hero-copy">
              <div className="legal-updated">{updated}</div>
              <h1 className="legal-title">{title}</h1>
              <p className="legal-subtitle">{summary}</p>
            </div>
          </div>

          <div className={`legal-intro legal-intro--${tone}`}>
            {intro}
          </div>
        </section>

        <div className="legal-grid">
          <article className="legal-article">{children}</article>

          <aside className="legal-sidebar">
            <div className="legal-sidecard">
              <div className="legal-sidecard-kicker">{asideTitle}</div>
              <div className="legal-sidecard-links">
                {RELATED_LINKS.map((link) => (
                  <Link key={link.to} to={link.to} className="legal-side-link">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="legal-sidecard">
              <div className="legal-sidecard-kicker">Open Source</div>
              <p className="legal-sidecard-copy">{resolvedAsideNote}</p>
              <a
                href="https://github.com/Apexone11/studyhub"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-side-link"
              >
                View the repository
              </a>
            </div>
          </aside>
        </div>
      </main>

      <footer className="legal-footer">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 14px', marginBottom: 8 }}>
          {RELATED_LINKS.map((link) => (
            <Link key={link.to} to={link.to} style={{ color: 'var(--sh-muted)', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}>
              {link.label}
            </Link>
          ))}
          <a
            href="#"
            className="termly-display-preferences"
            onClick={(e) => e.preventDefault()}
            style={{ color: 'var(--sh-muted)', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}
          >
            Consent Preferences
          </a>
        </div>
        <div>
          <span className="legal-footer-brand">StudyHub</span>
          <span className="legal-footer-divider">·</span>
          <span>Built by students, for students</span>
        </div>
      </footer>
    </div>
  )
}
