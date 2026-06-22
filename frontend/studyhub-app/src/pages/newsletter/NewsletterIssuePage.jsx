/* ═══════════════════════════════════════════════════════════════════════════
 * NewsletterIssuePage.jsx — Public single issue at /updates/:slug
 *
 * Public-safe (no auth). Renders one published Product Updates issue: title,
 * category, date, author, and the server HTML body sanitized through
 * DOMPurify (CLAUDE.md — never render server HTML unsanitized). Handles a
 * not-found / load-error state and links back to /updates.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import Navbar from '../../components/navbar/Navbar'
import UserAvatar from '../../components/UserAvatar'
import { Skeleton } from '../../components/Skeleton'
import { IconArrowLeft } from '../../components/Icons'
import { usePageTitle } from '../../lib/usePageTitle'
import { useNewsletterIssue } from './useNewsletterData'
import NewsletterCategoryChip from './NewsletterCategoryChip'
import { PAGE_FONT, formatIssueDate } from './newsletterConstants'

export default function NewsletterIssuePage() {
  const { slug } = useParams()
  const { issue, loading, error } = useNewsletterIssue(slug)

  usePageTitle(issue ? `${issue.title} — What’s New` : 'What’s New')

  const bodyHtml = issue?.bodyHtml
    ? DOMPurify.sanitize(issue.bodyHtml, { USE_PROFILES: { html: true } })
    : ''

  return (
    <>
      <Navbar />
      <main id="main-content" style={styles.page}>
        <div style={styles.inner}>
          <Link to="/updates" style={styles.backLink}>
            <IconArrowLeft size={15} />
            Back to What&rsquo;s New
          </Link>

          {/* Loading */}
          {loading ? (
            <div style={styles.loadingWrap}>
              <Skeleton width="40%" height={14} style={{ marginBottom: 18 }} />
              <Skeleton width="80%" height={32} style={{ marginBottom: 14 }} />
              <Skeleton width="100%" height={14} style={{ marginBottom: 8 }} />
              <Skeleton width="92%" height={14} style={{ marginBottom: 8 }} />
              <Skeleton width="96%" height={14} />
            </div>
          ) : null}

          {/* Not found / error */}
          {!loading && (error || !issue) ? (
            <div style={styles.notFound}>
              <h1 style={styles.notFoundTitle}>We could not find that update.</h1>
              <p style={styles.notFoundBody}>It might have moved or no longer be published.</p>
              <Link to="/updates" style={styles.primaryLink}>
                Back to What&rsquo;s New
              </Link>
            </div>
          ) : null}

          {/* Issue */}
          {!loading && !error && issue ? (
            <article>
              <div style={styles.meta}>
                <NewsletterCategoryChip category={issue.category} />
                {issue.publishedAt ? (
                  <span style={styles.date}>{formatIssueDate(issue.publishedAt)}</span>
                ) : null}
              </div>

              <h1 style={styles.title}>{issue.title}</h1>

              {issue.summary ? <p style={styles.summary}>{issue.summary}</p> : null}

              {issue.author ? (
                <div style={styles.author}>
                  <UserAvatar user={issue.author} size={32} />
                  <span style={styles.authorName}>
                    {issue.author.displayName || issue.author.username}
                  </span>
                </div>
              ) : null}

              {/* Server HTML — sanitized via DOMPurify above. */}
              <div
                className="sh-rich-text"
                style={styles.body}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            </article>
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
    maxWidth: 720,
    margin: '0 auto',
    padding: '32px 24px 72px',
    display: 'grid',
    gap: 18,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--sh-muted)',
    textDecoration: 'none',
    width: 'fit-content',
  },
  loadingWrap: {
    paddingTop: 8,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  date: {
    fontSize: 13,
    color: 'var(--sh-subtext)',
  },
  title: {
    margin: '0 0 10px',
    fontSize: 32,
    lineHeight: 1.15,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--sh-heading)',
  },
  summary: {
    margin: '0 0 16px',
    fontSize: 16,
    lineHeight: 1.5,
    color: 'var(--sh-muted)',
  },
  author: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 22,
    paddingBottom: 18,
    borderBottom: '1px solid var(--sh-border)',
  },
  authorName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--sh-subtext)',
  },
  body: {
    fontSize: 15,
    lineHeight: 1.75,
    color: 'var(--sh-text)',
  },
  notFound: {
    display: 'grid',
    gap: 12,
    paddingTop: 16,
  },
  notFoundTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 800,
    color: 'var(--sh-heading)',
  },
  notFoundBody: {
    margin: 0,
    fontSize: 15,
    color: 'var(--sh-muted)',
  },
  primaryLink: {
    display: 'inline-flex',
    alignItems: 'center',
    width: 'fit-content',
    padding: '10px 18px',
    borderRadius: 'var(--radius-control)',
    background: 'var(--sh-brand)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
    marginTop: 4,
  },
}
