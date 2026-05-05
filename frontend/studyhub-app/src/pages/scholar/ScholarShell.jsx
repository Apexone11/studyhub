/**
 * ScholarShell.jsx — Shared layout wrapper for all Scholar routes.
 *
 * Wraps the page in the same AppSidebar + 2-col grid the rest of the
 * authenticated app uses, so navigating between Scholar and other
 * surfaces doesn't lose the left-rail menu.
 *
 * The hero/reader/list content is the children. Each page keeps its
 * existing internal styling (.scholar-shell, .scholar-reader, etc.)
 * and just gives up the page-level full-bleed wrapper to this shell.
 */
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'

export default function ScholarShell({ children, mainId = 'scholar-main', mainStyle }) {
  const layout = useResponsiveAppLayout()
  const isCompact = layout.isCompact
  return (
    <div className="scholar-page">
      <Navbar />
      <a href={`#${mainId}`} className="scholar-skip-link">
        Skip to main content
      </a>
      <div className="sh-app-page" style={{ background: 'var(--sh-page-bg)', minHeight: '100vh' }}>
        <div style={pageShell('app', 18, 48)}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: layout.columns.appTwoColumn,
              gap: 22,
              alignItems: 'start',
            }}
          >
            <div
              style={{ position: isCompact ? 'static' : 'sticky', top: isCompact ? undefined : 74 }}
            >
              <AppSidebar mode={layout.sidebarMode} />
            </div>
            <main id={mainId} className="sh-ambient-main" style={{ minWidth: 0, ...mainStyle }}>
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}
