import { Pager } from './AdminWidgets'
import { pillButton } from './adminConstants'

export default function SheetsTab({ sheetsState, deleteSheet, loadPagedData }) {
  return (
    <>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
        {sheetsState.total} total sheets
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {sheetsState.items.length === 0 && (
          <div className="admin-empty">No sheets found.</div>
        )}
        {sheetsState.items.map((record) => (
          <div key={record.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 5 }}>{record.title}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {record.course?.code || 'No course'} · by {record.author?.username || 'unknown'}
              </div>
            </div>
            <button type="button" onClick={() => void deleteSheet(record.id)} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
              Delete
            </button>
          </div>
        ))}
      </div>
      <Pager page={sheetsState.page} total={sheetsState.total} onChange={(page) => void loadPagedData('sheets', page)} />
    </>
  )
}
