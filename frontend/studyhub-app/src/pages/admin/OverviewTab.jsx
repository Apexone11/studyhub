import { StatsGrid, ModerationOverview, ModerationActivityLog } from './AdminWidgets'

export default function OverviewTab({ overview, loadOverview }) {
  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 18,
        border: '1px solid var(--sh-border)',
        padding: '22px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: 'var(--sh-heading)' }}>Admin Overview</h1>
          <div style={{ fontSize: 12, color: 'var(--sh-subtext)', marginTop: 4 }}>
            This tab polls lightly in the background. Other tabs load only when you open them.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadOverview()}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-surface)',
            color: 'var(--sh-subtext)',
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
        <div
          style={{
            color: 'var(--sh-danger)',
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 13,
          }}
        >
          {overview.error}
        </div>
      ) : null}

      {!overview.stats && overview.loading ? (
        <div style={{ color: 'var(--sh-subtext)', fontSize: 13 }}>Loading admin stats…</div>
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
