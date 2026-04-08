/**
 * Sidebar widget: full fork tree for the current sheet, mounted on the
 * public viewer. Uses the new /api/sheets/:id/fork-tree endpoint which
 * returns only published sheets and flags the current node with isCurrent.
 *
 * Hidden when the tree is null or contains only the current sheet (no forks)
 * — the "forks: N" text is already shown in the Collaboration panel above.
 */
import { useEffect, useState } from 'react'
import ForkTree from '../../../components/forkTree/ForkTree'
import { IconFork } from '../../../components/Icons'
import { fetchSheetForkTree } from '../../../lib/diffService'
import { panelStyle } from './sheetViewerConstants'

export default function ForkTreePanel({ sheetId }) {
  const [state, setState] = useState({ loading: true, root: null, count: 0, error: '' })

  useEffect(() => {
    if (!sheetId) return
    let cancelled = false

    fetchSheetForkTree(sheetId)
      .then((data) => {
        if (cancelled) return
        setState({
          loading: false,
          root: data.root || null,
          count: data.count || 0,
          error: '',
        })
      })
      .catch((err) => {
        if (cancelled) return
        setState({ loading: false, root: null, count: 0, error: err.message || 'Could not load fork tree.' })
      })

    return () => { cancelled = true }
  }, [sheetId])

  // Only render when there's genuinely a tree worth showing (root + at least
  // one fork). A lone sheet with no forks does not need its own panel.
  if (state.loading || state.error || !state.root || state.count <= 1) return null

  return (
    <section style={panelStyle()}>
      <h2 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--sh-heading)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconFork size={14} />
        Fork tree
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sh-muted)', fontWeight: 600 }}>
          {state.count} {state.count === 1 ? 'sheet' : 'sheets'}
        </span>
      </h2>
      <div className="lineage-panel__tree" style={{ margin: 0 }}>
        <ForkTree root={state.root} linkMode="viewer" />
      </div>
    </section>
  )
}
