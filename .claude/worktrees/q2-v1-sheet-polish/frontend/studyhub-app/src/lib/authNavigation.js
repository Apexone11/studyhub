export function getAuthenticatedHomePath(user) {
  if (!user) return '/login'
  return user.role === 'admin' ? '/admin' : '/feed'
}
