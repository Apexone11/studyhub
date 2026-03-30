// src/components/Icons.jsx
// StudyHub custom icon set — matches the Fork Tree logo DNA:
// rounded linecaps, Q-curves, node circles, two stroke weights.
// All icons: 24×24 viewBox, currentColor, outline style.
// Usage: <IconFeed size={20} className="text-blue-500" />

function Svg({ size = 20, children, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

// ─── NAV / SIDEBAR ICONS ──────────────────────────────────────────

// Feed — three content rows, each prefixed with a node circle (graph DNA)
export function IconFeed({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="4.5" cy="6"  r="1.5" fill="currentColor" />
      <line x1="8" y1="6"  x2="20" y2="6"  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="4.5" cy="12" r="1.5" fill="currentColor" />
      <line x1="8" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="4.5" cy="18" r="1.5" fill="currentColor" />
      <line x1="8" y1="18" x2="19" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  )
}

// Sheets — document with a tiny fork branch emerging from content area
export function IconSheets({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      {/* doc outline */}
      <path
        d="M5 3 L15 3 Q17 3 17 5 L17 21 Q17 23 15 23 L7 23 Q5 23 5 21 Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      {/* fold corner */}
      <path d="M14 3 L14 7 L18 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* mini fork inside — trunk */}
      <line x1="11" y1="17" x2="11" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* mini fork arms */}
      <path d="M11 14 Q11 12 9 11"  stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M11 14 Q11 12 13 11" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <circle cx="11" cy="14" r="1.2" fill="currentColor" />
      <circle cx="9"  cy="11" r="1"   fill="currentColor" />
      <circle cx="13" cy="11" r="1"   fill="currentColor" />
    </Svg>
  )
}

// Tests — clipboard with a checkmark, rounded fork-style tick
export function IconTests({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      {/* clipboard board */}
      <rect x="4" y="5" width="16" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      {/* clipboard tab at top */}
      <path d="M9 5 L9 3 Q9 2 10 2 L14 2 Q15 2 15 3 L15 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* fork-style checkmark — curves like the logo arms */}
      <path d="M8 13 Q10 16 12 17 Q14 14 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

// Notes — notebook with lines + amber node accent at top right
export function IconNotes({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      {/* notebook spine lines */}
      <line x1="7" y1="2" x2="7" y2="22" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* outer rect */}
      <rect x="7" y="2" width="13" height="20" rx="2" stroke="currentColor" strokeWidth="1.8" />
      {/* binding holes */}
      <circle cx="7" cy="7"  r="1" fill="currentColor" />
      <circle cx="7" cy="12" r="1" fill="currentColor" />
      <circle cx="7" cy="17" r="1" fill="currentColor" />
      {/* ruled lines */}
      <line x1="10" y1="8"  x2="17" y2="8"  stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="10" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="10" y1="16" x2="14" y2="16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      {/* amber node — mortarboard reference */}
      <circle cx="17" cy="5.5" r="2" fill="#f59e0b" />
    </Svg>
  )
}

// Messages — speech bubble with node accent
export function IconMessages({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      {/* speech bubble */}
      <path
        d="M4 6 Q4 4 6 4 L18 4 Q20 4 20 6 L20 14 Q20 16 18 16 L8 16 L5 19 L5 16 L6 16 Q4 16 4 14 Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      {/* message lines */}
      <line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="8" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  )
}

// Announcements — megaphone / bullhorn
export function IconAnnouncements({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      {/* bell body */}
      <path
        d="M6 10 Q6 5 12 5 Q18 5 18 10 L18 15 L6 15 Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      {/* clapper */}
      <line x1="12" y1="15" x2="12" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* bell top */}
      <line x1="10" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* wave signals — like sound waves emanating */}
      <path d="M19.5 7 Q21 9 21 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M21.5 5 Q23.5 8 23.5 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </Svg>
  )
}

// Profile / Dashboard — person with mortarboard cap (student!)
export function IconProfile({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      {/* head */}
      <circle cx="12" cy="9" r="4" stroke="currentColor" strokeWidth="1.8" />
      {/* body */}
      <path d="M4 21 Q4 15 12 15 Q20 15 20 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      {/* mortarboard cap */}
      <line x1="8" y1="6.5" x2="16" y2="6.5" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="4" x2="12" y2="6.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="4" r="1.2" fill="#f59e0b" />
    </Svg>
  )
}

// ─── ACTION ICONS ─────────────────────────────────────────────────

// Upload — arrow up with fork tail (logo DNA)
export function IconUpload({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      {/* arrow shaft */}
      <line x1="12" y1="15" x2="12" y2="4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* arrow head */}
      <path d="M7.5 8.5 L12 4 L16.5 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* tray / surface */}
      <path d="M4 18 L4 20 Q4 21 5 21 L19 21 Q20 21 20 20 L20 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  )
}

// Download — arrow down into tray
export function IconDownload({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.5 10.5 L12 15 L16.5 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M4 18 L4 20 Q4 21 5 21 L19 21 Q20 21 20 20 L20 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  )
}

// Fork — the logo motif as an action icon
export function IconFork({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      {/* trunk */}
      <line x1="12" y1="19" x2="12" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* fork arms — Q curves */}
      <path d="M12 14 Q12 9 7 6"  stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M12 14 Q12 9 17 6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* nodes */}
      <circle cx="12" cy="19" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="14" r="2"   fill="currentColor" />
      <circle cx="7"  cy="6"  r="2"   fill="currentColor" />
      <circle cx="17" cy="6"  r="2"   fill="currentColor" />
    </Svg>
  )
}

// Star — outline
export function IconStar({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path
        d="M12 2.5 L14.8 9.3 L22 9.8 L16.8 14.3 L18.5 21.5 L12 17.8 L5.5 21.5 L7.2 14.3 L2 9.8 L9.2 9.3 Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
    </Svg>
  )
}

// StarFilled — for active starred state
export function IconStarFilled({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path
        d="M12 2.5 L14.8 9.3 L22 9.8 L16.8 14.3 L18.5 21.5 L12 17.8 L5.5 21.5 L7.2 14.3 L2 9.8 L9.2 9.3 Z"
        fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
      />
    </Svg>
  )
}

// Search — magnifying glass
export function IconSearch({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15.5 15.5 L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  )
}

// Bell — notifications
export function IconBell({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path
        d="M6 10 Q6 5 12 5 Q18 5 18 10 L18 15 L6 15 Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <line x1="12" y1="15" x2="12" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 18 Q9.5 20.5 12 20.5 Q14.5 20.5 14.5 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <line x1="12" y1="3" x2="12" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  )
}

// Info Circle
export function IconInfoCircle({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <line x1="12" y1="10.5" x2="12" y2="16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
    </Svg>
  )
}

// Shield
export function IconShield({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path
        d="M12 3 L19 6 V11.5 C19 16.5 16.2 20 12 21.5 C7.8 20 5 16.5 5 11.5 V6 Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M9.2 12 L11.2 14 L15.3 9.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

// Group / Community
export function IconUsers({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 19 Q5.5 14.5 9 14.5 Q12.5 14.5 13.5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M13.8 18 Q14.5 14.8 17.2 14.8 Q19.5 14.8 20.2 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </Svg>
  )
}

// Pen / Edit
export function IconPen({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path
        d="M15 3.5 Q16.5 2 18.5 4 Q20.5 6 19 7.5 L8 18.5 L3 21 L5.5 16 Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <line x1="13.5" y1="5" x2="19" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  )
}

// Link / Share
export function IconLink({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path
        d="M9.5 14.5 Q7 17 7 19 Q7 22 10 22 Q12 22 13.5 20.5 L16 18 Q18 16 17.5 14 Q17 12 15 11.5"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"
      />
      <path
        d="M14.5 9.5 Q17 7 17 5 Q17 2 14 2 Q12 2 10.5 3.5 L8 6 Q6 8 6.5 10 Q7 12 9 12.5"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"
      />
      <line x1="9" y1="15" x2="15" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  )
}

// Arrow Right - CTA direction
export function IconArrowRight({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M5 12 L19 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 7 L19 12 L14 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

// Arrow Left — back navigation
export function IconArrowLeft({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M19 12 L5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 7 L5 12 L10 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

// School - simple campus facade
export function IconSchool({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M3 10 L12 5 L21 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="6" y1="10" x2="6" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="10" y1="10" x2="10" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="14" y1="10" x2="14" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="18" y1="10" x2="18" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 19 L20 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  )
}

// Plus — add / new
export function IconPlus({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  )
}

// Spark - AI / magic / assistant
export function IconSpark({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M12 3 L13.7 8.3 L19 10 L13.7 11.7 L12 17 L10.3 11.7 L5 10 L10.3 8.3 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
      <path d="M18.5 3.5 L19.3 5.7 L21.5 6.5 L19.3 7.3 L18.5 9.5 L17.7 7.3 L15.5 6.5 L17.7 5.7 Z" fill="currentColor" />
      <path d="M5.5 15.5 L6.2 17.1 L7.8 17.8 L6.2 18.5 L5.5 20.1 L4.8 18.5 L3.2 17.8 L4.8 17.1 Z" fill="currentColor" />
    </Svg>
  )
}

// Check
export function IconCheck({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M4 12 Q8 16 10 18 Q14 12 20 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

// X / Close
export function IconX({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  )
}

// Sign Out — door with arrow
export function IconSignOut({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      {/* door frame */}
      <path d="M10 3 L5 3 Q4 3 4 4 L4 20 Q4 21 5 21 L10 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* arrow out */}
      <line x1="9" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 8 L20 12 L16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

// Chevron Down — dropdowns
export function IconChevronDown({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M6 9 L12 15 L18 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

// Filter
export function IconFilter({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <line x1="4"  y1="6"  x2="20" y2="6"  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="7"  y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="10" y1="18" x2="14" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  )
}

// Eye — preview
export function IconEye({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M2 12 Q6 5 12 5 Q18 5 22 12 Q18 19 12 19 Q6 19 2 12 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </Svg>
  )
}

// Spinner — loading (animated via CSS class)
export function IconSpinner({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path
        d="M12 3 Q19.7 3 21 12"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"
      />
      <path
        d="M12 3 Q4.3 3 3 12 Q3 19.7 12 21 Q19.7 21 21 12"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"
        opacity="0.25"
      />
    </Svg>
  )
}

export function IconSettings({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
    </Svg>
  )
}

export function IconCamera({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
    </Svg>
  )
}

// Git Pull Request — contribute changes back
export function IconGitPullRequest({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M13 6H16A2 2 0 0 1 18 8V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="9" x2="6" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconComment({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function IconClock({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
      <polyline points="12 6 12 12 16 14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

// ─── LOGO MARK ────────────────────────────────────────────────────
// Inline logo mark — exact fork tree proportions from logo-dark.svg
// scaled to a 24x24 container. Use for nav wordmark.
export function LogoMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="StudyHub">
      <circle cx="28" cy="28" r="26" fill="#0f172a" stroke="#1e3a5f" strokeWidth="1" />
      {/* trunk */}
      <line x1="28" y1="46" x2="28" y2="32" stroke="#3b82f6" strokeWidth="2.8" strokeLinecap="round" />
      {/* fork arms */}
      <path d="M28 32 Q28 24 18 17" stroke="#3b82f6" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M28 32 Q28 24 38 17" stroke="#3b82f6" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {/* sub forks */}
      <path d="M18 17 Q14 12 11 9" stroke="#60a5fa" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M18 17 Q18 12 21 9" stroke="#60a5fa" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M38 17 Q35 12 35 9" stroke="#60a5fa" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M38 17 Q41 12 45 9" stroke="#60a5fa" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* nodes */}
      <circle cx="28" cy="46" r="4"   fill="#1d4ed8" stroke="#3b82f6" strokeWidth="1.5" />
      <circle cx="28" cy="32" r="3.2" fill="#3b82f6" />
      <circle cx="18" cy="17" r="3.2" fill="#3b82f6" />
      <circle cx="38" cy="17" r="3.2" fill="#3b82f6" />
      <circle cx="11" cy="9"  r="2.2" fill="#60a5fa" />
      <circle cx="21" cy="9"  r="2.2" fill="#60a5fa" />
      <circle cx="35" cy="9"  r="2.2" fill="#60a5fa" />
      <circle cx="45" cy="9"  r="2.2" fill="#60a5fa" />
      {/* mortarboard */}
      <rect x="20" y="48.5" width="16" height="3" rx="1.5" fill="#f59e0b" />
      <rect x="26.5" y="45.5" width="3" height="4" rx="1" fill="#f59e0b" />
      <circle cx="28" cy="45" r="1.5" fill="#fbbf24" />
    </svg>
  )
}

// ─── WORDMARK ─────────────────────────────────────────────────────
// Full logo wordmark for dark backgrounds (like the nav)
export function LogoWordmark({ height = 32 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <LogoMark size={height} />
      <span style={{
        fontSize: Math.round(height * 0.56),
        fontWeight: 800,
        letterSpacing: '-0.02em',
        color: '#fff',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}>
        Study<span style={{ color: '#3b82f6' }}>Hub</span>
      </span>
    </div>
  )
}

// ─── BADGE / UTILITY ICONS ──────────────────────────────────────

// More (horizontal dots) — secondary actions menu trigger
export function IconMoreHorizontal({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </Svg>
  )
}

// Shield check — staff verified badge
export function IconShieldCheck({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 12.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

// Mail check — email verified badge
export function IconMailCheck({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
