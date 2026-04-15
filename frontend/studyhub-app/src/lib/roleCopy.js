/**
 * Role-aware UI copy helper — see docs/roles-and-permissions-plan.md §6.
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
      'Share an update, mention classmates with @username, or point people to a great sheet…',
    teacher: 'Share an update, mention users with @username, or point people to a great sheet…',
    other: 'Share what you learned, mention people with @username, or link a great sheet…',
  },
  composerQuestionPlaceholder: {
    student: 'Post a question, resource, or link for your classmates…',
    teacher: 'Post a question, resource, or link for your students…',
    other: 'Post a question, resource, or link for the community…',
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
}

export function roleCopy(key, accountType) {
  const bucket = COPY[key]
  if (!bucket) return ''
  return bucket[accountType] || bucket.student
}

export function isSelfLearner(accountType) {
  return accountType === 'other'
}
