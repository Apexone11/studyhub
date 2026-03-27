// SubmitPage reserves the course-request route and keeps its future workflow scoped to one folder.
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { PageShell } from '../shared/pageScaffold'

export default function SubmitPage() {
  return (
    <PageShell nav={<Navbar crumbs={[{ label: 'Submit Request', to: '/submit' }]} hideTabs />} sidebar={<AppSidebar />}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '32px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Request a Missing Course</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Can&apos;t find your course? Let us know and we&apos;ll add it within 24h.</p>
        <div style={{ fontSize: 12, color: '#94a3b8', border: '1.5px dashed #cbd5e1', borderRadius: 10, padding: 20, textAlign: 'center' }}>
          Form coming soon — POST /api/courses/request
        </div>
      </div>
    </PageShell>
  )
}
