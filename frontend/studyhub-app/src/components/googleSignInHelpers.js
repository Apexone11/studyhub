import { GOOGLE_CLIENT_ID } from '../config'

export function buildGoogleOAuthUrl(redirectUri) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    access_type: 'offline',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function getGoogleRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`
}
