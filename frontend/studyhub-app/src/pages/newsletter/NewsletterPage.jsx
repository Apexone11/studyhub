/* ═══════════════════════════════════════════════════════════════════════════
 * NewsletterPage.jsx — Public "What's New" archive at /updates
 *
 * Public-safe (no auth). Lists published Product Updates issues as cards, each
 * linking to /updates/:slug. Logged-out viewers see the same content; the
 * shared Navbar surfaces sign-in CTAs for them. Campus-Lab look: warm bg,
 * clean cards, blue accent.
 *
 * Layout mirrors DocsPage (public route): <Navbar /> + centered <main>.
 * Settings link is only meaningful for authenticated users, so the
 * "manage email preferences" note links there for them.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import UserAvatar from '../../components/UserAvatar'
import { SkeletonCard } from '../../components/Skeleton'
import { IconBell } from '../../components/Icons'
import { usePageTitle } from '../../lib/usePageTitle'
import { useSession } from '../../lib/session-context'
import { useNewsletterList } from './useNewsletterData'
import NewsletterCategoryChip from './NewsletterCategoryChip'
import { PAGE_FONT, formatIssueDate } from './newsletterConstants'

export default function NewsletterPage() {
  usePageTitle('What’s New')
  const { user } = useSession()
  const authed = Boolean(user?.id)
  const { items, loading, error } = useNewsletterList({ page: 1, limit: 20 })

  return (
    <>
      <Navbar />
      <main id="main-content" style={styles.page}>
        <div style={styles.inner}>
          <header style={styles.hero}>
            <p style={styles.eyebrow}>Product updates</p>
            <h1 style={styles.h1}>What&rsquo;s New</h1>
            <p style={styles.lead}>
              New features, improvements, and fixes shipping to StudyHub. Follow along to see how
              the platform is evolving.
            </p>
            {authed ? (
              <p style={styles.prefsNote}>
                Manage email preferences in{' '}
                <Link to="/settings" style={styles.prefsLink}>
                  Settings
                </Link>
                .
              </p>
            ) : null}
          </header>

          {/* Loading state */}
          {loading ? (
            <div style={styles.list}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : null}

          {/* Error state */}
          {!loading && error ? (
            <div role="alert" style={styles.errorCard}>
              <div style={styles.errorTitle}>We could not load product updates.</div>
              <div style={styles.errorBody}>Please refresh the page to try again.</div>
            </div>
          ) : null}

          {/* Empty state */}
          {!loading && !error && items.length === 0 ? (
            <div style={styles.emptyCard}>
              <div style={styles.emptyIcon} aria-hidden="true">
                <IconBell size={24} />
              </div>
              <div style={styles.emptyTitle}>No updates yet</div>
              <div style={styles.emptyBody}>
                Check back soon for the latest features and improvements from the StudyHub team.
              </div>
            </div>
          ) : null}

          {/* Issue cards */}
          {!loading && !error && items.length > 0 ? (
            <div style={styles.list}>
              {items.map((issue) => (
                <Link key={issue.id} to={`/updates/${issue.slug}`} style={styles.cardLink}>
                  <article className="sh-card sh-hover-lift" style={styles.card}>
                    <div style={styles.cardMeta}>
                      <NewsletterCategoryChip category={issue.category} />
                      {issue.publishedAt ? (
                        <span style={styles.date}>{formatIssueDate(issue.publishedAt)}</span>
                      ) : null}
                    </div>
                    <h2 style={styles.cardTitle}>{issue.title}</h2>
                    {issue.summary ? <p style={styles.cardSummary}>{issue.summary}</p> : null}
                    {issue.author ? (
                      <div style={styles.author}>
                        <UserAvatar user={issue.author} size={24} />
                        <span style={styles.authorName}>
                          {issue.author.displayName || issue.author.username}
                        </span>
                      </div>
                    ) : null}
                  </article>
                </Link>
              ))}
            </div>
          ) : null}
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
    fontFamily: PAGE_FONT,
  },
  inner: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '40px 24px 72px',
    display: 'grid',
    gap: 28,
  },
  hero: {
    display: 'grid',
    gap: 10,
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
    fontSize: 36,
    lineHeight: 1.1,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--sh-heading)',
  },
  lead: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.5,
    color: 'var(--sh-muted)',
    maxWidth: 600,
  },
  prefsNote: {
    margin: '4px 0 0',
    fontSize: 13,
    color: 'var(--sh-muted)',
  },
  prefsLink: {
    color: 'var(--sh-brand)',
    textDecoration: 'none',
    fontWeight: 700,
  },
  list: {
    display: 'grid',
    gap: 14,
  },
  cardLink: {
    textDecoration: 'none',
    color: 'inherit',
  },
  card: {
    padding: '20px 22px',
    display: 'grid',
    gap: 10,
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  date: {
    fontSize: 12,
    color: 'var(--sh-subtext)',
  },
  cardTitle: {
    margin: 0,
    fontSize: 19,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--sh-heading)',
    lineHeight: 1.25,
  },
  cardSummary: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--sh-muted)',
  },
  author: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  authorName: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--sh-subtext)',
  },
  errorCard: {
    background: 'var(--sh-danger-bg)',
    border: '1px solid var(--sh-danger-border)',
    borderRadius: 14,
    padding: '18px 20px',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--sh-danger-text)',
    marginBottom: 4,
  },
  errorBody: {
    fontSize: 13,
    color: 'var(--sh-danger-text)',
    opacity: 0.85,
  },
  emptyCard: {
    background: 'var(--sh-surface)',
    borderRadius: 16,
    border: '2px dashed var(--sh-border)',
    padding: '52px 24px',
    textAlign: 'center',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: 'var(--sh-soft)',
    color: 'var(--sh-brand)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--sh-heading)',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    color: 'var(--sh-muted)',
    lineHeight: 1.6,
    maxWidth: 380,
    margin: '0 auto',
  },
}
