/**
 * Returns the verification type to display for a user.
 * Rule: staff overrides email; never show both.
 * @param {{ isStaffVerified?: boolean, emailVerified?: boolean }} user
 * @returns {'staff' | 'email' | null}
 */
export function getVerificationType(user) {
  if (!user) return null
  if (user.isStaffVerified) return 'staff'
  if (user.emailVerified) return 'email'
  return null
}
