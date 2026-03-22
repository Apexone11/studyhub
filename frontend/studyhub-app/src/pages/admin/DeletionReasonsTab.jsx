import { Pager } from './AdminWidgets'
import { tableHeadStyle, tableCell, tableCellStrong } from './adminConstants'

export default function DeletionReasonsTab({ deletionsState, loadPagedData }) {
  return (
    <>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
        {deletionsState.total} deletion records
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Username', 'Reason', 'Details', 'Date'].map((header) => (
                <th key={header} style={tableHeadStyle}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deletionsState.items.map((record) => (
              <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tableCellStrong}>{record.username}</td>
                <td style={tableCell}>{String(record.reason || '').replace(/_/g, ' ') || '—'}</td>
                <td style={tableCell}>{record.details || '—'}</td>
                <td style={tableCell}>{new Date(record.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={deletionsState.page} total={deletionsState.total} onChange={(page) => void loadPagedData('deletion-reasons', page)} />
    </>
  )
}
