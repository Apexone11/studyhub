/* ═══════════════════════════════════════════════════════════════════════════
 * SocialLinksDisplay.jsx — Read-only icon row of social links.
 *
 * Used on others' profiles (and own profile preview). Renders one icon per
 * link, falling back to a generic globe for un-classified/non-allowlisted
 * domains. Trusted (allowlisted) domains get an inline title with the host
 * so the viewer can verify before clicking; un-trusted links show the raw
 * host as the button label.
 *
 * Safety: only emits https URLs (classifyLinkUrl returns null for anything
 * else), and every <a> uses target="_blank" rel="noopener noreferrer" per
 * CLAUDE.md A15.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { classifyLinkUrl } from './socialLinks'

function PlatformIcon({ kind, size = 14 }) {
  const stroke = 'currentColor'
  const strokeWidth = 2
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
  }
  switch (kind) {
    case 'github':
      return (
        <svg {...common}>
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
        </svg>
      )
    case 'gitlab':
      return (
        <svg {...common}>
          <path d="m22 13.29-3.33-10a.42.42 0 0 0-.4-.29.43.43 0 0 0-.4.3l-2.22 6.7H8.35l-2.22-6.7a.42.42 0 0 0-.4-.3.43.43 0 0 0-.4.3L2 13.29a.74.74 0 0 0 .27.83L12 21l9.73-6.88a.74.74 0 0 0 .27-.83Z" />
        </svg>
      )
    case 'linkedin':
      return (
        <svg {...common}>
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
          <rect x="2" y="9" width="4" height="12" />
          <circle cx="4" cy="4" r="2" />
        </svg>
      )
    case 'twitter':
      return (
        <svg {...common}>
          <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
        </svg>
      )
    case 'instagram':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      )
    case 'youtube':
      return (
        <svg {...common}>
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
          <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
        </svg>
      )
    case 'medium':
      return (
        <svg {...common}>
          <circle cx="6" cy="12" r="4" />
          <ellipse cx="15.5" cy="12" rx="2.5" ry="4" />
          <line x1="21" y1="8" x2="21" y2="16" />
        </svg>
      )
    case 'mastodon':
    case 'bluesky':
    case 'substack':
    case 'devto':
    case 'stackoverflow':
    case 'orcid':
    case 'scholar':
    case 'researchgate':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
        </svg>
      )
    case 'website':
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
        </svg>
      )
  }
}

export default function SocialLinksDisplay({ links, variant = 'pill' }) {
  if (!Array.isArray(links) || links.length === 0) return null

  const classified = links
    .map((link) => {
      if (!link || typeof link !== 'object') return null
      const cls = classifyLinkUrl(link.url)
      if (!cls) return null
      return {
        label: (link.label || cls.platformLabel || cls.host).slice(0, 32),
        url: cls.url,
        host: cls.host,
        kind: cls.kind,
        platformLabel: cls.platformLabel,
        trusted: cls.trusted,
      }
    })
    .filter(Boolean)

  if (classified.length === 0) return null

  const isCompact = variant === 'compact'

  return (
    <div
      data-testid="social-links-display"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 14,
      }}
    >
      {classified.map((link) => (
        <a
          key={`${link.label}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={
            link.trusted ? `${link.platformLabel} · ${link.host}` : `External link · ${link.host}`
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: isCompact ? '4px 10px' : '6px 12px',
            borderRadius: 999,
            border: `1px solid ${link.trusted ? 'rgba(255,255,255,0.25)' : 'rgba(245,158,11,0.5)'}`,
            background: 'rgba(255,255,255,0.1)',
            color: 'var(--sh-nav-text)',
            fontSize: isCompact ? 11 : 12,
            fontWeight: 700,
            textDecoration: 'none',
            backdropFilter: 'blur(6px)',
          }}
        >
          <PlatformIcon kind={link.kind} size={isCompact ? 12 : 14} />
          <span>{link.label}</span>
          {!link.trusted && (
            <span
              aria-label="External link, untrusted domain"
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 999,
                background: 'var(--sh-warning-bg)',
                color: 'var(--sh-warning-text)',
                border: '1px solid var(--sh-warning-border)',
              }}
            >
              {link.host}
            </span>
          )}
        </a>
      ))}
    </div>
  )
}
