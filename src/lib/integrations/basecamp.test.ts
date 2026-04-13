import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetAllMocks, setMockStorage, setMessageHandler } from '../../test/chrome-mock'
import { BasecampIntegration } from './basecamp'
import { IntegrationError } from './types'

const CANONICAL_EXPIRED_MESSAGE =
  'Basecamp session expired. Please reconnect in Settings.'

const validCredentials = {
  integrationCredentials: {
    basecamp: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'https://example.chromiumapp.org/',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      accountId: '12345',
      accountName: 'Test Account',
      apiBaseUrl: 'https://3.basecampapi.com/12345',
      // Far future so no pre-emptive refresh fires.
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      destinationType: 'todo' as const,
    },
  },
}

describe('BasecampIntegration auth error handling', () => {
  beforeEach(() => {
    resetAllMocks()
    setMockStorage(validCredentials)
  })

  afterEach(() => {
    setMessageHandler(null)
  })

  describe('getDestinations', () => {
    it('converts a server-side 401 into the canonical IntegrationError', async () => {
      // Simulate the service worker receiving a 401 from Basecamp after
      // parseApiErrorMessage has already stripped any HTML.
      setMessageHandler(() => ({
        success: false,
        status: 401,
        error: 'OAuth token expired (old age). Refresh your token...',
      }))

      const integration = new BasecampIntegration()

      await expect(integration.getDestinations()).rejects.toThrow(IntegrationError)
      await expect(integration.getDestinations()).rejects.toMatchObject({
        message: CANONICAL_EXPIRED_MESSAGE,
        status: 401,
        integration: 'basecamp',
      })
    })

    it('passes non-401 errors through unchanged (no friendly rewrite)', async () => {
      setMessageHandler(() => ({
        success: false,
        status: 500,
        error: 'Internal Server Error',
      }))

      const integration = new BasecampIntegration()

      await expect(integration.getDestinations()).rejects.toThrow('Internal Server Error')
      await expect(integration.getDestinations()).rejects.not.toMatchObject({
        message: CANONICAL_EXPIRED_MESSAGE,
      })
    })

    it('passes IntegrationError from credential resolution through unchanged', async () => {
      // Missing credentials - getCredentials throws IntegrationError before
      // any API call. The auth wrapper must not rewrap it.
      setMockStorage({ integrationCredentials: {} })

      const integration = new BasecampIntegration()

      await expect(integration.getDestinations()).rejects.toThrow(
        'Basecamp is not configured'
      )
    })

    it('returns active destinations on success', async () => {
      setMessageHandler(() => ({
        success: true,
        data: [
          {
            id: 1,
            name: 'Active Project',
            status: 'active',
            dock: [],
            app_url: 'https://3.basecamp.com/12345/projects/1',
          },
          {
            id: 2,
            name: 'Archived Project',
            status: 'archived',
            dock: [],
            app_url: 'https://3.basecamp.com/12345/projects/2',
          },
        ],
      }))

      const integration = new BasecampIntegration()
      const destinations = await integration.getDestinations()

      expect(destinations).toHaveLength(1)
      expect(destinations[0]).toMatchObject({
        id: '1',
        name: 'Active Project',
      })
    })
  })

  describe('getSubDestinations', () => {
    it('converts a server-side 401 into the canonical IntegrationError (todo path)', async () => {
      setMessageHandler(() => ({
        success: false,
        status: 401,
        error: 'OAuth token expired (old age)',
      }))

      const integration = new BasecampIntegration()

      await expect(integration.getSubDestinations('42')).rejects.toMatchObject({
        message: CANONICAL_EXPIRED_MESSAGE,
        status: 401,
        integration: 'basecamp',
      })
    })

    it('converts a server-side 401 into the canonical IntegrationError (card path)', async () => {
      setMockStorage({
        integrationCredentials: {
          basecamp: {
            ...validCredentials.integrationCredentials.basecamp,
            destinationType: 'card',
          },
        },
      })

      setMessageHandler(() => ({
        success: false,
        status: 401,
        error: 'OAuth token expired',
      }))

      const integration = new BasecampIntegration()

      await expect(integration.getSubDestinations('42')).rejects.toMatchObject({
        message: CANONICAL_EXPIRED_MESSAGE,
        status: 401,
      })
    })
  })
})
