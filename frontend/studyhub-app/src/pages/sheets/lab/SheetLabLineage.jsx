import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { IconFork } from '../../components/Icons'
import { timeAgo } from './sheetLabConstants'

/* ── Fork tree node (recursive) ──────────────────────────── */

function TreeNode({ node, depth = 0 }) {
  return (
    <>
      <div
        className={`lineage-node${node.isCurrent ? ' lineage-node--current' : ''}`}
        style={{ paddingLeft: depth * 24 + 12 }}
      >
        {depth > 0 && (
          <span className="lineage-node__branch" aria-hidden="true">
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path d="M0 0 V10 H12" stroke="var(--sh-border, #cbd5e1)" strokeWidth="1.5" fill="none" />
            </svg>
          </span>
        )}
        <div className="lineage-node__card">
          <div className="lineage-node__top">
            <Link
              to={`/sheets/${node.id}/lab`}
              className="lineage-node__title"
            >
              {node.title || 'Untitled'}
            </Link>
            {node.isCurrent && (
              <span className="lineage-node__you-badge">current</span>
            )}
            <span className={`sheet-lab__status-badge sheet-lab__status-badge--${node.status}`}>
              {(node.status || '').replace('_', ' ')}
            </span>
          </div>
          <div className="lineage-node__meta">
            {node.author ? (
              <span className="lineage-node__author">
                {node.author.avatarUrl ? (
                  <img src={node.author.avatarUrl} alt="" className="lineage-node__avatar" />
                ) : (
                  <span className="lineage-node__avatar lineage-node__avatar--fallback">
                    {(node.author.username || '?')[0].toUpperCase()}
                  </span>
                )}
                {node.author.username}
              </span>
            ) : null}
            {node.forks > 0 && (
              <span className="lineage-node__stat">
                <IconFork size={11} /> {node.forks}
              </span>
            )}
            {node.stars > 0 && (
              <span className="lineage-node__stat">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
                </svg>
                {node.stars}
              </span>
            )}
            <span className="lineage-node__time">{timeAgo(node.updatedAt)}</span>
          </div>
        </div>
      </div>
      {node.children?.length > 0 && node.children.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  )
}

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
        <p className="sheet-lab__empty-text">
          This sheet has no fork history to display.
        </p>
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
        <TreeNode node={lineage.root} depth={0} />
      </div>
    </div>
  )
}
