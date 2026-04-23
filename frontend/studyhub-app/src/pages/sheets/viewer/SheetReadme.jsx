import { Link } from 'react-router-dom'
import { IconStar, IconFork, IconDownload } from '../../../components/Icons'
import VerificationBadge from '../../../components/verification/VerificationBadge'
import { panelStyle, timeAgo } from './sheetViewerConstants'

/* ═══════════════════════════════════════════════════════════════════════════
 * SheetReadme — GitHub-style landing section rendered above the content panel.
 *
 * Shows: description, metadata badges, contributor avatars, latest commit.
 * Security: All text is rendered via JSX text nodes — no dangerouslySetInnerHTML.
 * ═══════════════════════════════════════════════════════════════════════════ */

function MetadataBadge({ icon, label, color = 'var(--sh-subtext)' }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 20,
        background: 'var(--sh-soft)',
        border: '1px solid var(--sh-border)',
        fontSize: 11,
        fontWeight: 700,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </span>
  )
}

function ContributorAvatar({ user }) {
  if (!user) return null
  return (
    <Link
      to={`/users/${user.username}`}
      title={user.username}
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'var(--sh-avatar-bg)',
        color: 'var(--sh-avatar-text)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 800,
        textTransform: 'uppercase',
        flexShrink: 0,
        textDecoration: 'none',
        border: '2px solid var(--sh-surface)',
        marginLeft: -6,
      }}
    >
      {(user.username || '?')[0]}
    </Link>
  )
}

export default function SheetReadme({ sheet, readmeData }) {
  if (!sheet) return null

  const contributors = readmeData?.contributors || []
  const latestCommit = readmeData?.latestCommit || null

  return (
    <section style={{ ...panelStyle(), padding: '20px 22px' }}>
      {/* ── Description ──────────────────────────────────────── */}
      {sheet.description ? (
        <p
          style={{
            margin: '0 0 16px',
            color: 'var(--sh-text)',
            fontSize: 14,
            lineHeight: 1.75,
            whiteSpace: 'pre-wrap',
          }}
        >
          {sheet.description}
        </p>
      ) : (
        <p
          style={{
            margin: '0 0 16px',
            color: 'var(--sh-muted)',
            fontSize: 13,
            fontStyle: 'italic',
          }}
        >
          No description provided.
        </p>
      )}

      {/* ── Metadata badges ──────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <MetadataBadge icon={<IconStar size={12} />} label={`${sheet.stars || 0} stars`} />
        <MetadataBadge icon={<IconFork size={12} />} label={`${sheet.forks || 0} forks`} />
        <MetadataBadge
          icon={<IconDownload size={12} />}
          label={`${sheet.downloads || 0} downloads`}
        />
        <MetadataBadge
          icon={null}
          label={`Updated ${timeAgo(sheet.updatedAt || sheet.createdAt)}`}
          color="var(--sh-muted)"
        />
        {sheet.course?.code && (
          <Link to={`/sheets?courseId=${sheet.course.id}`} style={{ textDecoration: 'none' }}>
            <MetadataBadge icon={null} label={sheet.course.code} color="var(--sh-brand)" />
          </Link>
        )}
      </div>

      {/* ── Contributors + latest commit row ─────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--sh-border)',
          paddingTop: 14,
        }}
      >
        {/* Contributors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--sh-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Contributors
          </span>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
            {contributors.slice(0, 8).map((user) => (
              <ContributorAvatar key={user.id} user={user} />
            ))}
            {contributors.length > 8 && (
              <span
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', marginLeft: 6 }}
              >
                +{contributors.length - 8}
              </span>
            )}
            {contributors.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>—</span>
            )}
          </div>
        </div>

        {/* Latest commit */}
        {latestCommit && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--sh-subtext)',
            }}
          >
            {latestCommit.author && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Link
                  to={`/users/${latestCommit.author.username}`}
                  style={{ fontWeight: 700, color: 'var(--sh-heading)', textDecoration: 'none' }}
                >
                  {latestCommit.author.username}
                </Link>
                <VerificationBadge user={latestCommit.author} size={11} />
              </div>
            )}
            {latestCommit.message && (
              <span
                style={{
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--sh-subtext)',
                }}
                title={latestCommit.message}
              >
                {latestCommit.message}
              </span>
            )}
            {latestCommit.checksum && (
              <code
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--sh-brand)',
                  background: 'var(--sh-brand-soft)',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {latestCommit.checksum}
              </code>
            )}
            <span style={{ color: 'var(--sh-muted)' }}>{timeAgo(latestCommit.createdAt)}</span>
          </div>
        )}
      </div>
    </section>
  )
}
