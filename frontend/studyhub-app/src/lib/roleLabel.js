const ROLE_LABELS = {
  student: 'Student',
  teacher: 'Teacher',
  other: 'Self-learner',
}

export function roleLabel(accountType) {
  return ROLE_LABELS[accountType] || 'Student'
}

export const ACCOUNT_TYPE_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher / TA' },
  { value: 'other', label: 'Self-learner' },
]
