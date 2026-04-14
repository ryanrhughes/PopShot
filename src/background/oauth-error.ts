/**
 * Parse the OAuth 2.0 error code from a token-endpoint error response body.
 *
 * Basecamp's token endpoint uses the standard OAuth error shape:
 *   { error: "invalid_grant", error_description: "..." }
 *   { error: "invalid_client", error_description: "..." }
 *
 * These two cases need to be distinguished because they lead to different
 * recovery paths:
 *   - invalid_grant: refresh token is dead - user needs to sign in again
 *     (inline Reconnect works)
 *   - invalid_client: client_id/client_secret are bad (admin rotated them,
 *     app was revoked in launchpad) - inline reconnect would loop forever;
 *     user needs to reconfigure in Settings
 *
 * Returns undefined for:
 *   - non-JSON bodies
 *   - JSON without an `error` string field
 *   - JSON whose `error` field is a free-form message (e.g. Basecamp's own
 *     API 401 body: `{ error: "OAuth token expired (old age)..." }`) rather
 *     than an OAuth error code
 */
export type OAuthErrorCode = 'invalid_grant' | 'invalid_client'

const RECOGNIZED_CODES: readonly OAuthErrorCode[] = ['invalid_grant', 'invalid_client']

export function parseOAuthErrorCode(rawBody: string): OAuthErrorCode | undefined {
  if (!rawBody) return undefined

  let data: unknown
  try {
    data = JSON.parse(rawBody)
  } catch {
    return undefined
  }

  if (typeof data !== 'object' || data === null) return undefined
  const errorField = (data as Record<string, unknown>).error
  if (typeof errorField !== 'string') return undefined

  return RECOGNIZED_CODES.find((code) => code === errorField)
}
