/**
 * Role-aware UI copy helper - see docs/internal/roles-and-permissions-plan.md section 6.
 * Returns a string by key, branched on the viewer's accountType.
 * Self-learners ('other') see community/interest-flavored copy;
 * students/teachers keep campus/classmate-flavored copy.
 */

const COPY = {
  composerTitle: {
    student: 'Share with your classmates',
    teacher: 'Share with your students',
    other: 'Share with the community',
  },
  composerHelper: {
    student: 'Post class notes, course questions, or links to your latest sheet.',
    teacher: 'Post resources, announcements, or links to your latest sheet.',
    other: 'Post what you are learning, a question, or a sheet worth sharing.',
  },
  composerPlaceholder: {
    student:
      'Share an update, mention classmates with @username, or point people to a great sheet...',
    teacher: 'Share an update, mention users with @username, or point people to a great sheet...',
    other: 'Share what you learned, mention people with @username, or link a great sheet...',
  },
  composerQuestionPlaceholder: {
    student: 'Post a question, resource, or link for your classmates...',
    teacher: 'Post a question, resource, or link for your students...',
    other: 'Post a question, resource, or link for the community...',
  },
  emptyStateBody: {
    student: 'Posts from your classmates and followed users will appear here.',
    teacher: 'Posts from your students and followed users will appear here.',
    other: 'Follow topics or creators to fill your feed with things you care about.',
  },
  browseSheetsHelper: {
    student: 'See what classmates shared',
    teacher: 'See what your students shared',
    other: 'Discover sheets across topics',
  },
  // Phase 1 of the v2 design refresh - Dashboard context line below the
  // "Welcome back, X." headline.
  dashboardWelcomeContext: {
    student: 'Your courses, notes, and practice tests are ready when you are.',
    teacher: 'Your courses, announcements, and materials are ready when you are.',
    other: 'Your interests, notes, and learning goals are ready when you are.',
  },
  dashboardHeroEyebrow: {
    student: 'SESSION READY',
    teacher: 'TEACHING READY',
    other: 'LEARNING READY',
  },
  // Phase 1 Top Contributors widget - heading reflects the viewer context.
  topContributorsHeading: {
    student: 'Top contributors in your courses',
    teacher: 'Top contributors in your courses',
    other: 'People you follow who are sharing',
  },
  topContributorsEmpty: {
    student: 'No activity from classmates yet. Follow a few to see them here.',
    teacher: 'No contributions yet from students in your courses.',
    other: 'Follow a few people and their top-contributing moments will show here.',
  },
}

export function roleCopy(key, accountType) {
  const bucket = COPY[key]
  if (!bucket) return ''
  return bucket[accountType] || bucket.student
}

export function isSelfLearner(accountType) {
  return accountType === 'other'
}
