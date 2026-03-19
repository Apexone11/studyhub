/* ═══════════════════════════════════════════════════════════════════════════
 * NotFoundPage.jsx — Styled 404 page for unmatched routes
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'

const FONT = "'Plus Jakarta Sans', sans-serif"

export default function NotFoundPage() {
  return (
    <main id="main-content" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sh-page-bg, #edf0f5)', fontFamily: FONT, padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </div>
        <div style={{ fontSize: 72, fontWeight: 900, color: 'var(--sh-heading, #0f172a)', lineHeight: 1, marginBottom: 8 }}>404</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--sh-heading, #0f172a)', marginBottom: 8 }}>Page not found</div>
        <div style={{ fontSize: 14, color: 'var(--sh-muted, #64748b)', lineHeight: 1.7, marginBottom: 28 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 22px', borderRadius: 10, background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', fontFamily: FONT }}
          >
            Go Home
          </Link>
          <Link
            to="/feed"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 22px', borderRadius: 10, background: 'var(--sh-surface, #fff)', color: 'var(--sh-heading, #0f172a)', fontSize: 14, fontWeight: 600, textDecoration: 'none', fontFamily: FONT, border: '1px solid var(--sh-border, #e2e8f0)' }}
          >
            Go to Feed
          </Link>
        </div>
      </div>
    </main>
  )
}
