import { StatsGrid, ModerationOverview, ModerationActivityLog } from './AdminWidgets'

export default function OverviewTab({ overview, loadOverview }) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        padding: '22px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>Admin Overview</h1>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            This tab polls lightly in the background. Other tabs load only when you open them.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadOverview()}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#fff',
            color: '#475569',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Refresh
        </button>
      </div>

      {overview.error ? (
        <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 14px', fontSize: 13 }}>
          {overview.error}
        </div>
      ) : null}

      {!overview.stats && overview.loading ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading admin stats…</div>
      ) : overview.stats ? (
        <>
          <StatsGrid stats={overview.stats} />
          <ModerationOverview stats={overview.stats} />
          <ModerationActivityLog actions={overview.stats.recentModerationActions} />
        </>
      ) : null}
    </section>
  )
}
