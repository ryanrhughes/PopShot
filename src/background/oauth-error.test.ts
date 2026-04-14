import { describe, it, expect } from 'vitest'
import { parseOAuthErrorCode } from './oauth-error'

describe('parseOAuthErrorCode', () => {
  it('returns invalid_grant when body has that error code', () => {
    const body = JSON.stringify({
      error: 'invalid_grant',
      error_description: 'The refresh token is invalid',
    })
    expect(parseOAuthErrorCode(body)).toBe('invalid_grant')
  })

  it('returns invalid_client when body has that error code', () => {
    const body = JSON.stringify({
      error: 'invalid_client',
      error_description: 'Client authentication failed',
    })
    expect(parseOAuthErrorCode(body)).toBe('invalid_client')
  })

  it('returns undefined for a non-OAuth error body (e.g. a Basecamp API 401 HTML-tagged message)', () => {
    // Basecamp's canonical expired-token body uses `error: "OAuth token expired..."`, not a code.
    const body = JSON.stringify({
      error: 'OAuth token expired (old age). Refresh your token or acquire a new one at ...',
    })
    expect(parseOAuthErrorCode(body)).toBeUndefined()
  })

  it('returns undefined for an empty body', () => {
    expect(parseOAuthErrorCode('')).toBeUndefined()
  })

  it('returns undefined for malformed JSON', () => {
    expect(parseOAuthErrorCode('<html>500</html>')).toBeUndefined()
  })

  it('returns undefined when error field is not a recognized OAuth code', () => {
    const body = JSON.stringify({ error: 'some_other_error' })
    expect(parseOAuthErrorCode(body)).toBeUndefined()
  })
})
