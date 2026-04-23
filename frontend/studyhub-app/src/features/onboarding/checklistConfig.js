/**
 * checklistConfig.js — Role-aware Getting Started checklist.
 *
 * Replaces the one-size-fits-all checklist on the feed with three variants
 * (student / teacher / self-learner). Each item is a pure record with:
 *   - key: stable identifier for telemetry + completion tracking
 *   - label: short human copy shown in the UI
 *   - testFn(state): returns true when complete, given the onboarding state
 *     object returned by GET /api/users/me/onboarding-state
 *   - ctaTo: route the user is sent to when they tap the item
 *   - helpLink: link into /docs for the relevant feature (optional)
 *
 * Ship order: state endpoint + UI component land in Week 2, animation +
 * completion celebration in Week 3.
 *
 * See docs/internal/design-refresh-v2-week2-brainstorm.md §7 and
 *     docs/internal/design-refresh-v2-week2-to-week5-execution.md.
 */

const STUDENT_CHECKLIST = [
  {
    key: 'set_school_major',
    label: 'Add your school and major',
    testFn: (s) => Boolean(s?.hasSchool && s?.hasMajor),
    ctaTo: '/settings',
    helpLink: '/docs/courses',
  },
  {
    key: 'follow_3_courses',
    label: 'Follow 3 courses you are taking this term',
    testFn: (s) => (s?.courseFollowCount ?? 0) >= 3,
    ctaTo: '/my-courses',
    helpLink: '/docs/courses',
  },
  {
    key: 'star_a_sheet',
    label: 'Star a sheet that looks useful',
    testFn: (s) => (s?.starCount ?? 0) >= 1,
    ctaTo: '/sheets',
    helpLink: '/docs/sheets',
  },
  {
    key: 'add_exam',
    label: 'Add your first exam date',
    testFn: (s) => (s?.examCount ?? 0) >= 1,
    ctaTo: '/tests',
    helpLink: '/docs/tests',
  },
  {
    key: 'join_study_group',
    label: 'Join a study group',
    testFn: (s) => (s?.groupMembershipCount ?? 0) >= 1,
    ctaTo: '/study-groups',
    helpLink: '/docs/study-groups',
  },
]

const TEACHER_CHECKLIST = [
  {
    key: 'verify_teaching',
    label: 'Verify your teaching status',
    testFn: (s) => Boolean(s?.teacherVerified),
    ctaTo: '/settings',
  },
  {
    key: 'publish_first_material',
    label: 'Publish your first material',
    testFn: (s) => (s?.publishedMaterialCount ?? 0) >= 1,
    ctaTo: '/teach/materials',
    helpLink: '/docs/sheets',
  },
  {
    key: 'create_section',
    label: 'Create a section and invite your class',
    testFn: (s) => (s?.sectionCount ?? 0) >= 1,
    ctaTo: '/teach/materials',
  },
  {
    key: 'schedule_session',
    label: 'Schedule your first check-in session',
    testFn: (s) => (s?.scheduledSessionCount ?? 0) >= 1,
    ctaTo: '/study-groups',
    helpLink: '/docs/study-groups',
  },
  {
    key: 'drop_problem',
    label: 'Drop one practice problem for your students',
    testFn: (s) => (s?.problemQueuePostCount ?? 0) >= 1,
    ctaTo: '/study-groups',
  },
]

const SELF_LEARNER_CHECKLIST = [
  {
    key: 'pick_interest',
    label: 'Pick a topic you want to learn',
    testFn: (s) => (s?.topicFollowCount ?? 0) >= 1,
    ctaTo: '/feed',
  },
  {
    key: 'set_goal',
    label: 'Set your learning goal for this week',
    testFn: (s) => Boolean(s?.hasLearningGoal),
    ctaTo: '/feed',
  },
  {
    key: 'complete_task',
    label: 'Complete one task from your goal checklist',
    testFn: (s) => (s?.completedGoalTaskCount ?? 0) >= 1,
    ctaTo: '/feed',
  },
  {
    key: 'star_topic_sheet',
    label: 'Star a sheet in a topic you follow',
    testFn: (s) => (s?.starCount ?? 0) >= 1,
    ctaTo: '/sheets',
    helpLink: '/docs/sheets',
  },
  {
    key: 'write_reflection',
    label: 'Write your first reflection note',
    testFn: (s) => (s?.noteCount ?? 0) >= 1,
    ctaTo: '/notes',
    helpLink: '/docs/notes',
  },
]

/**
 * Returns the checklist appropriate for the given accountType. Falls back
 * to the student checklist when the accountType is unknown. Never returns
 * null — the caller always gets an array it can render.
 */
export function checklistFor(accountType) {
  switch (accountType) {
    case 'teacher':
      return TEACHER_CHECKLIST
    case 'other':
      return SELF_LEARNER_CHECKLIST
    case 'student':
    default:
      return STUDENT_CHECKLIST
  }
}

/**
 * Count of completed items given a role + state. Useful for progress bars
 * and celebration copy.
 */
export function completionCount(accountType, state) {
  const items = checklistFor(accountType)
  return items.reduce((n, it) => (it.testFn(state) ? n + 1 : n), 0)
}

export const CHECKLIST_BY_ROLE = {
  student: STUDENT_CHECKLIST,
  teacher: TEACHER_CHECKLIST,
  other: SELF_LEARNER_CHECKLIST,
}
