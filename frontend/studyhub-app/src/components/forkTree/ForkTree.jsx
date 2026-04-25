/**
 * Shared recursive fork tree renderer used by both the SheetLab lineage tab
 * and the public sheet viewer sidebar.
 *
 * Each node shape comes from the backend /api/sheets/:id/fork-tree endpoint
 * (or the legacy /lab/lineage endpoint — same shape by construction):
 *   { id, title, status, author, forks, stars, updatedAt, isCurrent, children[] }
 *
 * `linkMode` controls where node titles navigate:
 *   'viewer' → /sheets/:id        (default — public viewer use)
 *   'lab'    → /sheets/:id/lab    (legacy lineage tab behavior)
 */
import { Link } from 'react-router-dom'
import { IconFork } from '../Icons'
import UserAvatar from '../UserAvatar'
import { timeAgo } from '../../pages/sheets/lab/sheetLabConstants'

function TreeNode({ node, depth, linkMode }) {
  if (!node) return null
  const href = linkMode === 'lab' ? `/sheets/${node.id}/lab` : `/sheets/${node.id}`

  return (
    <>
      <div
        className={`lineage-node${node.isCurrent ? ' lineage-node--current' : ''}`}
        style={{ paddingLeft: depth * 24 + 12 }}
      >
        {depth > 0 && (
          <span className="lineage-node__branch" aria-hidden="true">
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path
                d="M0 0 V10 H12"
                stroke="var(--sh-border, #cbd5e1)"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
          </span>
        )}
        <div className="lineage-node__card">
          <div className="lineage-node__top">
            <Link to={href} className="lineage-node__title">
              {node.title || 'Untitled'}
            </Link>
            {node.isCurrent && <span className="lineage-node__you-badge">current</span>}
            {node.status ? (
              <span className={`sheet-lab__status-badge sheet-lab__status-badge--${node.status}`}>
                {node.status.replace('_', ' ')}
              </span>
            ) : null}
          </div>
          <div className="lineage-node__meta">
            {node.author ? (
              <span className="lineage-node__author">
                <UserAvatar
                  username={node.author.username}
                  avatarUrl={node.author.avatarUrl}
                  size={16}
                />
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
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
                </svg>
                {node.stars}
              </span>
            )}
            {node.updatedAt || node.createdAt ? (
              <span className="lineage-node__time">
                {timeAgo(node.updatedAt || node.createdAt)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {node.children?.length > 0 &&
        node.children.map((child) => (
          <TreeNode key={child.id} node={child} depth={depth + 1} linkMode={linkMode} />
        ))}
    </>
  )
}

export default function ForkTree({ root, linkMode = 'viewer' }) {
  if (!root) return null
  return <TreeNode node={root} depth={0} linkMode={linkMode} />
}
