# StudyHub Design Spec — Direction A: "Campus Lab"

> Clean, editorial, study-first. Warm paper surfaces + crisp ink typography + subtle grid.
> Feels like: Notion + GitHub + textbook margin notes.

---

## 1. Typography System

### Font Pairing

| Role | Family | Why |
|------|--------|-----|
| **Primary (UI + body)** | Plus Jakarta Sans (keep) | Already loaded, strong geometric humanist. Clean for UI. |
| **Content / reading** | Inter | Best-in-class screen legibility. Free. Use for sheet content, long-form, markdown preview. Pairs naturally with Jakarta. |

Load Inter alongside Jakarta:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
```

### Type Scale (fluid, clamp-based)

| Token | Use | Value |
|-------|-----|-------|
| `--type-xs` | Badges, timestamps, metadata | `clamp(0.72rem, 0.7rem + 0.12vw, 0.8rem)` |
| `--type-sm` | Captions, helper text, table cells | `clamp(0.82rem, 0.78rem + 0.18vw, 0.92rem)` |
| `--type-base` | Body text, form labels, nav items | `clamp(0.94rem, 0.9rem + 0.2vw, 1.06rem)` |
| `--type-md` | Card titles, section labels | `clamp(1.06rem, 1rem + 0.3vw, 1.22rem)` |
| `--type-lg` | Page subtitles, modal headers | `clamp(1.25rem, 1.12rem + 0.6vw, 1.55rem)` |
| `--type-xl` | Page titles | `clamp(1.6rem, 1.3rem + 1.2vw, 2.2rem)` |
| `--type-hero` | Landing hero headline | `clamp(2.4rem, 1.7rem + 3vw, 4.5rem)` |

### Weight Rules

| Context | Weight | Token |
|---------|--------|-------|
| Body text | 400 | `--weight-normal` |
| Labels, nav items, metadata emphasis | 500 | `--weight-medium` |
| Card titles, section headings | 600 | `--weight-semibold` |
| Page titles, hero text | 700 | `--weight-bold` |
| Hero display (landing only) | 800 | `--weight-extrabold` |

### Line Height

| Context | Value |
|---------|-------|
| Headings (`--type-lg` and up) | 1.2 |
| Body / UI text | 1.55 |
| Compact UI (badges, pills, buttons) | 1.1 |

### Letter Spacing

| Context | Value |
|---------|-------|
| Hero text | `-0.02em` |
| Page titles | `-0.01em` |
| All-caps labels (if any) | `0.05em` |
| Body text | `0` (default) |

---

## 2. Color Palette

### Design Principle
One confident accent (StudyHub Blue) used intentionally, not everywhere.
Warm neutral surfaces that feel like quality paper, not sterile dashboard gray.

### Light Theme Palette

| Token | Hex | Role |
|-------|-----|------|
| **Surfaces** | | |
| `--sh-bg` | `#f6f5f2` | Page background — warm paper, not cold slate |
| `--sh-surface` | `#ffffff` | Card/panel surface |
| `--sh-soft` | `#faf9f7` | Subtle alternate surface (hover states, nested panels) |
| `--sh-page-bg` | `#f0eeeb` | Full-page wrapper background |
| **Text** | | |
| `--sh-text` | `#1a1a1a` | Primary text — true ink black, not navy |
| `--sh-heading` | `#111111` | Heading text — slightly darker |
| `--sh-subtext` | `#5a5a5a` | Secondary text — readable gray |
| `--sh-muted` | `#8a8a8a` | Tertiary text — timestamps, metadata |
| **Brand** | | |
| `--sh-brand` | `#2563eb` | Primary brand blue — slightly deeper than current |
| `--sh-brand-hover` | `#1d4ed8` | Brand hover state |
| `--sh-brand-soft` | `#dbeafe` | Brand tint for badges, pills, highlights |
| `--sh-brand-dark` | `#1e293b` | Dark brand surface (nav, footers) |
| **Borders** | | |
| `--sh-border` | `#e5e2dd` | Default border — warm, not cold blue-gray |
| `--sh-border-strong` | `#d0cdc7` | Emphasized border (active cards, focused inputs) |
| **Accents** | | |
| `--sh-link` | `#2563eb` | Links — same as brand |
| `--sh-success` | `#16a34a` | Success green |
| `--sh-danger` | `#dc2626` | Error/danger red |
| `--sh-warning` | `#d97706` | Warning amber |

### Dark Theme Palette

| Token | Hex | Role |
|-------|-----|------|
| `--sh-bg` | `#121212` | True dark background — OLED-friendly, not navy |
| `--sh-surface` | `#1c1c1c` | Card surface |
| `--sh-soft` | `#242424` | Alternate surface |
| `--sh-page-bg` | `#0e0e0e` | Page wrapper |
| `--sh-text` | `#e8e8e8` | Primary text |
| `--sh-heading` | `#f5f5f5` | Heading text |
| `--sh-subtext` | `#a0a0a0` | Secondary text |
| `--sh-muted` | `#6b6b6b` | Tertiary text |
| `--sh-brand` | `#60a5fa` | Brand blue — lifted for contrast on dark |
| `--sh-brand-hover` | `#93bbfd` | Brand hover |
| `--sh-brand-soft` | `#1e3a5f` | Brand tint |
| `--sh-brand-dark` | `#e0e0e0` | Inverted brand surface text |
| `--sh-border` | `#2a2a2a` | Border — subtle |
| `--sh-border-strong` | `#3a3a3a` | Emphasized border |
| `--sh-link` | `#60a5fa` | Links |
| `--sh-success` | `#4ade80` | Success |
| `--sh-danger` | `#f87171` | Danger |
| `--sh-warning` | `#fbbf24` | Warning |

### Semantic Alert Tokens (both themes defined in `:root` / `[data-theme='dark']`)

| Category | Light bg | Light border | Light text | Dark bg | Dark border | Dark text |
|----------|----------|--------------|------------|---------|-------------|-----------|
| Danger | `#fef2f2` | `#fecaca` | `#b91c1c` | `#2a1515` | `#7f1d1d` | `#fca5a5` |
| Success | `#f0fdf4` | `#bbf7d0` | `#166534` | `#0f2a1a` | `#064e3b` | `#6ee7b7` |
| Warning | `#fffbeb` | `#fde68a` | `#92400e` | `#2a2010` | `#78350f` | `#fde68a` |
| Info | `#eff6ff` | `#bfdbfe` | `#1e40af` | `#0f1a2e` | `#1e3a8a` | `#93bbfd` |

---

## 3. Spacing System

### Base Unit: 4px

| Token | Value | Use |
|-------|-------|-----|
| `--space-0` | `0` | Reset |
| `--space-1` | `0.25rem` (4px) | Tight padding inside badges/pills |
| `--space-2` | `0.5rem` (8px) | Icon gaps, inline spacing |
| `--space-3` | `0.75rem` (12px) | Form field gap, compact card padding |
| `--space-4` | `1rem` (16px) | Standard card padding, section gap |
| `--space-5` | `1.25rem` (20px) | Card padding (mobile) |
| `--space-6` | `1.5rem` (24px) | Card padding (desktop), section header gap |
| `--space-8` | `2rem` (32px) | Section spacing |
| `--space-10` | `2.5rem` (40px) | Page section gap |
| `--space-12` | `3rem` (48px) | Major page section gap |
| `--space-16` | `4rem` (64px) | Hero spacing, footer gap |

### Layout Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--page-max-w` | `1200px` | Max content width (most pages) |
| `--page-narrow-w` | `720px` | Narrow content (auth pages, sheet viewer) |
| `--page-gutter` | `clamp(1rem, 2vw, 2rem)` | Horizontal page padding |
| `--card-pad` | `clamp(1rem, 0.8rem + 0.8vw, 1.5rem)` | Card inner padding (keep current) |
| `--card-gap` | `clamp(0.75rem, 0.5rem + 0.5vw, 1rem)` | Gap between cards in grid |

---

## 4. Elevation & Surface Rules

### Elevation Scale

| Level | Shadow | Use |
|-------|--------|-----|
| `--elevation-0` | none | Flat surfaces, inline elements |
| `--elevation-1` | `0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)` | Cards at rest |
| `--elevation-2` | `0 2px 8px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)` | Cards on hover, dropdowns |
| `--elevation-3` | `0 8px 32px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)` | Modals, popovers |

Dark mode shadows use `rgba(0,0,0,0.3/0.4/0.5)` — heavier since dark surfaces need more separation.

### Border Radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | `6px` | Badges, pills, small buttons |
| `--radius` | `10px` | Inputs, standard buttons |
| `--radius-card` | `14px` | Cards, panels |
| `--radius-lg` | `20px` | Modals, page-level containers |
| `--radius-full` | `9999px` | Avatars, circular buttons |

### Surface Rules

1. **No more than 3 surface levels visible at once** — bg → surface → soft. Avoid nesting cards inside cards.
2. **Cards always have a 1px border** (`--sh-border`) plus `--elevation-1`. On hover: `--elevation-2` + `--sh-border-strong`.
3. **Dark mode**: surfaces are separated by border, not shadow alone. Shadows supplement, borders lead.

---

## 5. Component Primitives

### Button

| Variant | Background | Text | Border | Shadow |
|---------|------------|------|--------|--------|
| Primary | `--sh-brand` (solid, no gradient) | `#ffffff` | none | `0 2px 8px rgba(37,99,235,0.25)` |
| Secondary | `--sh-surface` | `--sh-text` | `1px solid --sh-border` | `--elevation-1` |
| Ghost | transparent | `--sh-subtext` | none | none |
| Danger | `--sh-danger` | `#ffffff` | none | `0 2px 8px rgba(220,38,38,0.2)` |

**Sizing:**
| Size | Height | Padding (h) | Font size | Radius |
|------|--------|-------------|-----------|--------|
| sm | 32px | 12px | `--type-sm` | `--radius-sm` |
| md | 40px | 16px | `--type-base` | `--radius` |
| lg | 48px | 20px | `--type-base` | `--radius` |

**Rules:**
- **No gradients on buttons.** Solid colors only. Gradients look dated.
- All buttons get `transition: all 0.15s ease`.
- Hover: lighten primary by 8%, darken secondary border.
- Active: scale(0.98) + darken by 4%.

### Input

| State | Background | Border | Shadow |
|-------|------------|--------|--------|
| Default | `--sh-surface` | `--sh-border` | none |
| Hover | `--sh-surface` | `--sh-border-strong` | none |
| Focus | `--sh-surface` | `--sh-brand` | `0 0 0 3px var(--sh-brand-soft)` |
| Error | `--sh-surface` | `--sh-danger` | `0 0 0 3px rgba(220,38,38,0.1)` |

Height: `--control-h-md` (40px). Padding: 12px horizontal.

### Card

```
background: var(--sh-surface);
border: 1px solid var(--sh-border);
border-radius: var(--radius-card);
padding: var(--card-pad);
box-shadow: var(--elevation-1);
transition: box-shadow 0.2s ease, border-color 0.2s ease;
```

Hover (interactive cards):
```
border-color: var(--sh-border-strong);
box-shadow: var(--elevation-2);
```

### Toast / Notification Banner

- Position: bottom-right (desktop), bottom-center (mobile).
- Background: `--sh-surface`, border-left 3px with status color.
- Auto-dismiss: 4s default. No "session expired" on initial 401.

### Badge / Pill

```
background: var(--sh-brand-soft);
color: var(--sh-brand);
font-size: var(--type-xs);
font-weight: 600;
padding: 2px 8px;
border-radius: var(--radius-full);
```

### Tab

Active: `color: var(--sh-brand); border-bottom: 2px solid var(--sh-brand);`
Inactive: `color: var(--sh-muted);`
No background color on tabs — underline-only treatment.

---

## 6. Navigation Rules

### Desktop Nav (top bar)
- Background: `--sh-brand-dark` (#1e293b) — dark chrome, same in both themes.
- Height: 56px.
- Logo + nav links left, search center, avatar + notifications right.
- Search bar: 320px wide, `--sh-nav-search-bg` background.

### Mobile Nav
- Hamburger menu → slide-in drawer from left.
- Full-height overlay with `--sh-surface` background.
- Nav items stack vertically, 48px touch targets.
- Close button top-right.

### Sidebar (if applicable)
- Width: 240px collapsed to icon-only on tablet.
- Background: `--sh-surface`.
- Active item: `--sh-brand-soft` background + `--sh-brand` text.

---

## 7. Page Templates

### Auth Pages (Login, Register, Forgot Password)

```
Layout: centered card (max-width: 440px) on warm paper background.
Card: --sh-surface, --elevation-2, --radius-lg, generous padding (--space-8).
Heading: --type-xl, --weight-bold, centered.
Inputs: full-width, stacked with --space-3 gap.
CTA button: full-width, primary, lg size.
Below-card links: --type-sm, --sh-muted, centered.
```

No heavy hero graphics or gradients on auth pages. Let the form breathe.

### Feed Page

```
Layout: single column, max-width: 720px, centered.
Cards: --sh-surface, standard card style, --space-3 vertical gap.
Each card: author avatar (32px circle) + name + timestamp top row,
           title (--type-md, --weight-semibold),
           description preview (--type-base, --sh-subtext, 2-line clamp),
           footer: course badge + star count + comment count.
```

### Sheets List

```
Layout: filters sidebar left (240px) + card grid right.
Mobile: filters collapse to horizontal scroll chips + single column.
Cards: title + course badge + author + star count + date.
Grid: 2 columns desktop, 1 column mobile.
```

### Sheet Viewer

```
Layout: narrow (720px max), centered.
Title: --type-xl, --weight-bold.
Meta row: author link + course badge + date + star button.
Content: rendered markdown, Inter font, generous line-height (1.7).
Comments: below content, separated by --sh-border, standard card treatment.
```

### Dashboard

```
Layout: --page-max-w, standard gutter.
Hero: welcome message with user's name, no gradient background.
Stats: 3-4 stat cards in a row (grid), --elevation-1.
Quick links: recent sheets, enrolled courses, as card lists.
```

---

## 8. Sprint Execution Plan

### Sprint 1 (days 1-5): Design System + 3 Flagship Pages

| Day | Deliverable |
|-----|-------------|
| 1 | New tokens in `index.css` (typography, colors, spacing, elevation). Remove all hardcoded colors from CSS overrides — replace with token references. |
| 2 | Rebuild Button, Input, Card, Badge, Toast primitives using new tokens. |
| 3 | Redesign auth pages (Login, Register, Forgot Password). |
| 4 | Redesign Feed page. |
| 5 | Redesign Landing page. Run `visual:review`, compare before/after. |

### Sprint 2 (days 6-10): Rollout Across All Pages

| Day | Deliverable |
|-----|-------------|
| 6 | Sheets list + Sheet viewer. |
| 7 | Dashboard + Notes. |
| 8 | Upload flow + Announcements. |
| 9 | Settings + Admin + About + Terms + 404. |
| 10 | Dark mode polish pass. Run full `visual:review`. Final adjustments. |

---

## 9. Definition of Done (Per Page)

A page is "done" when all of the following are true in the screenshot gallery:

- [ ] **Light desktop**: correct typography scale, no hardcoded colors, proper spacing, consistent card treatment.
- [ ] **Light mobile**: responsive layout, touch-friendly targets (44px+), no horizontal overflow, readable text.
- [ ] **Dark desktop**: all surfaces use dark tokens, text is readable (WCAG AA contrast), no "flash of light" elements.
- [ ] **Dark mobile**: same as dark desktop + responsive.
- [ ] **No visual regressions**: existing elements that look correct still look correct.
- [ ] **No stray toasts/popups**: tutorial overlays suppressed, session expired suppressed.
- [ ] **Consistent with other completed pages**: same nav, same card style, same button style.

---

## 10. Migration Strategy: Inline Styles → Tokens

The biggest technical debt: ~44+ files with hardcoded hex colors in JSX `style={}` props. These fight the dark mode tokens and make redesign painful.

**Phase 1 (Sprint 1):** For the 3 flagship pages, replace all `style={{ color: '#0f172a' }}` with `style={{ color: 'var(--sh-text)' }}` (or equivalent). This is a mechanical find-and-replace per file.

**Phase 2 (Sprint 2):** Extend to remaining pages. Each page refactor follows the same pattern:
1. `grep` the file for hardcoded hex values.
2. Map each hex to its semantic token.
3. Replace.
4. Remove corresponding `[data-theme='dark']` override from `index.css` (since the token now handles both themes).

**End state:** The `[data-theme='dark']` section in `index.css` should shrink to just the token definitions — no more `!important` overrides on inline styles.

---

## Appendix: Hex → Token Migration Map

| Hardcoded Hex | Replace With Token |
|---------------|-------------------|
| `#0f172a` (text) | `var(--sh-text)` or `var(--sh-heading)` |
| `#1e293b` (text/heading) | `var(--sh-heading)` |
| `#475569` (subtext) | `var(--sh-subtext)` |
| `#64748b` (muted) | `var(--sh-muted)` |
| `#94a3b8` (muted light) | `var(--sh-muted)` |
| `#ffffff` (surface) | `var(--sh-surface)` |
| `#f8fafc` (soft bg) | `var(--sh-soft)` |
| `#f1f5f9` (bg) | `var(--sh-bg)` |
| `#edf0f5` (page bg) | `var(--sh-page-bg)` |
| `#e2e8f0` (border) | `var(--sh-border)` |
| `#3b82f6` (brand blue) | `var(--sh-brand)` |
| `#1d4ed8` (brand dark) | `var(--sh-brand-hover)` |
| `#ef4444` / `#dc2626` (red) | `var(--sh-danger)` |
| `#10b981` (green) | `var(--sh-success)` |
| `#f59e0b` (yellow) | `var(--sh-warning)` |
