/* ═══════════════════════════════════════════════════════════════════════════
 * ExploreTopicChips — horizontal topic-filter row for the Explore page.
 *
 * The first chip ("All topics") clears the filter. Each topic chip toggles
 * the ?topic=<topicTag> query param. Selected state rides the Chip
 * primitive's `selected` prop (aria-pressed + solid tone background).
 * ═══════════════════════════════════════════════════════════════════════════ */
import Chip from '../../components/ui/Chip/Chip'
import { Skeleton } from '../../components/Skeleton'

/**
 * @param {{
 *   topics: Array<{ topicTag: string, displayName: string, courseCount?: number }>,
 *   activeTopic: string,
 *   loading?: boolean,
 *   onSelect: (topicTag: string) => void,
 * }} props
 */
export default function ExploreTopicChips({ topics, activeTopic, loading, onSelect }) {
  if (loading) {
    return (
      <div className="explore-page__chips" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width={`${70 + (i % 3) * 24}px`} height={30} borderRadius={999} />
        ))}
      </div>
    )
  }

  if (!topics.length) return null

  return (
    <div className="explore-page__chips" role="group" aria-label="Filter by topic">
      <button
        type="button"
        className="explore-page__chip-btn"
        onClick={() => onSelect('')}
        aria-label="Show all topics"
      >
        <Chip variant="pill" tone="neutral" size="sm" selected={!activeTopic}>
          All topics
        </Chip>
      </button>
      {topics.map((topic) => {
        const isActive = activeTopic === topic.topicTag
        return (
          <button
            key={topic.topicTag}
            type="button"
            className="explore-page__chip-btn"
            onClick={() => onSelect(topic.topicTag)}
            aria-label={`Filter by ${topic.displayName}`}
          >
            <Chip variant="pill" tone="brand" size="sm" selected={isActive}>
              {topic.displayName}
            </Chip>
          </button>
        )
      })}
    </div>
  )
}
