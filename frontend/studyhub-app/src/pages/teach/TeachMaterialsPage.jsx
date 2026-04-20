/* ═══════════════════════════════════════════════════════════════════════════
 * TeachMaterialsPage.jsx — Teacher "My Materials" workspace (Week 2 scaffold)
 *
 * Real standalone page at /teach/materials. Replaces the old
 * /sheets?mine=true filter that the teacher sidebar used to point at.
 *
 * Week 2 scope (this file):
 *   - Library / Drafts / Collections tabs, URL-synced via ?tab=.
 *   - Library + Drafts pull existing StudySheet data via /api/sheets?mine=true
 *     filtered by status. No new backend tables this week — those land in
 *     Week 3 with the Material/Section/Assignment migration.
 *   - Right rail with a light teaching stats widget.
 *   - Flag-gated by `design_v2_teach_materials` at the route level.
 *
 * Later weeks:
 *   - Week 3: Material + Section + MaterialAssignment join table, bulk assign.
 *   - Week 4: AI exam-pack generator + student comprehension pulse.
 *
 * See docs/internal/design-refresh-v2-week2-brainstorm.md §1 and
 *     docs/internal/design-refresh-v2-week2-to-week5-execution.md W2+W3.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { IconSheets, IconUpload, IconPlus } from '../../components/Icons'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { useSession } from '../../lib/session-context'
import { useDesignV2Flags } from '../../lib/designV2Flags'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import SectionPicker from './SectionPicker'

const TABS = [
  { id: 'library', label: 'Library', helper: 'Published materials' },
  { id: 'drafts', label: 'Drafts', helper: 'Works in progress' },
  { id: 'collections', label: 'Collections', helper: 'Grouped lessons' },
]

const TAB_IDS = new Set(TABS.map((t) => t.id))

function useMaterials({ status }) {
  const [state, setState] = useState({ items: [], loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    // Reuse the existing /api/sheets endpoint. Teachers are identified by
    // mine=true + their session cookie. Status query narrows the tab.
    const qs = new URLSearchParams({ mine: 'true', limit: '50' })
    if (status) qs.set('status', status)

    fetch(`${API}/api/sheets?${qs.toString()}`, {
      headers: authHeaders(),
      credentials: 'include',
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
      .then((data) => {
        if (cancelled) return
        const items = Array.isArray(data?.sheets) ? data.sheets : Array.isArray(data) ? data : []
        setState({ items, loading: false, error: null })
      })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return
        setState({ items: [], loading: false, error: 'fetch' })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [status])

  return state
}

export default function TeachMaterialsPage() {
  usePageTitle('My Materials')
  const layout = useResponsiveAppLayout()
  const { user } = useSession()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const flags = useDesignV2Flags()

  const rawTab = searchParams.get('tab') || 'library'
  const tab = TAB_IDS.has(rawTab) ? rawTab : 'library'

  // Gate: this page is teacher-only. Non-teachers land back on /sheets.
  useEffect(() => {
    if (!user) return
    if (user.accountType !== 'teacher') {
      navigate('/sheets', { replace: true })
    }
  }, [user, navigate])

  // Week 3 — multi-select + bulk assign. Only on the Library tab.
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [lastAssignSummary, setLastAssignSummary] = useState(null)

  const libraryQuery = useMaterials({
    status: tab === 'library' ? 'published' : null,
  })
  const draftsQuery = useMaterials({
    status: tab === 'drafts' ? 'draft' : null,
  })

  const activeItems =
    tab === 'library' ? libraryQuery.items : tab === 'drafts' ? draftsQuery.items : []
  const activeLoading =
    tab === 'library' ? libraryQuery.loading : tab === 'drafts' ? draftsQuery.loading : false
  const activeError =
    tab === 'library' ? libraryQuery.error : tab === 'drafts' ? draftsQuery.error : null

  const stats = useMemo(() => {
    const libraryCount = libraryQuery.items.length
    const draftCount = draftsQuery.items.length
    const lastUpdated = [...libraryQuery.items, ...draftsQuery.items]
      .map((s) => s.updatedAt || s.createdAt)
      .filter(Boolean)
      .sort()
      .slice(-1)[0]
    return { libraryCount, draftCount, lastUpdated }
  }, [libraryQuery.items, draftsQuery.items])

  const handleTabChange = (nextId) => {
    const next = new URLSearchParams(searchParams)
    if (nextId === 'library') next.delete('tab')
    else next.set('tab', nextId)
    setSearchParams(next, { replace: true })
    // Clear multi-select + last summary whenever the tab changes.
    setSelectedIds(new Set())
    setLastAssignSummary(null)
  }

  return (
    <>
      <Navbar />
      <div className="sh-app-page" style={styles.page}>
        <div className="sh-ambient-shell" style={pageShell('app', 26, 48)}>
          <div className="sh-ambient-grid" style={styles.appGrid}>
            <AppSidebar mode={layout.sidebarMode} />

            <main className="sh-ambient-main" id="main-content" style={styles.main}>
              <header className="sh-card sh-fade-up" style={styles.headerCard}>
                <div style={styles.headerRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={styles.eyebrow}>Teaching</div>
                    <h1 style={styles.title}>My Materials</h1>
                    <p style={styles.subtitle}>
                      Your lesson library. Only you see this view — students see what you publish to
                      their section.
                    </p>
                  </div>
                  <div style={styles.headerActions}>
                    <Link
                      to="/sheets/upload"
                      className="sh-hover-lift sh-press sh-focus-ring"
                      style={styles.primaryCta}
                    >
                      <IconUpload size={16} />
                      New material
                    </Link>
                  </div>
                </div>
              </header>

              <nav aria-label="Materials sections" style={styles.tabs}>
                {TABS.map((t) => {
                  const active = t.id === tab
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => handleTabChange(t.id)}
                      className="sh-press sh-focus-ring"
                      aria-pressed={active}
                      style={{
                        ...styles.tab,
                        ...(active ? styles.tabActive : null),
                      }}
                    >
                      <span style={styles.tabLabel}>{t.label}</span>
                      <span style={styles.tabHelper}>{t.helper}</span>
                    </button>
                  )
                })}
              </nav>

              <section style={styles.layout}>
                <div style={styles.listColumn}>
                  {tab === 'library' && flags.teachSections && activeItems.length > 0 ? (
                    <BulkAssignBar
                      selectedCount={selectedIds.size}
                      totalCount={activeItems.length}
                      onClear={() => setSelectedIds(new Set())}
                      onSelectAll={() => setSelectedIds(new Set(activeItems.map((it) => it.id)))}
                      onOpen={() => setPickerOpen(true)}
                      lastSummary={lastAssignSummary}
                    />
                  ) : null}
                  {tab === 'collections' ? (
                    <CollectionsEmpty />
                  ) : activeLoading ? (
                    <LoadingList />
                  ) : activeError ? (
                    <ErrorPanel />
                  ) : activeItems.length === 0 ? (
                    <EmptyListPanel tab={tab} />
                  ) : (
                    <MaterialsList
                      items={activeItems}
                      selectable={tab === 'library' && flags.teachSections}
                      selectedIds={selectedIds}
                      onToggle={(id) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(id)) next.delete(id)
                          else next.add(id)
                          return next
                        })
                      }}
                    />
                  )}
                </div>

                <aside style={styles.rail}>
                  <TeachingStatsCard stats={stats} />
                  <RailTipCard />
                </aside>
              </section>
            </main>
          </div>
        </div>
      </div>
      {flags.teachSections ? (
        <SectionPicker
          open={pickerOpen}
          sheets={libraryQuery.items.filter((it) => selectedIds.has(it.id))}
          onClose={() => setPickerOpen(false)}
          onAssigned={(r) => {
            setLastAssignSummary({
              created: r?.created ?? 0,
              skipped: Array.isArray(r?.skipped) ? r.skipped.length : 0,
            })
            setSelectedIds(new Set())
          }}
        />
      ) : null}
    </>
  )
}

function BulkAssignBar({ selectedCount, totalCount, onClear, onSelectAll, onOpen, lastSummary }) {
  return (
    <div
      className="sh-card sh-fade-up"
      style={{
        padding: '10px 14px',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
          {selectedCount === 0
            ? 'Select items to assign to a section'
            : `${selectedCount} of ${totalCount} selected`}
        </div>
        {lastSummary ? (
          <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 2 }}>
            Last assign: {lastSummary.created} created
            {lastSummary.skipped ? `, ${lastSummary.skipped} skipped` : ''}.
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {selectedCount === 0 ? (
          <button
            type="button"
            onClick={onSelectAll}
            className="sh-press sh-focus-ring"
            style={bulkBarStyles.secondaryBtn}
          >
            Select all
          </button>
        ) : (
          <button
            type="button"
            onClick={onClear}
            className="sh-press sh-focus-ring"
            style={bulkBarStyles.secondaryBtn}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          disabled={selectedCount === 0}
          className="sh-press sh-focus-ring"
          style={{
            ...bulkBarStyles.primaryBtn,
            opacity: selectedCount === 0 ? 0.6 : 1,
            cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Assign to sections
        </button>
      </div>
    </div>
  )
}

const bulkBarStyles = {
  primaryBtn: {
    padding: '8px 14px',
    borderRadius: 'var(--radius-control)',
    background: 'var(--sh-accent, #2563eb)',
    border: '1px solid transparent',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 700,
  },
  secondaryBtn: {
    padding: '8px 14px',
    borderRadius: 'var(--radius-control)',
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    color: 'var(--sh-text)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
}

/* ─── Subcomponents ───────────────────────────────────────────────────── */

function MaterialsList({ items, selectable = false, selectedIds, onToggle }) {
  return (
    <ul
      className="sh-fade-up-stagger"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}
    >
      {items.map((item) => {
        const checked = selectable && selectedIds?.has?.(item.id)
        const RowWrapper = selectable ? 'div' : Link
        const wrapperProps = selectable
          ? {
              className: 'sh-card sh-hover-lift sh-press sh-focus-ring',
              style: {
                ...styles.row,
                ...(checked ? styles.rowSelected : null),
              },
            }
          : {
              to: `/sheets/${item.id}`,
              className: 'sh-card sh-hover-lift sh-press sh-focus-ring',
              style: styles.row,
            }
        return (
          <li key={item.id} className="sh-fade-up">
            <RowWrapper {...wrapperProps}>
              {selectable ? (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 4px',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.title || 'Untitled'}`}
                    checked={!!checked}
                    onChange={() => onToggle?.(item.id)}
                  />
                </label>
              ) : null}
              <div
                aria-hidden="true"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius)',
                  background: 'var(--sh-soft)',
                  border: '1px solid var(--sh-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--sh-muted)',
                  flexShrink: 0,
                }}
              >
                <IconSheets size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.rowTitle}>{item.title || 'Untitled'}</div>
                <div style={styles.rowMeta}>
                  {item.course?.code ? `${item.course.code} · ` : ''}
                  {item.status === 'draft' ? 'Draft' : 'Published'}
                  {item.updatedAt
                    ? ` · Updated ${new Date(item.updatedAt).toLocaleDateString()}`
                    : ''}
                </div>
              </div>
              {selectable ? (
                <Link
                  to={`/sheets/${item.id}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--sh-muted)',
                    textDecoration: 'none',
                    padding: '4px 8px',
                    border: '1px solid var(--sh-border)',
                    borderRadius: 'var(--radius-control)',
                  }}
                >
                  Open
                </Link>
              ) : null}
            </RowWrapper>
          </li>
        )
      })}
    </ul>
  )
}

function LoadingList() {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="sh-card" style={styles.row} aria-busy="true">
          <div className="sh-skeleton" style={{ width: 40, height: 40 }} />
          <div style={{ flex: 1, display: 'grid', gap: 6 }}>
            <div className="sh-skeleton" style={{ height: 12, width: '40%' }} />
            <div className="sh-skeleton" style={{ height: 10, width: '60%' }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ErrorPanel() {
  return (
    <div className="sh-card" style={styles.panel}>
      <h3 style={styles.panelTitle}>We could not load your materials.</h3>
      <p style={styles.panelBody}>Try refreshing the page. If this keeps happening, let us know.</p>
    </div>
  )
}

function EmptyListPanel({ tab }) {
  const copy =
    tab === 'library'
      ? {
          title: 'Your library is empty.',
          body: 'Publish a sheet to build your lesson library. Materials you publish here are private by default until you assign them to a section.',
          cta: 'Create your first material',
        }
      : {
          title: 'No drafts right now.',
          body: 'Drafts let you work on a lesson quietly. Start one from the New material button and it will land here until you publish.',
          cta: 'Start a draft',
        }
  return (
    <div className="sh-card sh-fade-up" style={styles.panel}>
      <h3 style={styles.panelTitle}>{copy.title}</h3>
      <p style={styles.panelBody}>{copy.body}</p>
      <Link
        to="/sheets/upload"
        className="sh-hover-lift sh-press sh-focus-ring"
        style={styles.primaryCta}
      >
        <IconPlus size={16} />
        {copy.cta}
      </Link>
    </div>
  )
}

function CollectionsEmpty() {
  return (
    <div className="sh-card sh-fade-up" style={styles.panel}>
      <h3 style={styles.panelTitle}>Collections arrive next week.</h3>
      <p style={styles.panelBody}>
        Collections let you bundle a unit of materials — a chapter, a module, a test-prep set — and
        assign the whole thing to a section in one step. We are landing the Section and Assignment
        model next week; your drafts and published materials will slot into collections then.
      </p>
    </div>
  )
}

function TeachingStatsCard({ stats }) {
  return (
    <div className="sh-card sh-fade-up" style={styles.railCard}>
      <h3 style={styles.railTitle}>Teaching snapshot</h3>
      <dl style={styles.statList}>
        <div style={styles.statRow}>
          <dt style={styles.statLabel}>Published</dt>
          <dd style={styles.statValue}>{stats.libraryCount}</dd>
        </div>
        <div style={styles.statRow}>
          <dt style={styles.statLabel}>Drafts</dt>
          <dd style={styles.statValue}>{stats.draftCount}</dd>
        </div>
        <div style={styles.statRow}>
          <dt style={styles.statLabel}>Last update</dt>
          <dd style={styles.statValue}>
            {stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleDateString() : '—'}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function RailTipCard() {
  return (
    <div className="sh-card sh-fade-up" style={styles.railCard}>
      <h3 style={styles.railTitle}>Tip</h3>
      <p style={styles.railBody}>
        Section-aware publishing arrives next week. You will be able to push the same material to
        one section without the other, and schedule a release time for a lesson.
      </p>
    </div>
  )
}

/* ─── Styles ──────────────────────────────────────────────────────────── */

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--sh-bg)',
    color: 'var(--sh-text)',
  },
  appGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 24,
  },
  main: {
    display: 'grid',
    gap: 20,
    minWidth: 0,
  },
  headerCard: {
    padding: '24px 28px',
    borderLeft: '3px solid var(--sh-accent, #2563eb)',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 18,
    flexWrap: 'wrap',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--sh-muted)',
    marginBottom: 6,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.015em',
    color: 'var(--sh-heading)',
  },
  subtitle: {
    margin: '6px 0 0 0',
    fontSize: 14,
    lineHeight: 1.5,
    color: 'var(--sh-muted)',
    maxWidth: 560,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  primaryCta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderRadius: 'var(--radius-control)',
    background: 'var(--sh-accent, #2563eb)',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
    border: '1px solid transparent',
  },
  tabs: {
    display: 'flex',
    gap: 8,
    padding: 6,
    background: 'var(--sh-soft)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    overflowX: 'auto',
  },
  tab: {
    flex: '1 1 auto',
    minWidth: 140,
    display: 'grid',
    gap: 2,
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    border: '1px solid transparent',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'var(--sh-muted)',
    transition: 'background 120ms ease-out, color 120ms ease-out',
  },
  tabActive: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    color: 'var(--sh-heading)',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: 700,
  },
  tabHelper: {
    fontSize: 11,
    fontWeight: 500,
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 280px',
    gap: 20,
  },
  listColumn: { minWidth: 0 },
  rail: { display: 'grid', gap: 14 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    textDecoration: 'none',
    color: 'inherit',
  },
  rowSelected: {
    borderLeft: '3px solid var(--sh-accent, #2563eb)',
    background: 'var(--sh-info-bg)',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--sh-heading)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    fontSize: 12,
    color: 'var(--sh-muted)',
    marginTop: 2,
  },
  panel: {
    padding: '22px 24px',
    display: 'grid',
    gap: 10,
    alignItems: 'start',
  },
  panelTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--sh-heading)',
  },
  panelBody: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--sh-muted)',
    maxWidth: 520,
  },
  railCard: {
    padding: '16px 18px',
  },
  railTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    color: 'var(--sh-heading)',
    letterSpacing: '-0.01em',
  },
  railBody: {
    margin: '8px 0 0 0',
    fontSize: 12,
    lineHeight: 1.5,
    color: 'var(--sh-muted)',
  },
  statList: {
    margin: '10px 0 0 0',
    padding: 0,
    display: 'grid',
    gap: 6,
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '6px 0',
    borderBottom: '1px solid var(--sh-border)',
  },
  statLabel: {
    margin: 0,
    fontSize: 12,
    color: 'var(--sh-muted)',
  },
  statValue: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--sh-heading)',
  },
}
