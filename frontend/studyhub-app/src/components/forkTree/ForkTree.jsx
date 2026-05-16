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
 *
 * Layout (revised 2026-05-15 — founder screenshot complaint about the
 * tree being too tall and the "Exampublished" run-together rendering):
 * each node renders on ONE line — title · status pill · meta (author +
 * stars + time) — instead of the prior 2-row stack. The depth-shift +
 * branch SVG still imply the tree structure.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconFork } from '../Icons'
import UserAvatar from '../UserAvatar'
import { timeAgo } from '../../pages/sheets/lab/sheetLabConstants'

const DEFAULT_NODE_LIMIT = 6

function countNodes(node) {
  if (!node) return 0
  let n = 1
  for (const child of node.children || []) n += countNodes(child)
  return n
}

function flatten(node, depth = 0, out = []) {
  if (!node) return out
  out.push({ node, depth })
  for (const child of node.children || []) flatten(child, depth + 1, out)
  return out
}

function TreeNode({ node, depth, linkMode }) {
  if (!node) return null
  const href = linkMode === 'lab' ? `/sheets/${node.id}/lab` : `/sheets/${node.id}`

  return (
    <div
      className={`lineage-node lineage-node--single-line${node.isCurrent ? ' lineage-node--current' : ''}`}
      style={{ paddingLeft: depth * 20 + 8 }}
    >
      {depth > 0 ? (
        <span className="lineage-node__branch" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M0 0 V8 Q0 12 4 12 H14"
              stroke="var(--sh-border, #cbd5e1)"
              strokeWidth="1.25"
              fill="none"
            />
          </svg>
        </span>
      ) : null}
      <div className="lineage-node__row">
        <Link to={href} className="lineage-node__title" title={node.title || 'Untitled'}>
          {node.title || 'Untitled'}
        </Link>
        {node.isCurrent ? (
          <span className="lineage-node__you-badge" aria-label="current sheet">
            current
          </span>
        ) : null}
        {node.status && node.status !== 'published' ? (
          <span className={`lineage-node__status lineage-node__status--${node.status}`}>
            {node.status.replace('_', ' ')}
          </span>
        ) : null}
        <span className="lineage-node__meta">
          {node.author ? (
            <span className="lineage-node__author" title={`by ${node.author.username}`}>
              <UserAvatar
                username={node.author.username}
                avatarUrl={node.author.avatarUrl}
                size={14}
              />
              <span className="lineage-node__author-name">{node.author.username}</span>
            </span>
          ) : null}
          {node.stars > 0 ? (
            <span className="lineage-node__stat" aria-label={`${node.stars} stars`}>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
              </svg>
              {node.stars}
            </span>
          ) : null}
          {node.forks > 0 ? (
            <span className="lineage-node__stat" aria-label={`${node.forks} forks`}>
              <IconFork size={10} /> {node.forks}
            </span>
          ) : null}
          {node.updatedAt || node.createdAt ? (
            <span className="lineage-node__time">{timeAgo(node.updatedAt || node.createdAt)}</span>
          ) : null}
        </span>
      </div>
    </div>
  )
}

/**
 * Render the fork tree. Truncates to `DEFAULT_NODE_LIMIT` rows by default
 * (the current sheet + parent + a handful of siblings is usually enough
 * to give the user a sense of the lineage); a "Show all N forks" toggle
 * expands to the full tree. Keeps the panel from becoming a wall on
 * deeply-forked sheets.
 */
export default function ForkTree({ root, linkMode = 'viewer' }) {
  const [expanded, setExpanded] = useState(false)
  const nodes = useMemo(() => flatten(root), [root])
  const total = useMemo(() => countNodes(root), [root])

  if (!root) return null

  const visible = expanded ? nodes : nodes.slice(0, DEFAULT_NODE_LIMIT)
  const hidden = nodes.length - visible.length

  return (
    <>
      {visible.map(({ node, depth }) => (
        <TreeNode key={node.id} node={node} depth={depth} linkMode={linkMode} />
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="lineage-node__show-more"
          aria-label={`Show all ${total} sheets in the fork tree`}
        >
          Show {hidden} more {hidden === 1 ? 'fork' : 'forks'} ↓
        </button>
      ) : null}
      {expanded && nodes.length > DEFAULT_NODE_LIMIT ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="lineage-node__show-more lineage-node__show-more--collapse"
        >
          Show less ↑
        </button>
      ) : null}
    </>
  )
}
