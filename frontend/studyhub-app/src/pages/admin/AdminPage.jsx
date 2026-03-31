import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import ConfirmDialog from '../../components/ConfirmDialog'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { useLivePolling } from '../../lib/useLivePolling'
import { FONT, TABS, formatDateTime } from './adminConstants'
import { AccessDeniedCard } from './AdminWidgets'
import { useAdminData } from './useAdminData'
import ModerationTab from './moderation/ModerationTab'
import SheetReviewPanel from './sheetReview/SheetReviewPanel'
import OverviewTab from './OverviewTab'
import UsersTab from './UsersTab'
import SheetsTab from './SheetsTab'
import SheetReviewsTab from './sheetReview/SheetReviewsTab'
import AnnouncementsTab from './AnnouncementsTab'
import DeletionReasonsTab from './DeletionReasonsTab'
import EmailSuppressionsTab from './EmailSuppressionsTab'
import AdminSettingsTab from './AdminSettingsTab'
import SchoolsTab from './SchoolsTab'

export default function AdminPage() {
  const layout = useResponsiveAppLayout()
  const [activeTab, setActiveTab] = useState('overview')
  const d = useAdminData()
  const isAdmin = d.user?.role === 'admin'

  useEffect(() => {
    if (!d.user || d.user.role !== 'admin') return
    if (activeTab === 'overview' && !d.overview.loaded && !d.overview.loading) { void d.loadOverview(); return }
    if (activeTab === 'users' && !d.usersState.loaded && !d.usersState.loading) { void d.loadPagedData('users', d.usersState.page); return }
    if (activeTab === 'sheets' && !d.sheetsState.loaded && !d.sheetsState.loading) { void d.loadPagedData('sheets', d.sheetsState.page); return }
    if (activeTab === 'sheet-reviews' && !d.reviewState.loaded && !d.reviewState.loading) { void d.loadPagedData('sheet-reviews', d.reviewState.page); return }
    if (activeTab === 'announcements' && !d.announcementsState.loaded && !d.announcementsState.loading) { void d.loadPagedData('announcements', d.announcementsState.page); return }
    if (activeTab === 'deletion-reasons' && !d.deletionsState.loaded && !d.deletionsState.loading) { void d.loadPagedData('deletion-reasons', d.deletionsState.page) }
    if (activeTab === 'email-suppressions' && !d.suppressionsState.loaded && !d.suppressionsState.loading) { void d.loadPagedData('email-suppressions', d.suppressionsState.page) }
    if (activeTab === 'settings' && d.htmlKillSwitch.loading) { void d.loadHtmlKillSwitch() }
  }, [
    activeTab, d,
  ])

  useLivePolling(d.loadOverview, {
    enabled: Boolean(d.user?.role === 'admin' && activeTab === 'overview'),
    intervalMs: 45000,
  })

  useLivePolling(async () => { await d.loadPagedData('sheet-reviews', d.reviewState.page) }, {
    enabled: Boolean(d.user?.role === 'admin' && activeTab === 'sheet-reviews'),
    intervalMs: 30000,
    refreshKey: `${d.reviewState.page}|${d.reviewStatus}|${d.reviewFormatFilter}|${d.reviewScanFilter}`,
  })

  const tabState = useMemo(() => {
    const map = { users: d.usersState, sheets: d.sheetsState, 'sheet-reviews': d.reviewState, announcements: d.announcementsState, 'deletion-reasons': d.deletionsState, 'email-suppressions': d.suppressionsState }
    return map[activeTab] || null
  }, [activeTab, d.announcementsState, d.deletionsState, d.reviewState, d.sheetsState, d.suppressionsState, d.usersState])

  if (!d.user) return null

  const navActions = (
    <Link to="/feed" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--sh-slate-700, #334155)', color: 'var(--sh-slate-400, #94a3b8)', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>
      ← Feed
    </Link>
  )

  return (
  <>
    <div style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Admin', to: '/admin' }]} hideTabs actions={navActions} />
      <div style={{ ...pageShell('app'), display: 'grid', gridTemplateColumns: layout.columns.appTwoColumn, gap: 20 }}>
        <AppSidebar mode={layout.sidebarMode} />

        <main id="main-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isAdmin ? (
            <>
              <section style={{ background: 'var(--sh-surface, #fff)', borderRadius: 18, border: '1px solid var(--sh-border, #e2e8f0)', padding: '18px 20px' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TABS.map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setActiveTab(value)}
                      style={{ padding: '8px 14px', borderRadius: 10, border: activeTab === value ? '1px solid #2563eb' : '1px solid var(--sh-border, #e2e8f0)', background: activeTab === value ? 'var(--sh-info-bg, #eff6ff)' : 'var(--sh-surface, #fff)', color: activeTab === value ? 'var(--sh-info-text, #1d4ed8)' : 'var(--sh-slate-600, #475569)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {activeTab === 'overview' ? <OverviewTab overview={d.overview} loadOverview={d.loadOverview} /> : null}

              {activeTab === 'moderation' ? (
                <ModerationTab apiJson={d.apiJson} setConfirmAction={d.setConfirmAction} formatDateTime={formatDateTime} />
              ) : null}

              {activeTab === 'schools' ? (
                <SchoolsTab apiJson={d.apiJson} />
              ) : null}

              {activeTab !== 'overview' && activeTab !== 'settings' && activeTab !== 'moderation' && activeTab !== 'schools' ? (
                <section style={{ background: 'var(--sh-surface, #fff)', borderRadius: 18, border: '1px solid var(--sh-border, #e2e8f0)', padding: '22px' }}>
                  {tabState?.error ? (
                    <div style={{ color: 'var(--sh-danger-text, #b91c1c)', background: 'var(--sh-danger-bg, #fef2f2)', border: '1px solid var(--sh-danger-border, #fecaca)', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 14 }}>
                      {tabState.error}
                    </div>
                  ) : null}

                  {activeTab === 'users' ? <UsersTab usersState={d.usersState} currentUserId={d.user.id} patchRole={d.patchRole} deleteUser={d.deleteUser} loadPagedData={d.loadPagedData} /> : null}
                  {activeTab === 'sheets' ? <SheetsTab sheetsState={d.sheetsState} deleteSheet={d.deleteSheet} loadPagedData={d.loadPagedData} /> : null}
                  {activeTab === 'sheet-reviews' ? <SheetReviewsTab reviewState={d.reviewState} reviewStatus={d.reviewStatus} reviewFormatFilter={d.reviewFormatFilter} reviewScanFilter={d.reviewScanFilter} setReviewStatus={d.setReviewStatus} setReviewFormatFilter={d.setReviewFormatFilter} setReviewScanFilter={d.setReviewScanFilter} setReviewState={d.setReviewState} reviewSheet={d.reviewSheet} setReviewPanelSheetId={d.setReviewPanelSheetId} loadPagedData={d.loadPagedData} /> : null}
                  {activeTab === 'announcements' ? <AnnouncementsTab announcementsState={d.announcementsState} announceForm={d.announceForm} setAnnounceForm={d.setAnnounceForm} announceSaving={d.announceSaving} announceError={d.announceError} saveAnnouncement={d.saveAnnouncement} togglePin={d.togglePin} deleteAnnouncement={d.deleteAnnouncement} loadPagedData={d.loadPagedData} /> : null}
                  {activeTab === 'deletion-reasons' ? <DeletionReasonsTab deletionsState={d.deletionsState} loadPagedData={d.loadPagedData} /> : null}
                  {activeTab === 'email-suppressions' ? <EmailSuppressionsTab suppressionsState={d.suppressionsState} suppressionStatus={d.suppressionStatus} suppressionQueryInput={d.suppressionQueryInput} suppressionQuery={d.suppressionQuery} suppressionMessage={d.suppressionMessage} unsuppressReasonById={d.unsuppressReasonById} unsuppressErrorById={d.unsuppressErrorById} unsuppressSavingId={d.unsuppressSavingId} auditState={d.auditState} setSuppressionStatus={d.setSuppressionStatus} setSuppressionQueryInput={d.setSuppressionQueryInput} setSuppressionMessage={d.setSuppressionMessage} setSuppressionsState={d.setSuppressionsState} setUnsuppressReasonById={d.setUnsuppressReasonById} setUnsuppressErrorById={d.setUnsuppressErrorById} submitSuppressionSearch={d.submitSuppressionSearch} clearSuppressionFilters={d.clearSuppressionFilters} unsuppressRecipient={d.unsuppressRecipient} loadSuppressionAudit={d.loadSuppressionAudit} setAuditState={d.setAuditState} loadPagedData={d.loadPagedData} /> : null}

                  {tabState?.loading && !tabState.loaded ? (
                    <div style={{ color: 'var(--sh-slate-400, #94a3b8)', fontSize: 13, marginTop: 12 }}>Loading tab…</div>
                  ) : null}
                </section>
              ) : null}

              {activeTab === 'settings' ? <AdminSettingsTab user={d.user} htmlKillSwitch={d.htmlKillSwitch} htmlToggleSaving={d.htmlToggleSaving} toggleHtmlUploads={d.toggleHtmlUploads} /> : null}
            </>
          ) : (
            <AccessDeniedCard user={d.user} />
          )}
        </main>
      </div>
    </div>
    <ConfirmDialog
      open={d.confirmAction !== null}
      title={d.confirmAction?.title}
      message={d.confirmAction?.message}
      confirmLabel={d.confirmAction?.variant === 'danger' ? 'Delete' : 'Confirm'}
      cancelLabel="Cancel"
      variant={d.confirmAction?.variant || 'default'}
      onConfirm={d.confirmAction?.onConfirm}
      onCancel={() => d.setConfirmAction(null)}
    />
    {d.reviewPanelSheetId !== null && (
      <SheetReviewPanel
        sheetId={d.reviewPanelSheetId}
        onClose={() => d.setReviewPanelSheetId(null)}
        onReviewComplete={async () => {
          d.setReviewPanelSheetId(null)
          await Promise.all([d.loadPagedData('sheet-reviews', d.reviewState.page), d.loadPagedData('sheets', d.sheetsState.page), d.loadOverview()])
        }}
      />
    )}
  </>
  )
}
