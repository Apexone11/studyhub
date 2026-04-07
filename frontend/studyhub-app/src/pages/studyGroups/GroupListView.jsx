/* ═══════════════════════════════════════════════════════════════════════════
 * GroupListView.jsx — List/browse view for study groups
 *
 * Responsible for displaying the list of study groups with search, filters,
 * and group creation. Manages search params and filtering state.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useSession } from '../../lib/session-context'
import { PAGE_FONT } from '../shared/pageUtils'
import { useStudyGroupsData } from './useStudyGroupsData'
import { useResponsiveAppLayout, pageShell } from '../../lib/ui'
import { useTutorial } from '../../lib/useTutorial'
import { STUDY_GROUPS_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import { usePageTitle } from '../../lib/usePageTitle'
import { SkeletonCard } from '../../components/Skeleton'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import SafeJoyride from '../../components/SafeJoyride'
import GroupListFilters from './GroupListFilters'
import GroupCard from './GroupCard'
import GroupListEmptyState from './GroupListEmptyState'
import CreateGroupModal from './GroupModals'
import autoAnimate from '@formkit/auto-animate'
import { styles } from './studyGroupsStyles'

function GroupListSkeleton() {
  return (
    <div style={styles.grid}>
      {[1, 2, 3, 4].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export default function GroupListView() {
  usePageTitle('Study Groups')
  const layout = useResponsiveAppLayout()
  const tutorial = useTutorial('studyGroups', STUDY_GROUPS_STEPS, { version: TUTORIAL_VERSIONS.studyGroups })
  const { isAuthenticated } = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // Extract URL params
  const search = searchParams.get('search') || ''
  const schoolId = searchParams.get('schoolId') || ''
  const courseId = searchParams.get('courseId') || ''
  const mineOnly = searchParams.get('mine') === 'true'

  // Load data with current filters
  const {
    groups, groupsLoading, groupsError, groupsTotal,
    createGroup, joinGroup, loadGroups,
    schools: allSchools,
    courses: allCourses,
  } = useStudyGroupsData()

  const hasActiveFilters = search || schoolId || courseId || mineOnly

  // Update search param
  const handleSearch = useCallback((value) => {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set('search', value)
    } else {
      next.delete('search')
    }
    next.set('offset', '0') // Reset pagination
    setSearchParams(next)
  }, [searchParams, setSearchParams])

  const handleSchoolFilter = useCallback((nextSchoolId) => {
    const next = new URLSearchParams(searchParams)
    if (nextSchoolId) {
      next.set('schoolId', nextSchoolId)
    } else {
      next.delete('schoolId')
    }

    if (!nextSchoolId) {
      next.delete('courseId')
    } else {
      const courseBelongsToSchool = allCourses?.some((course) => (
        String(course.id) === String(courseId) && String(course.schoolId) === String(nextSchoolId)
      ))

      if (!courseBelongsToSchool) {
        next.delete('courseId')
      }
    }

    next.set('offset', '0')
    setSearchParams(next)
  }, [allCourses, courseId, searchParams, setSearchParams])

  // Toggle "My Groups" filter
  const toggleMine = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    if (mineOnly) {
      next.delete('mine')
    } else {
      next.set('mine', 'true')
    }
    next.set('offset', '0')
    setSearchParams(next)
  }, [mineOnly, searchParams, setSearchParams])

  // Filter by course
  const handleCourseFilter = useCallback((cId) => {
    const next = new URLSearchParams(searchParams)
    if (cId) {
      next.set('courseId', cId)
    } else {
      next.delete('courseId')
    }
    next.set('offset', '0')
    setSearchParams(next)
  }, [searchParams, setSearchParams])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchParams({})
  }, [setSearchParams])

  // Handle group creation
  const handleCreateGroup = useCallback(async (groupData) => {
    try {
      const newGroup = await createGroup(groupData)
      setCreateModalOpen(false)
      // Navigate to new group detail
      navigate(`/study-groups/${newGroup.id}`)
    } catch {
      // Error already shown via toast in hook
    }
  }, [createGroup, navigate])

  // Handle join group
  const handleJoinGroup = useCallback((groupId) => {
    joinGroup(groupId)
  }, [joinGroup])

  const selectedSchool = allSchools?.find((school) => String(school.id) === String(schoolId))
  const selectedCourse = allCourses?.find(c => c.id === parseInt(courseId, 10))
  const subtitle = mineOnly ? 'Groups you are a member of' : 'All study groups'

  // Auto-animate the groups grid for smooth enter/exit transitions
  const gridRef = useRef(null)
  useEffect(() => {
    if (gridRef.current) autoAnimate(gridRef.current, { duration: 250 })
  }, [])


  return (
    <>
      <Navbar />
      <div style={styles.page}>
        <div style={pageShell('app', 26, 48)}>
          <div style={styles.appGrid}>
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" style={styles.main}>
              {/* Title section with create button */}
              <section data-tutorial="groups-list" style={styles.titleCard}>
                <div style={styles.titleRow}>
                  <div>
                    <h1 style={styles.title}>Study Groups</h1>
                    <p style={styles.subtitle}>{subtitle}</p>
                  </div>
                  {isAuthenticated && (
                    <button
                      data-tutorial="groups-create"
                      onClick={() => setCreateModalOpen(true)}
                      style={styles.createBtn}
                    >
                      Create Group
                    </button>
                  )}
                </div>
              </section>

              {/* Search and filter bar */}
              <GroupListFilters
                search={search}
                  schoolId={schoolId}
                courseId={courseId}
                mineOnly={mineOnly}
                  allSchools={allSchools}
                allCourses={allCourses}
                onSearch={handleSearch}
                onToggleMine={toggleMine}
                  onSchoolFilter={handleSchoolFilter}
                onCourseFilter={handleCourseFilter}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={clearAllFilters}
              />

              {/* Error state */}
              {groupsError && (
                <div style={styles.alert('danger')}>
                  <span>{groupsError}</span>
                  <button
                    onClick={loadGroups}
                    style={{
                      background: 'var(--sh-danger)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      fontFamily: PAGE_FONT,
                      marginLeft: 12,
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Loading state */}
              {groupsLoading ? (
                <GroupListSkeleton />
              ) : groups.length === 0 ? (
                /* Empty state */
                <GroupListEmptyState
                  search={search}
                  mineOnly={mineOnly}
                  selectedCourse={selectedCourse ? {
                    ...selectedCourse,
                    name: selectedSchool ? `${selectedSchool.short} — ${selectedCourse.name}` : selectedCourse.name,
                  } : null}
                  onClearFilters={clearAllFilters}
                />
              ) : (
                /* Groups grid */
                <section data-tutorial="groups-resources" style={styles.gridSection}>
                  <div style={styles.gridHeader}>
                    <span style={styles.gridCount}>
                      {groupsTotal} group{groupsTotal === 1 ? '' : 's'}
                    </span>
                    {hasActiveFilters && (
                      <button
                        onClick={clearAllFilters}
                        style={styles.clearBtn}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                  <div ref={gridRef} style={styles.grid}>
                    {groups.map((group) => (
                      <GroupCard
                        key={group.id}
                        group={group}
                        onJoin={() => handleJoinGroup(group.id)}
                        onNavigateDetail={() => navigate(`/study-groups/${group.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </main>
          </div>
        </div>
      </div>

      {/* Create Group Modal */}
      {createModalOpen && createPortal(
        <CreateGroupModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={handleCreateGroup}
          courses={allCourses}
        />,
        document.body
      )}

      <SafeJoyride {...tutorial.joyrideProps} />
    </>
  )
}
