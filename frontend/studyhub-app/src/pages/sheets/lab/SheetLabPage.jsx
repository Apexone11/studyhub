import { Link } from 'react-router-dom'
import Navbar from '../../../components/navbar/Navbar'
import SafeJoyride from '../../../components/SafeJoyride'
import { IconArrowLeft, IconFork } from '../../../components/Icons'
import { pageShell } from '../../../lib/ui'
import { useTutorial } from '../../../lib/useTutorial'
import { SHEET_LAB_STEPS, TUTORIAL_VERSIONS } from '../../../lib/tutorialSteps'
import { usePageTitle } from '../../../lib/usePageTitle'
import SheetLabEditor from './SheetLabEditor'
import SheetLabChanges from './SheetLabChanges'
import SheetLabContribute from './SheetLabContribute'
import SheetLabReviews from './SheetLabReviews'
import SheetLabHistory from './SheetLabHistory'
import SheetLabAnalytics from './SheetLabAnalytics'
import SheetLabLineage from './SheetLabLineage'
import TutorialBanner from '../../../components/TutorialBanner'
import useSheetLab from './useSheetLab'
import './SheetLabPage.css'

/* ── Tab definitions ───────────────────────────────────────── */

function buildTabs(isOwner, isFork, canEditAsNonOwner) {
  const tabs = []
  if (isOwner || canEditAsNonOwner) {
    tabs.push({ id: 'editor', label: 'Editor' })
    tabs.push({ id: 'changes', label: 'Changes' })
  }
  tabs.push({ id: 'history', label: 'History' })
  tabs.push({ id: 'lineage', label: 'Lineage' })
  if (isOwner && isFork) {
    tabs.push({ id: 'contribute', label: 'Contribute' })
  }
  if (isOwner && !isFork) {
    tabs.push({ id: 'reviews', label: 'Reviews' })
  }
  if (isOwner) {
    tabs.push({ id: 'analytics', label: 'Analytics' })
  }
  return tabs
}

/* ── Status badge helper ───────────────────────────────────── */

function StatusBadge({ status }) {
  if (!status) return null
  return (
    <span className={`sheet-lab__status-badge sheet-lab__status-badge--${status}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

/* ── Main page component ───────────────────────────────────── */

export default function SheetLabPage() {
  usePageTitle('Sheet Lab')
  const tutorial = useTutorial('sheetLab', SHEET_LAB_STEPS, { version: TUTORIAL_VERSIONS.sheetLab })

  const lab = useSheetLab()
  const { sheet, error, isOwner, isFork, activeTab, setActiveTab, handleBack, deleting, handleDeleteFork, publishing, handlePublish } = lab
  const canEditAsNonOwner = !isOwner && sheet?.allowEditing === true
  const tabs = buildTabs(isOwner, isFork, canEditAsNonOwner)

  // Ensure activeTab is valid for current tab set
  const validTab = tabs.find((t) => t.id === activeTab) ? activeTab : tabs[0]?.id || 'history'

  return (
    <>
      <Navbar />
      <div className="sheet-lab">
        <div style={pageShell('reading', 26, 48)}>
          {/* ── Header ─────────────────────────────────── */}
          <div className="sheet-lab__header">
            <button type="button" onClick={handleBack} className="sheet-lab__back">
              <IconArrowLeft size={14} />
              Back to sheet
            </button>
          </div>

          <h1 className="sheet-lab__title">
            {sheet ? sheet.title : 'Sheet Lab'}
          </h1>

          {sheet ? (
            <div className="sheet-lab__meta">
              <StatusBadge status={sheet.status} />
              {isFork && sheet.forkSource ? (
                <span className="sheet-lab__fork-badge">
                  <IconFork size={12} />
                  Forked from{' '}
                  <Link to={`/sheets/${sheet.forkSource.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                    {sheet.forkSource.title}
                  </Link>
                  {sheet.forkSource.author ? ` by ${sheet.forkSource.author.username}` : ''}
                </span>
              ) : null}
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--sh-soft)', color: 'var(--sh-muted)', fontWeight: 700 }}>
                {isOwner ? 'Owner' : 'Read-only'}
              </span>
              {isOwner && sheet.status === 'draft' ? (
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishing}
                  style={{
                    border: 'none', borderRadius: 8, padding: '3px 12px',
                    fontSize: 11, fontWeight: 700, cursor: publishing ? 'not-allowed' : 'pointer',
                    background: '#16a34a', color: '#fff', fontFamily: 'inherit',
                  }}
                >
                  {publishing ? 'Publishing...' : 'Publish'}
                </button>
              ) : null}
              {isOwner && isFork ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this fork? This cannot be undone.')) handleDeleteFork()
                  }}
                  disabled={deleting}
                  style={{
                    marginLeft: 'auto', border: '1px solid var(--sh-danger-border, #fecaca)',
                    borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700,
                    background: 'var(--sh-danger-bg, #fef2f2)', color: 'var(--sh-danger-text, #dc2626)',
                    cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete fork'}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* ── Error banner ───────────────────────────── */}
          {error ? (
            <div role="alert" style={{
              background: 'var(--sh-danger-bg, #fef2f2)', color: 'var(--sh-danger-text, #dc2626)',
              border: '1px solid var(--sh-danger-border, #fecaca)',
              borderRadius: 14, padding: '12px 14px', fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          ) : null}

          {/* ── Tab navigation ─────────────────────────── */}
          <nav data-tutorial="sheetlab-tabs" className="sheet-lab__tabs" aria-label="Sheet Lab tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`sheet-lab__tab${validTab === tab.id ? ' sheet-lab__tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                aria-selected={validTab === tab.id}
                role="tab"
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* ── Tutorial ────────────────────────────────── */}
          {isOwner ? (
            <TutorialBanner
              featureKey={isFork ? 'sheetlab_fork' : 'sheetlab_owner'}
              title={isFork ? 'Welcome to your fork\'s SheetLab' : 'Welcome to SheetLab'}
              steps={isFork ? [
                'Use the Editor tab to edit your fork\'s content with live preview.',
                'Switch to Changes to see what you modified and commit a snapshot.',
                'Use Contribute to submit your changes to the original author.',
                'Sync from original pulls the latest version from the source sheet.',
              ] : [
                'Use the Editor tab to write content with a live preview.',
                'Switch to Changes to review your edits and commit snapshots.',
                'History shows all your snapshots — compare or restore any version.',
                'Reviews shows contributions from users who forked your sheet.',
              ]}
            />
          ) : null}

          {/* ── Tab content ────────────────────────────────── */}
          {validTab === 'editor' ? <div data-tutorial="sheetlab-editor"><SheetLabEditor sheet={sheet} onContentSaved={() => lab.loadCommits(1)} /></div> : null}
          {validTab === 'changes' ? <SheetLabChanges sheet={sheet} onCommitCreated={() => lab.loadCommits(1)} /> : null}
          {validTab === 'history' ? <div data-tutorial="sheetlab-history"><SheetLabHistory lab={lab} /></div> : null}
          {validTab === 'lineage' ? <SheetLabLineage lab={lab} /> : null}
          {validTab === 'contribute' ? <SheetLabContribute sheet={sheet} onContributed={() => lab.reloadSheet()} /> : null}
          {validTab === 'reviews' ? <SheetLabReviews sheet={sheet} onReviewed={() => lab.reloadSheet()} /> : null}
          {validTab === 'analytics' ? <div data-tutorial="sheetlab-analytics"><SheetLabAnalytics sheet={sheet} /></div> : null}
        </div>
      </div>

      <SafeJoyride {...tutorial.joyrideProps} />
    </>
  )
}
