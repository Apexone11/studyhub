import { Pager } from './AdminWidgets'
import {
  FONT,
  createPageState,
  createAuditState,
  formatDateTime,
  formatLabel,
  tableHeadStyle,
  tableCell,
  tableCellStrong,
  inputStyle,
  pillButton,
  suppressionStatusPill,
} from './adminConstants'

export default function EmailSuppressionsTab({
  suppressionsState,
  suppressionStatus,
  suppressionQueryInput,
  suppressionQuery,
  suppressionMessage,
  unsuppressReasonById,
  unsuppressErrorById,
  unsuppressSavingId,
  auditState,
  setSuppressionStatus,
  setSuppressionQueryInput,
  setSuppressionMessage,
  setSuppressionsState,
  setUnsuppressReasonById,
  setUnsuppressErrorById,
  submitSuppressionSearch,
  clearSuppressionFilters,
  unsuppressRecipient,
  loadSuppressionAudit,
  setAuditState,
  loadPagedData,
}) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          {suppressionsState.total} total suppression records
        </div>
        <form onSubmit={submitSuppressionSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={suppressionStatus}
            onChange={(event) => {
              setSuppressionStatus(event.target.value)
              setSuppressionMessage('')
              setSuppressionsState(createPageState())
            }}
            style={{
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              padding: '7px 10px',
              fontSize: 12,
              color: '#334155',
              fontFamily: FONT,
            }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          <input
            value={suppressionQueryInput}
            onChange={(event) => setSuppressionQueryInput(event.target.value)}
            placeholder="Search by email"
            style={{ ...inputStyle, width: 220, padding: '8px 10px' }}
          />
          <button type="submit" style={pillButton('#eff6ff', '#1d4ed8', '#bfdbfe')}>
            Search
          </button>
          <button
            type="button"
            onClick={clearSuppressionFilters}
            style={pillButton('#fff', '#475569', '#cbd5e1')}
            disabled={!suppressionQueryInput && !suppressionQuery && suppressionStatus === 'active'}
          >
            Reset
          </button>
        </form>
      </div>

      {suppressionMessage ? (
        <div style={{ color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
          {suppressionMessage}
        </div>
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Email', 'Reason', 'Source', 'Updated', 'Status', 'Actions'].map((header) => (
                <th key={header} style={tableHeadStyle}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppressionsState.items.map((record) => (
              <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tableCellStrong}>{record.email}</td>
                <td style={tableCell}>{formatLabel(record.reason, '—')}</td>
                <td style={tableCell}>
                  <div style={{ marginBottom: 4 }}>
                    {formatLabel(record.provider)} · {formatLabel(record.sourceEventType)}
                  </div>
                  {record.sourceMessageId ? (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>msg: {record.sourceMessageId}</div>
                  ) : null}
                </td>
                <td style={tableCell}>{formatDateTime(record.updatedAt || record.lastSuppressedAt)}</td>
                <td style={tableCell}>
                  <span style={suppressionStatusPill(record.active)}>{record.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td style={{ ...tableCell, minWidth: 260 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => void loadSuppressionAudit(record.id, 1)}
                        style={pillButton('#eff6ff', '#1d4ed8', '#bfdbfe')}
                        aria-label={`View audit for ${record.email}`}
                      >
                        View audit
                      </button>
                      {record.active ? (
                        <button
                          type="button"
                          onClick={() => void unsuppressRecipient(record)}
                          style={pillButton('#ecfdf5', '#047857', '#a7f3d0')}
                          disabled={unsuppressSavingId === record.id}
                          aria-label={`Unsuppress ${record.email}`}
                        >
                          {unsuppressSavingId === record.id ? 'Unsuppressing…' : 'Unsuppress'}
                        </button>
                      ) : null}
                    </div>
                    {record.active ? (
                      <input
                        value={unsuppressReasonById[record.id] || ''}
                        onChange={(event) => {
                          const { value } = event.target
                          setUnsuppressReasonById((current) => ({ ...current, [record.id]: value }))
                          if (unsuppressErrorById[record.id]) {
                            setUnsuppressErrorById((current) => ({ ...current, [record.id]: '' }))
                          }
                        }}
                        placeholder="Unsuppress reason (min 8 chars)"
                        aria-label={`Unsuppress reason for ${record.email}`}
                        style={{ ...inputStyle, padding: '8px 10px' }}
                      />
                    ) : null}
                    {unsuppressErrorById[record.id] ? (
                      <div style={{ fontSize: 12, color: '#b91c1c' }}>{unsuppressErrorById[record.id]}</div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {suppressionsState.items.length === 0 && !suppressionsState.loading ? (
        <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
          No suppression records for this filter.
        </div>
      ) : null}

      <Pager
        page={suppressionsState.page}
        total={suppressionsState.total}
        onChange={(page) => void loadPagedData('email-suppressions', page)}
      />

      {auditState.suppressionId ? (
        <section
          style={{
            marginTop: 18,
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '14px 16px',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 3 }}>Audit timeline</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{auditState.suppression?.email || `Suppression #${auditState.suppressionId}`}</div>
            </div>
            <button
              type="button"
              onClick={() => setAuditState(createAuditState())}
              style={pillButton('#fff', '#475569', '#cbd5e1')}
            >
              Close
            </button>
          </div>

          {auditState.error ? (
            <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 8 }}>{auditState.error}</div>
          ) : null}

          {auditState.loading && !auditState.loaded ? (
            <div style={{ color: '#94a3b8', fontSize: 12 }}>Loading audit timeline…</div>
          ) : auditState.entries.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {auditState.entries.map((entry) => (
                <div key={entry.id} style={{ border: '1px solid #dbe1e8', borderRadius: 10, padding: '10px 12px', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>{formatLabel(entry.action)}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatDateTime(entry.createdAt)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{entry.reason || 'No reason provided.'}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Actor: {entry.performedBy?.username || 'System'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#64748b', fontSize: 12 }}>No audit entries recorded yet.</div>
          )}

          {auditState.loaded ? (
            <Pager
              page={auditState.page}
              total={auditState.total}
              onChange={(page) => void loadSuppressionAudit(auditState.suppressionId, page)}
            />
          ) : null}
        </section>
      ) : null}
    </>
  )
}
