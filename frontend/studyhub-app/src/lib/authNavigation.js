// Authenticated navigation stays consistent across login, signup, and public
// route redirects, especially for admins who still need to enroll in 2FA.
export function getAuthenticatedHomePath(user) {
  if (!user) return '/login'
  if (user.role === 'admin' && !user.twoFaEnabled) return '/settings'
  return user.role === 'admin' ? '/admin' : '/feed'
}
