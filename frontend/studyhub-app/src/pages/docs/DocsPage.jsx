/* ═══════════════════════════════════════════════════════════════════════════
 * DocsPage.jsx — Public feature catalog at /docs
 *
 * Public-safe (no auth). Linkable from homepage footer, settings, nav help.
 * Week 2 ships: landing grid + 3 feature sub-pages (feed, sheets, groups) +
 * 3 role walkthroughs. Weeks 3–4 fill in the remaining 9 sub-pages.
 *
 * Auth handling: "Try it" CTAs route authenticated users straight into the
 * app, unauthenticated users to /register?intent=<slug>.
 *
 * See docs/internal/design-refresh-v2-week2-brainstorm.md §12
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link, useParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { usePageTitle } from '../../lib/usePageTitle'
import { useSession } from '../../lib/session-context'
import { FEATURES, ROLE_WALKTHROUGHS, findFeature } from './docsContent'

export default function DocsPage() {
  usePageTitle('Everything StudyHub does')
  const { user } = useSession()
  const authed = Boolean(user?.id)

  return (
    <>
      <Navbar />
      <main id="main-content" style={styles.page}>
        <div style={styles.inner}>
          <header className="sh-fade-up" style={styles.hero}>
            <p style={styles.eyebrow}>StudyHub docs</p>
            <h1 style={styles.h1}>Everything StudyHub does.</h1>
            <p style={styles.lead}>
              A collaborative study platform for students, teachers, and self-learners. This page is
              the map — tap any feature below for how it works and when to use it.
            </p>
            {!authed && (
              <div style={styles.ctaRow}>
                <Link
                  to="/register"
                  className="sh-hover-lift sh-press sh-focus-ring"
                  style={styles.primaryCta}
                >
                  Create an account
                </Link>
                <Link to="/login" className="sh-press sh-focus-ring" style={styles.secondaryCta}>
                  Sign in
                </Link>
              </div>
            )}
          </header>

          <section aria-labelledby="features-heading" style={styles.section}>
            <h2 id="features-heading" style={styles.h2}>
              Feature catalog
            </h2>
            <div className="sh-fade-up-stagger" style={styles.grid}>
              {FEATURES.map((f) => (
                <Link
                  key={f.slug}
                  to={`/docs/${f.slug}`}
                  className="sh-card sh-hover-lift sh-press sh-focus-ring sh-fade-up"
                  style={styles.tile}
                >
                  <h3 style={styles.tileTitle}>{f.title}</h3>
                  <p style={styles.tileTagline}>{f.tagline}</p>
                  {f.comingSoon && (
                    <span className="sh-chip" style={styles.comingSoon}>
                      Preview
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>

          <section aria-labelledby="roles-heading" style={styles.section}>
            <h2 id="roles-heading" style={styles.h2}>
              By role
            </h2>
            <div style={styles.roleGrid}>
              {ROLE_WALKTHROUGHS.map((r) => (
                <article key={r.role} className="sh-card sh-fade-up" style={styles.roleCard}>
                  <h3 style={styles.roleTitle}>{r.title}</h3>
                  <p style={styles.roleIntro}>{r.intro}</p>
                  <ol style={styles.roleSteps}>
                    {r.steps.map((step, i) => (
                      <li key={i} style={styles.roleStep}>
                        {step}
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>

          <footer style={styles.footer}>
            <p style={styles.footerText}>
              Not seeing what you need?{' '}
              <Link to="/data-request" style={styles.footerLink}>
                Contact us
              </Link>
              .
            </p>
          </footer>
        </div>
      </main>
    </>
  )
}

/* ─── Per-feature sub-page ────────────────────────────────────────────── */

export function DocsFeaturePage() {
  const { slug } = useParams()
  const feature = findFeature(slug)
  const { user } = useSession()
  const authed = Boolean(user?.id)

  usePageTitle(feature ? `${feature.title} — StudyHub docs` : 'StudyHub docs')

  if (!feature) {
    return (
      <>
        <Navbar />
        <main id="main-content" style={styles.page}>
          <div style={styles.inner}>
            <header style={styles.hero}>
              <h1 style={styles.h1}>We could not find that feature.</h1>
              <p style={styles.lead}>It might have moved or not exist yet.</p>
              <Link to="/docs" style={styles.secondaryCta}>
                Back to docs
              </Link>
            </header>
          </div>
        </main>
      </>
    )
  }

  const tryHref = authed ? feature.tryTo || '/feed' : `/register?intent=${feature.slug}`

  return (
    <>
      <Navbar />
      <main id="main-content" style={styles.page}>
        <div style={styles.inner}>
          <nav aria-label="Breadcrumb" style={styles.crumb}>
            <Link to="/docs" style={styles.crumbLink}>
              Docs
            </Link>
            <span aria-hidden="true" style={styles.crumbSep}>
              /
            </span>
            <span style={styles.crumbCurrent}>{feature.title}</span>
          </nav>
          <header className="sh-fade-up" style={styles.hero}>
            <h1 style={styles.h1}>{feature.title}</h1>
            <p style={styles.lead}>{feature.tagline}</p>
          </header>

          {feature.comingSoon ? (
            <section className="sh-card sh-fade-up" style={styles.featurePanel}>
              <h2 style={styles.h3}>Preview</h2>
              <p style={styles.body}>
                This feature is live in the app. A detailed write-up is landing in the next weekly
                drop of this docs section. In the meantime, the in-app experience is the source of
                truth.
              </p>
              {feature.tryTo && (
                <Link
                  to={tryHref}
                  className="sh-hover-lift sh-press sh-focus-ring"
                  style={styles.primaryCta}
                >
                  Try {feature.title}
                </Link>
              )}
            </section>
          ) : (
            <>
              {feature.sections?.map((s, i) => (
                <section key={i} className="sh-card sh-fade-up" style={styles.featurePanel}>
                  <h2 style={styles.h3}>{s.heading}</h2>
                  <p style={styles.body}>{s.body}</p>
                </section>
              ))}

              {feature.tips?.length > 0 && (
                <section className="sh-card sh-fade-up" style={styles.featurePanel}>
                  <h2 style={styles.h3}>Tips</h2>
                  <ul style={styles.tips}>
                    {feature.tips.map((tip, i) => (
                      <li key={i} style={styles.tip}>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section style={styles.ctaRow}>
                <Link
                  to={tryHref}
                  className="sh-hover-lift sh-press sh-focus-ring"
                  style={styles.primaryCta}
                >
                  Try {feature.title}
                </Link>
                <Link to="/docs" className="sh-press sh-focus-ring" style={styles.secondaryCta}>
                  Back to docs
                </Link>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  )
}

/* ─── Styles ──────────────────────────────────────────────────────────── */

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--sh-bg)',
    color: 'var(--sh-text)',
  },
  inner: {
    maxWidth: 1040,
    margin: '0 auto',
    padding: '40px 24px 72px',
    display: 'grid',
    gap: 32,
  },
  hero: {
    display: 'grid',
    gap: 12,
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--sh-muted)',
  },
  h1: {
    margin: 0,
    fontSize: 40,
    lineHeight: 1.1,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--sh-heading)',
  },
  lead: {
    margin: 0,
    fontSize: 17,
    lineHeight: 1.5,
    color: 'var(--sh-muted)',
    maxWidth: 640,
  },
  ctaRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  primaryCta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 20px',
    borderRadius: 'var(--radius-control)',
    background: 'var(--sh-accent, #2563eb)',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
    border: '1px solid transparent',
  },
  secondaryCta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 20px',
    borderRadius: 'var(--radius-control)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-heading)',
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
    border: '1px solid var(--sh-border)',
  },
  section: {
    display: 'grid',
    gap: 18,
  },
  h2: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--sh-heading)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 14,
  },
  tile: {
    padding: '18px 18px',
    display: 'grid',
    gap: 6,
    textDecoration: 'none',
    color: 'inherit',
    position: 'relative',
  },
  tileTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--sh-heading)',
  },
  tileTagline: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--sh-muted)',
  },
  comingSoon: {
    position: 'absolute',
    top: 12,
    right: 12,
    fontSize: 11,
  },
  roleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 14,
  },
  roleCard: {
    padding: '20px 22px',
    display: 'grid',
    gap: 8,
  },
  roleTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--sh-heading)',
  },
  roleIntro: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--sh-muted)',
  },
  roleSteps: {
    margin: '4px 0 0 0',
    paddingLeft: 18,
    display: 'grid',
    gap: 4,
  },
  roleStep: {
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--sh-text)',
  },
  footer: {
    paddingTop: 16,
    borderTop: '1px solid var(--sh-border)',
  },
  footerText: {
    margin: 0,
    fontSize: 13,
    color: 'var(--sh-muted)',
  },
  footerLink: {
    color: 'var(--sh-accent, #2563eb)',
    textDecoration: 'none',
  },
  crumb: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    fontSize: 13,
    color: 'var(--sh-muted)',
  },
  crumbLink: {
    color: 'var(--sh-muted)',
    textDecoration: 'none',
  },
  crumbSep: {
    color: 'var(--sh-border-strong)',
  },
  crumbCurrent: {
    color: 'var(--sh-heading)',
    fontWeight: 600,
  },
  featurePanel: {
    padding: '20px 22px',
    display: 'grid',
    gap: 8,
  },
  h3: {
    margin: 0,
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: '-0.005em',
    color: 'var(--sh-heading)',
  },
  body: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--sh-text)',
  },
  tips: {
    margin: 0,
    paddingLeft: 18,
    display: 'grid',
    gap: 6,
  },
  tip: {
    fontSize: 14,
    lineHeight: 1.55,
    color: 'var(--sh-text)',
  },
}
