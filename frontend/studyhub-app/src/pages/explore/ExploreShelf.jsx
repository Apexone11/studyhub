/* ═══════════════════════════════════════════════════════════════════════════
 * ExploreShelf — one labeled shelf of discovery items on the Explore page.
 *
 * Renders a section header + a responsive card grid. Each item links to its
 * existing detail route (/sheets/:id, /notes/:id, /study-groups/:id). The
 * `kind` prop selects the card shape: "sheet" (used for sheets + trending),
 * "note", or "group". Loading shows skeleton cards; empty shows a quiet
 * empty-state with a hint to switch topics.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import { IconStar, IconUsers } from '../../components/Icons'
import UserAvatar from '../../components/UserAvatar'
import { SkeletonCard } from '../../components/Skeleton'
import { timeAgo } from '../shared/pageUtils'

function SheetCard({ item }) {
  return (
    <Link to={`/sheets/${item.id}`} className="explore-card">
      {item.course?.code ? <span className="explore-card__eyebrow">{item.course.code}</span> : null}
      <span className="explore-card__title">{item.title}</span>
      {item.previewText ? <span className="explore-card__preview">{item.previewText}</span> : null}
      <span className="explore-card__meta">
        {item.author?.username ? (
          <span className="explore-card__author">
            <UserAvatar
              username={item.author.username}
              avatarUrl={item.author.avatarUrl}
              size={18}
            />
            {item.author.username}
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
        <span className="explore-card__stat">
          <IconStar size={13} />
          {item.stars ?? 0}
        </span>
      </span>
    </Link>
  )
}

function NoteCard({ item }) {
  return (
    <Link to={`/notes/${item.id}`} className="explore-card">
      {item.course?.code ? <span className="explore-card__eyebrow">{item.course.code}</span> : null}
      <span className="explore-card__title">{item.title}</span>
      {item.previewText ? <span className="explore-card__preview">{item.previewText}</span> : null}
      <span className="explore-card__meta">
        {item.author?.username ? (
          <span className="explore-card__author">
            <UserAvatar
              username={item.author.username}
              avatarUrl={item.author.avatarUrl}
              size={18}
            />
            {item.author.username}
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
        {item.createdAt ? (
          <span className="explore-card__stat">{timeAgo(item.createdAt)}</span>
        ) : null}
      </span>
    </Link>
  )
}

function GroupCard({ item }) {
  return (
    <Link to={`/study-groups/${item.id}`} className="explore-card">
      {item.course?.code ? <span className="explore-card__eyebrow">{item.course.code}</span> : null}
      <span className="explore-card__title">{item.name}</span>
      {item.description ? <span className="explore-card__preview">{item.description}</span> : null}
      <span className="explore-card__meta">
        <span className="explore-card__stat">
          <IconUsers size={13} />
          {item._count?.members ?? 0} member{(item._count?.members ?? 0) === 1 ? '' : 's'}
        </span>
        {item.createdAt ? (
          <span className="explore-card__stat">{timeAgo(item.createdAt)}</span>
        ) : null}
      </span>
    </Link>
  )
}

const CARD_BY_KIND = {
  sheet: SheetCard,
  note: NoteCard,
  group: GroupCard,
}

/**
 * @param {{
 *   title: string,
 *   icon?: React.ComponentType<{ size?: number }>,
 *   kind: 'sheet' | 'note' | 'group',
 *   items: Array<object>,
 *   loading?: boolean,
 *   activeTopic?: string,
 *   onClearTopic?: () => void,
 * }} props
 */
export default function ExploreShelf({
  title,
  icon: Icon,
  kind,
  items,
  loading,
  activeTopic,
  onClearTopic,
}) {
  const Card = CARD_BY_KIND[kind] || SheetCard

  return (
    <section className="sh-card sh-card--flat explore-page__shelf">
      <div className="explore-page__shelf-head">
        <h2 className="explore-page__shelf-title">
          {Icon ? <Icon size={16} /> : null}
          {title}
        </h2>
      </div>

      {loading ? (
        <div className="explore-page__grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="explore-page__empty">
          <p className="explore-page__empty-text">
            {activeTopic
              ? 'No content for this topic yet.'
              : 'Nothing to show here yet — check back soon.'}
          </p>
          {activeTopic && onClearTopic ? (
            <button
              type="button"
              className="sh-btn sh-btn--ghost sh-btn--sm"
              onClick={onClearTopic}
            >
              Browse all topics
            </button>
          ) : null}
        </div>
      ) : (
        <div className="explore-page__grid">
          {items.map((item) => (
            <Card key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}
