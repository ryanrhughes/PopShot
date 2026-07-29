import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { chromeMock, resetAllMocks } from '../test/chrome-mock'
import {
  resolveOAuthApp,
  hasBuiltInOAuthApp,
  PRODUCTION_EXTENSION_ID,
  DEVELOPMENT_EXTENSION_ID,
} from './basecamp-oauth-app'

// The credentials app selection is keyed off chrome.runtime.id at runtime -
// the invariant these tests protect is that the selected app always matches
// the extension identity Chrome actually gave this install, since that
// identity is what determines the chromiumapp.org redirect URI.

const ORIGINAL_MOCK_ID = chromeMock.runtime.id

describe('resolveOAuthApp', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    chromeMock.runtime.id = ORIGINAL_MOCK_ID
  })

  it('selects the production app when running under the Web Store extension ID', () => {
    chromeMock.runtime.id = PRODUCTION_EXTENSION_ID

    const app = resolveOAuthApp()

    expect(app.clientId).toBe('0cefe54a70d043a08bc17a0c70139ae6b94f16b0')
    expect(app.redirectUri).toBe(`https://${PRODUCTION_EXTENSION_ID}.chromiumapp.org/`)
  })

  it('selects the development app when running under the pinned dev extension ID', () => {
    chromeMock.runtime.id = DEVELOPMENT_EXTENSION_ID

    const app = resolveOAuthApp()

    expect(app.clientId).toBe('e81e2767a52c693d6a0790d2da10a5d8aa86d390')
    expect(app.redirectUri).toBe(`https://${DEVELOPMENT_EXTENSION_ID}.chromiumapp.org/`)
  })

  it('throws an actionable error when the extension ID matches neither registration', () => {
    chromeMock.runtime.id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    expect(() => resolveOAuthApp()).toThrowError(/production build was loaded unpacked/)
    expect(() => resolveOAuthApp()).toThrowError(/npm run build:dev/)
    // The message must name the actual ID so the developer can compare it.
    expect(() => resolveOAuthApp()).toThrowError(/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/)
  })

  it('prefers a stored user override even under an unregistered extension ID', () => {
    chromeMock.runtime.id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    const app = resolveOAuthApp({
      clientId: 'user-client-id',
      clientSecret: 'user-client-secret',
      redirectUri: 'https://custom.example.com/callback',
    })

    expect(app.clientId).toBe('user-client-id')
    expect(app.redirectUri).toBe('https://custom.example.com/callback')
  })

  it('falls back to the extension redirect URI when an override omits one', () => {
    chromeMock.runtime.id = DEVELOPMENT_EXTENSION_ID

    const app = resolveOAuthApp({
      clientId: 'user-client-id',
      clientSecret: 'user-client-secret',
    })

    expect(app.redirectUri).toBe(`https://${DEVELOPMENT_EXTENSION_ID}.chromiumapp.org/`)
  })

  it('ignores a partial override missing the secret', () => {
    chromeMock.runtime.id = DEVELOPMENT_EXTENSION_ID

    const app = resolveOAuthApp({ clientId: 'user-client-id' })

    expect(app.clientId).toBe('e81e2767a52c693d6a0790d2da10a5d8aa86d390')
  })
})

describe('hasBuiltInOAuthApp', () => {
  afterEach(() => {
    chromeMock.runtime.id = ORIGINAL_MOCK_ID
  })

  it('is true under either registered extension ID', () => {
    chromeMock.runtime.id = PRODUCTION_EXTENSION_ID
    expect(hasBuiltInOAuthApp()).toBe(true)

    chromeMock.runtime.id = DEVELOPMENT_EXTENSION_ID
    expect(hasBuiltInOAuthApp()).toBe(true)
  })

  it('is false under an unregistered extension ID', () => {
    chromeMock.runtime.id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    expect(hasBuiltInOAuthApp()).toBe(false)
  })
})
