import { useEffect } from 'react'
import { IconFork } from '../../../components/Icons'
import ForkTree from '../../../components/forkTree/ForkTree'

/* ── Main lineage panel ──────────────────────────────────── */

export default function SheetLabLineage({ lab }) {
  const { lineage, loadingLineage, loadLineage } = lab

  useEffect(() => {
    loadLineage()
  }, [loadLineage])

  if (loadingLineage && !lineage) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--sh-muted)', fontSize: 14 }}>
        Loading fork tree...
      </div>
    )
  }

  if (!lineage || !lineage.root) {
    return (
      <div className="sheet-lab__empty">
        <div className="sheet-lab__empty-icon">
          <IconFork size={24} />
        </div>
        <p className="sheet-lab__empty-title">No lineage data</p>
        <p className="sheet-lab__empty-text">This sheet has no fork history to display.</p>
      </div>
    )
  }

  return (
    <div className="lineage-panel">
      <div className="lineage-panel__header">
        <h3 className="lineage-panel__title">
          <IconFork size={16} />
          Fork Tree
        </h3>
        <span className="lineage-panel__count">
          {lineage.totalForks || 0} fork{lineage.totalForks === 1 ? '' : 's'}
        </span>
      </div>
      <div className="lineage-panel__tree">
        <ForkTree root={lineage.root} linkMode="lab" />
      </div>
    </div>
  )
}
