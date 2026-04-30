/**
 * AchievementIcon.jsx — Inline SVG glyphs keyed by Badge.iconSlug.
 *
 * No FontAwesome / external dependency. Each glyph is a small, simple shape
 * sized for the hexagon's inner circle (~40px). currentColor lets the parent
 * tier style colour the glyph through the cascade.
 *
 * If iconSlug is unknown, falls back to the trophy glyph so unknown badges
 * still render something legible.
 */

const GLYPHS = {
  page: (
    <g>
      <path d="M9 6h12a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M11 12h8M11 16h8M11 20h5" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </g>
  ),
  workshop: (
    <g>
      <rect x="6" y="14" width="20" height="12" rx="1.5" />
      <path d="M6 14l4-7h12l4 7" />
      <path d="M14 18h4" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </g>
  ),
  library: (
    <g>
      <rect x="6" y="6" width="4" height="22" rx="1" />
      <rect x="11" y="9" width="4" height="19" rx="1" />
      <rect x="16" y="6" width="4" height="22" rx="1" />
      <rect x="21" y="11" width="5" height="17" rx="1" />
    </g>
  ),
  medal: (
    <g>
      <circle cx="16" cy="20" r="7" />
      <path d="M10 6l4 8M22 6l-4 8" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="16" cy="20" r="3" fill="rgba(255,255,255,0.5)" />
    </g>
  ),
  compass: (
    <g>
      <circle cx="16" cy="16" r="10" />
      <path d="M20 12l-3 6-6 3 3-6z" fill="rgba(255,255,255,0.5)" />
    </g>
  ),
  star: (
    <g>
      <path d="M16 5l3.4 7 7.6 1-5.5 5.3 1.3 7.7L16 22.4l-6.8 3.6 1.3-7.7L5 13l7.6-1z" />
    </g>
  ),
  tree: (
    <g>
      <path d="M16 5l-7 8h4v6h-3l6 8 6-8h-3v-6h4z" />
    </g>
  ),
  fork: (
    <g>
      <circle cx="9" cy="8" r="3" />
      <circle cx="23" cy="8" r="3" />
      <circle cx="16" cy="24" r="3" />
      <path
        d="M9 11v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3M16 17v4"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </g>
  ),
  patch: (
    <g>
      <rect x="6" y="6" width="20" height="20" rx="3" />
      <path d="M11 16l3 3 7-7" stroke="rgba(255,255,255,0.7)" strokeWidth="2.4" fill="none" />
    </g>
  ),
  shield: (
    <g>
      <path d="M16 4l10 4v8c0 7-5 11-10 12-5-1-10-5-10-12V8z" />
      <path d="M11 16l3 3 7-7" stroke="rgba(255,255,255,0.7)" strokeWidth="2" fill="none" />
    </g>
  ),
  eye: (
    <g>
      <path d="M3 16s5-7 13-7 13 7 13 7-5 7-13 7-13-7-13-7z" />
      <circle cx="16" cy="16" r="4" fill="rgba(255,255,255,0.4)" />
      <circle cx="16" cy="16" r="2" />
    </g>
  ),
  lightning: (
    <g>
      <path d="M18 4l-9 14h6l-2 10 9-14h-6z" />
    </g>
  ),
  note: (
    <g>
      <path d="M8 6h12l4 4v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M20 6v4h4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" fill="none" />
      <path
        d="M11 16h10M11 20h10M11 24h6"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.4"
        fill="none"
      />
    </g>
  ),
  archive: (
    <g>
      <rect x="5" y="8" width="22" height="5" rx="1" />
      <rect x="7" y="13" width="18" height="14" rx="1" />
      <path d="M13 18h6" stroke="rgba(255,255,255,0.6)" strokeWidth="1.6" fill="none" />
    </g>
  ),
  tags: (
    <g>
      <path d="M6 6h10l10 10-10 10L6 16z" />
      <circle cx="11" cy="11" r="1.6" fill="rgba(255,255,255,0.7)" />
    </g>
  ),
  group: (
    <g>
      <circle cx="11" cy="12" r="4" />
      <circle cx="22" cy="12" r="4" />
      <path d="M4 26c0-4 4-7 7-7s7 3 7 7M14 26c0-4 4-7 7-7s7 3 7 7" />
    </g>
  ),
  flag: (
    <g>
      <path d="M9 4v24" stroke="currentColor" strokeWidth="2" />
      <path d="M9 6h14l-3 5 3 5H9z" />
    </g>
  ),
  calendar: (
    <g>
      <rect x="6" y="8" width="20" height="18" rx="2" />
      <path
        d="M6 14h20M11 4v6M21 4v6"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="1.4"
        fill="none"
      />
    </g>
  ),
  person: (
    <g>
      <circle cx="16" cy="11" r="5" />
      <path d="M5 27c0-6 5-10 11-10s11 4 11 10" />
    </g>
  ),
  people: (
    <g>
      <circle cx="11" cy="11" r="4" />
      <circle cx="22" cy="13" r="3" />
      <path d="M3 26c0-4 4-7 8-7s8 3 8 7M19 26c0-3 3-5 6-5s6 2 6 5" />
    </g>
  ),
  crown: (
    <g>
      <path d="M5 22l2-12 5 6 4-10 4 10 5-6 2 12z" />
      <path d="M5 26h22" stroke="rgba(255,255,255,0.7)" strokeWidth="2" fill="none" />
    </g>
  ),
  sparkle: (
    <g>
      <path d="M16 4l2 8 8 2-8 2-2 8-2-8-8-2 8-2z" />
    </g>
  ),
  spark: (
    <g>
      <path
        d="M16 4v8M16 20v8M4 16h8M20 16h8"
        stroke="currentColor"
        strokeWidth="2.4"
        fill="none"
      />
      <circle cx="16" cy="16" r="3" />
    </g>
  ),
  flame: (
    <g>
      <path d="M16 4c-2 4 4 6 0 12-3-2-3-6 0-8 1 8 8 6 8 14 0 4-3 7-8 7s-8-3-8-7c0-5 4-7 8-18z" />
    </g>
  ),
  sun: (
    <g>
      <circle cx="16" cy="16" r="5" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M16 4v3M16 25v3M4 16h3M25 16h3M7 7l2 2M23 23l2 2M7 25l2-2M23 9l2-2" fill="none" />
      </g>
    </g>
  ),
  moon: (
    <g>
      <path d="M22 6a10 10 0 1 0 4 14A8 8 0 0 1 22 6z" />
      <circle cx="11" cy="14" r="0.8" fill="rgba(255,255,255,0.5)" />
      <circle cx="14" cy="20" r="0.8" fill="rgba(255,255,255,0.5)" />
    </g>
  ),
  flask: (
    <g>
      <path d="M13 4v8L7 25a3 3 0 0 0 3 4h12a3 3 0 0 0 3-4l-6-13V4z" />
      <path d="M11 4h10" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="13" cy="22" r="1" fill="rgba(255,255,255,0.6)" />
      <circle cx="18" cy="20" r="0.8" fill="rgba(255,255,255,0.6)" />
    </g>
  ),
  globe: (
    <g>
      <circle cx="16" cy="16" r="11" />
      <path
        d="M5 16h22M16 5c4 4 4 18 0 22M16 5c-4 4-4 18 0 22"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.5"
        fill="none"
      />
    </g>
  ),
  check: (
    <g>
      <circle cx="16" cy="16" r="11" />
      <path d="M10 16l4 4 8-8" stroke="rgba(255,255,255,0.85)" strokeWidth="2.6" fill="none" />
    </g>
  ),
  heart: (
    <g>
      <path d="M16 27S5 19 5 12a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 7-11 15-11 15z" />
    </g>
  ),
  trophy: (
    <g>
      <path d="M9 6h14v6a7 7 0 0 1-14 0z" />
      <path
        d="M5 8h4v4a3 3 0 0 1-3-3zM27 8h-4v4a3 3 0 0 0 3-3z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
      <path d="M13 19v3h6v-3M9 26h14" stroke="currentColor" strokeWidth="2" fill="none" />
    </g>
  ),
}

/**
 * @param {{ slug: string|null|undefined, size?: number }} props
 */
export default function AchievementIcon({ slug, size = 32 }) {
  const glyph = (slug && GLYPHS[slug]) || GLYPHS.trophy
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="0"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyph}
    </svg>
  )
}
