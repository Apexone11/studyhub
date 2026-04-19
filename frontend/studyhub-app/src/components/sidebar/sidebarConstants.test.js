import { describe, it, expect } from 'vitest'
import { visibleSidebarSections, SIDEBAR_SECTIONS } from './sidebarConstants'

/**
 * Phase 1 of the v2 design refresh — sectioned sidebar visibility rules.
 * See docs/internal/design-refresh-v2-master-plan.md (Phase 1) and
 * docs/internal/design-refresh-v2-roles-integration.md.
 */

const studentUser = { id: 1, accountType: 'student', role: 'student' }
const teacherUser = { id: 2, accountType: 'teacher', role: 'student' }
const selfLearner = { id: 3, accountType: 'other', role: 'student' }
const adminUser = { id: 4, accountType: 'other', role: 'admin' }

function findSection(sections, key) {
  return sections.find((s) => s.key === key)
}

function linkLabels(sections, key) {
  return findSection(sections, key)?.links.map((l) => l.label) ?? []
}

describe('SIDEBAR_SECTIONS', () => {
  it('exposes MAIN / PERSONAL / ACCOUNT in order', () => {
    expect(SIDEBAR_SECTIONS.map((s) => s.key)).toEqual(['main', 'personal', 'account'])
  })

  it('MAIN includes the core discovery links', () => {
    const labels = SIDEBAR_SECTIONS.find((s) => s.key === 'main').links.map((l) => l.label)
    expect(labels).toContain('Feed')
    expect(labels).toContain('Study Sheets')
    expect(labels).toContain('Hub AI')
    expect(labels).toContain('Messages')
  })

  it('PERSONAL includes My Notes and Invite Classmates', () => {
    const labels = SIDEBAR_SECTIONS.find((s) => s.key === 'personal').links.map((l) => l.label)
    expect(labels).toContain('My Notes')
    expect(labels).toContain('Invite Classmates')
  })

  it('ACCOUNT includes Pricing, Supporters, Settings', () => {
    const labels = SIDEBAR_SECTIONS.find((s) => s.key === 'account').links.map((l) => l.label)
    expect(labels).toEqual(['Pricing', 'Supporters', 'Settings'])
  })
})

describe('visibleSidebarSections', () => {
  it('returns [] for a null/undefined user (not logged in)', () => {
    expect(visibleSidebarSections(null)).toEqual([])
    expect(visibleSidebarSections(undefined)).toEqual([])
  })

  it('students see My Courses in PERSONAL', () => {
    const sections = visibleSidebarSections(studentUser)
    expect(linkLabels(sections, 'personal')).toContain('My Courses')
  })

  it('teachers see both My Courses and the Teach stub', () => {
    const sections = visibleSidebarSections(teacherUser)
    const labels = linkLabels(sections, 'personal')
    expect(labels).toContain('My Courses')
    expect(labels).toContain('Teach')
  })

  it('Self-learners do NOT see My Courses or the Teach stub', () => {
    const sections = visibleSidebarSections(selfLearner)
    const labels = linkLabels(sections, 'personal')
    expect(labels).not.toContain('My Courses')
    expect(labels).not.toContain('Teach')
  })

  it('students do NOT see the teacher-only Teach stub', () => {
    const sections = visibleSidebarSections(studentUser)
    expect(linkLabels(sections, 'personal')).not.toContain('Teach')
  })

  it('MAIN and ACCOUNT are identical across accountTypes', () => {
    const s = visibleSidebarSections(studentUser)
    const t = visibleSidebarSections(teacherUser)
    const o = visibleSidebarSections(selfLearner)
    expect(linkLabels(s, 'main')).toEqual(linkLabels(t, 'main'))
    expect(linkLabels(s, 'main')).toEqual(linkLabels(o, 'main'))
    expect(linkLabels(s, 'account')).toEqual(linkLabels(t, 'account'))
    expect(linkLabels(s, 'account')).toEqual(linkLabels(o, 'account'))
  })

  it('drops empty sections from the output', () => {
    const sections = visibleSidebarSections(selfLearner)
    for (const section of sections) {
      expect(section.links.length).toBeGreaterThan(0)
    }
  })

  it('preserves link order within a section', () => {
    const sections = visibleSidebarSections(studentUser)
    const main = findSection(sections, 'main')
    const originalMain = SIDEBAR_SECTIONS.find((s) => s.key === 'main')
    expect(main.links.map((l) => l.label)).toEqual(originalMain.links.map((l) => l.label))
  })

  it('defaults missing accountType to student (treats as a student)', () => {
    const userWithoutAccountType = { id: 5, role: 'student' }
    const sections = visibleSidebarSections(userWithoutAccountType)
    expect(linkLabels(sections, 'personal')).toContain('My Courses')
    expect(linkLabels(sections, 'personal')).not.toContain('Teach')
  })

  it('admins without a teacher accountType still do not see the Teach stub', () => {
    const sections = visibleSidebarSections(adminUser)
    expect(linkLabels(sections, 'personal')).not.toContain('Teach')
  })
})
