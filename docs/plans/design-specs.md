# StudyHub Design Specifications

Per-page design specs for the v1.5.0 responsive redesign.
Direction: Clean Academic Pro - subtle, purposeful, accessible.

---

## Design Psychology Applied

### Hick's Law
Reduce the number of choices to speed up decision-making.
- Login: Only 2 options (credentials or Google)
- Registration: Only 2 options (form or Google)
- Navigation: Max 7 sidebar items

### Fitts's Law
Important targets should be large and close to the user's cursor.
- Primary CTAs use full-width buttons on mobile
- Navigation items have generous hit targets (min 44px)

### Von Restorff Effect (Isolation Effect)
Distinctive items are more memorable.
- Primary actions use gradient backgrounds
- Empty states use illustrations/icons to stand out

### Miller's Law
Chunk information into groups of 5-9 items.
- Settings: 7 tabs (within Miller's range)
- Dashboard stats: 3 cards
- Navigation: 6-7 items max

### Gestalt Principles
- **Proximity**: Related items grouped with consistent spacing
- **Similarity**: Same style for same function across pages
- **Continuity**: Eye follows grid lines and alignment
- **Closure**: Cards and sections complete visual forms

### F-Pattern / Z-Pattern
- Feed page: F-pattern (scan left sidebar, read content)
- Homepage: Z-pattern (logo -> CTA -> features -> footer CTA)

---

## Responsive Breakpoints

| Name | Width | Columns | Sidebar |
|------|-------|---------|---------|
| Mobile | < 640px | 1 | Hidden (hamburger) |
| Tablet | 640-1024px | 1-2 | Drawer overlay |
| Desktop | 1024-1440px | 2-3 | Fixed sidebar |
| Wide | > 1440px | 3 | Fixed sidebar + right panel |

---

## Page Specs

### 1. Login Page (DONE - Cycle 8)
- Glass-morphism card on dark gradient
- Google button prominent
- Username + Password + Google
- No email verification gate

### 2. Register Page (DONE - Cycle 8, updating)
- Glass-morphism card on dark gradient
- Google button prominent
- Steps: Account -> Courses (no verify step)
- Username + Email + Password + Google

### 3. Feed Page (REDESIGNING)
- **Desktop**: 3-column (sidebar 240px | feed flex | right panels 280px)
- **Tablet**: 2-column (feed + collapsible right panels)
- **Mobile**: 1-column (full-width feed, panels below)
- Composer: full-width, attach file opens native picker
- Cards: max-width 720px, centered in column
- Right panels: Top Starred, Most Downloaded, Top Contributors

### 4. Sheets Page (REDESIGNING)
- **Desktop**: 3-column with filter bar spanning full width
- **Tablet**: Filters collapse to dropdown, 2-column grid
- **Mobile**: 1-column, filters in expandable drawer
- Sheet cards: thumbnail, title, course badge, stats

### 5. Dashboard Page (REDESIGNING)
- **Desktop**: Hero banner + 3 stat cards + 2-column content
- **Tablet**: 2 stat cards per row + stacked content
- **Mobile**: 1 stat card per row + stacked content
- Recent Sheets: card grid with hover preview
- Course Focus: vertical list with progress indicators

### 6. Notes Page (REDESIGNING)
- **Desktop**: 2-column (notes list 300px | editor flex)
- **Tablet**: Notes list collapsible, editor full-width
- **Mobile**: Notes list full-width, editor opens as full-screen overlay
- Editor: Split markdown + preview, stacking on mobile

### 7. Announcements Page (REDESIGNING)
- **Desktop**: Full-width announcement cards with sidebar
- **Tablet/Mobile**: Full-width cards, stacked
- Admin form: expandable panel at top
- Pinned: yellow highlight with pin icon

### 8. Practice Tests Page (REDESIGNING)
- **Desktop**: Test cards in 2-column grid with sidebar
- **Mobile**: 1-column cards
- Tab bar: All Tests | My Attempts | Leaderboard
- AI badge: "Version 2" indicator on each card

### 9. Profile Page (REDESIGNING)
- **Desktop**: Profile header + 2-column (sheets | courses)
- **Tablet**: 2-column with tighter spacing
- **Mobile**: Stacked single column, stats wrap
- Avatar: responsive sizing (clamp 56px-80px)
- Stats: followers, sheets, courses with flex-wrap

### 10. Settings Page (REDESIGNING)
- **Desktop**: Tab navigation + content area
- **Tablet**: Tabs scroll horizontally
- **Mobile**: Tabs as dropdown or vertical list
- Each tab: SectionCard groups with consistent FormField layout

---

## Animation Spec

| Trigger | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Page mount | fadeInUp | 300ms | easeOutQuad |
| Card list load | staggerEntrance | 50ms delay | easeOutQuad |
| Button hover | popScale(1.03) | 200ms | easeInOutQuad |
| Stat numbers | countUp | 800ms | easeOutExpo |
| Scroll into view | fadeInOnScroll | 400ms | easeOutQuad |
| Modal open | scale(0.95->1) + fadeIn | 250ms | easeOutBack |
| Toast appear | slideDown | 300ms | easeOutQuad |
| Reduced motion | All disabled | - | - |

---

## Tutorial Popup Spec (react-joyride)

Each page gets a tutorial with 3-5 steps max.
Triggered: First visit OR click tutorial button.
Storage: localStorage key per page (e.g., `tutorial_feed_seen`).

### Feed Tutorial Steps
1. Composer: "Share updates, questions, or link to sheets here"
2. Filter tabs: "Filter by posts, sheets, or announcements"
3. Course filter: "Focus on a specific course"
4. Leaderboard panels: "See top contributors and popular sheets"

### Sheets Tutorial Steps
1. Search bar: "Search sheets by title or description"
2. Filters: "Filter by school, course, or sort order"
3. Upload button: "Share your own study sheets"
4. Mine/Starred tabs: "Find your sheets or saved favorites"

### Dashboard Tutorial Steps
1. Stats cards: "Your activity at a glance"
2. Recent sheets: "Quick access to latest sheets in your courses"
3. Course focus: "Your enrolled courses and progress"
4. Quick actions: "Common tasks in one click"
