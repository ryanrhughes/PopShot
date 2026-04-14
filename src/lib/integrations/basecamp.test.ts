import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetAllMocks, setMockStorage, setMessageHandler, getMockStorage } from '../../test/chrome-mock'
import { BasecampIntegration } from './basecamp'
import { IntegrationError } from './types'

const CANONICAL_EXPIRED_MESSAGE =
  'Your Basecamp session has expired. Sign in again to continue.'
const INVALID_CLIENT_MESSAGE =
  'Basecamp credentials need to be reconfigured in Settings.'

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

function credsWithExpiry(expiresAt: string) {
  return {
    integrationCredentials: {
      basecamp: {
        ...validCredentials.integrationCredentials.basecamp,
        expiresAt,
      },
    },
  }
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
    it('converts a server-side 401 into the canonical IntegrationError with session_expired code', async () => {
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
        code: 'session_expired',
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
        code: 'session_expired',
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

  describe('getProjectAvailability', () => {
    it('converts a 401 into the canonical session_expired IntegrationError so the UI can show the reconnect banner instead of a false "no destinations available"', async () => {
      setMessageHandler(() => ({
        success: false,
        status: 401,
        error: 'OAuth token expired',
      }))

      const integration = new BasecampIntegration()

      await expect(integration.getProjectAvailability('42')).rejects.toMatchObject({
        message: CANONICAL_EXPIRED_MESSAGE,
        status: 401,
        integration: 'basecamp',
        code: 'session_expired',
      })
    })

    it('reports which destination types the project has when the API succeeds', async () => {
      // The availability probe chains getProject -> (todoSet|cardTable) -> items,
      // so return shape-specific payloads based on the request URL.
      setMessageHandler((message) => {
        const { url } = message as { url: string }
        if (url.includes('/projects/42.json')) {
          return {
            success: true,
            data: {
              id: 42,
              name: 'Test',
              status: 'active',
              dock: [
                { name: 'todoset', enabled: true, url: 'https://example/todoset.json' },
                { name: 'kanban_board', enabled: true, url: 'https://example/card_table.json' },
              ],
              app_url: 'https://example/42',
            },
          }
        }
        if (url.includes('/todoset.json')) {
          return { success: true, data: { todolists_url: 'https://example/todolists.json' } }
        }
        if (url.includes('/todolists.json')) {
          return { success: true, data: [{ id: 1, title: 'List' }] }
        }
        if (url.includes('/card_table.json')) {
          return { success: true, data: { lists: [{ id: 2, title: 'Column', type: 'Kanban::Column' }] } }
        }
        return { success: true, data: [] }
      })

      const integration = new BasecampIntegration()
      const result = await integration.getProjectAvailability('42')

      expect(result).toEqual({ hasTodoLists: true, hasCardColumns: true })
    })
  })
})

describe('BasecampIntegration proactive refresh', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    setMessageHandler(null)
  })

  it('does NOT refresh when token has more than 5 minutes left', async () => {
    // expires in 10 minutes
    setMockStorage(credsWithExpiry(new Date(Date.now() + 10 * 60 * 1000).toISOString()))

    const calls: unknown[] = []
    setMessageHandler((message) => {
      calls.push(message)
      return {
        success: true,
        data: [
          { id: 1, name: 'P', status: 'active', dock: [], app_url: '' },
        ],
      }
    })

    const integration = new BasecampIntegration()
    await integration.getDestinations()

    // Only the projects call should have been made (no token refresh)
    expect(calls).toHaveLength(1)
    expect((calls[0] as { url: string }).url).toContain('/projects.json')
  })

  it('refreshes within the 5-minute buffer and persists new tokens', async () => {
    // expires in 2 minutes - inside the buffer
    setMockStorage(credsWithExpiry(new Date(Date.now() + 2 * 60 * 1000).toISOString()))

    const calls: { url: string }[] = []
    setMessageHandler((message) => {
      const msg = message as { url: string; action: string }
      calls.push({ url: msg.url })
      if (msg.url.includes('/authorization/token')) {
        return {
          success: true,
          data: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 1209600, // 14 days
            token_type: 'Bearer',
          },
        }
      }
      return {
        success: true,
        data: [{ id: 1, name: 'P', status: 'active', dock: [], app_url: '' }],
      }
    })

    const integration = new BasecampIntegration()
    await integration.getDestinations()

    // First call should be token refresh, then projects
    expect(calls[0].url).toContain('/authorization/token')
    expect(calls[1].url).toContain('/projects.json')

    // Persisted credentials should be updated
    const stored = getMockStorage() as {
      integrationCredentials: { basecamp: { accessToken: string; refreshToken: string } }
    }
    expect(stored.integrationCredentials.basecamp.accessToken).toBe('new-access-token')
    expect(stored.integrationCredentials.basecamp.refreshToken).toBe('new-refresh-token')
  })

  it('maps refresh failure with invalid_grant to session_expired IntegrationError', async () => {
    setMockStorage(credsWithExpiry(new Date(Date.now() - 60 * 1000).toISOString()))

    setMessageHandler((message) => {
      const msg = message as { url: string }
      if (msg.url.includes('/authorization/token')) {
        return {
          success: false,
          status: 400,
          error: 'invalid_grant',
          errorCode: 'invalid_grant',
        }
      }
      return { success: true, data: [] }
    })

    const integration = new BasecampIntegration()

    await expect(integration.getDestinations()).rejects.toMatchObject({
      message: CANONICAL_EXPIRED_MESSAGE,
      integration: 'basecamp',
      status: 401,
      code: 'session_expired',
    })
  })

  it('maps refresh failure with invalid_client to invalid_client IntegrationError', async () => {
    setMockStorage(credsWithExpiry(new Date(Date.now() - 60 * 1000).toISOString()))

    setMessageHandler((message) => {
      const msg = message as { url: string }
      if (msg.url.includes('/authorization/token')) {
        return {
          success: false,
          status: 401,
          error: 'invalid_client',
          errorCode: 'invalid_client',
        }
      }
      return { success: true, data: [] }
    })

    const integration = new BasecampIntegration()

    await expect(integration.getDestinations()).rejects.toMatchObject({
      message: INVALID_CLIENT_MESSAGE,
      integration: 'basecamp',
      code: 'invalid_client',
    })
  })

  it('maps a generic refresh failure (no errorCode) to session_expired', async () => {
    // Network error or unexpected shape - treat as session expired (inline reconnect is
    // still the best first response; the user can fall back to Settings if it keeps failing).
    setMockStorage(credsWithExpiry(new Date(Date.now() - 60 * 1000).toISOString()))

    setMessageHandler((message) => {
      const msg = message as { url: string }
      if (msg.url.includes('/authorization/token')) {
        return {
          success: false,
          status: 500,
          error: 'Server broke',
        }
      }
      return { success: true, data: [] }
    })

    const integration = new BasecampIntegration()

    await expect(integration.getDestinations()).rejects.toMatchObject({
      message: CANONICAL_EXPIRED_MESSAGE,
      integration: 'basecamp',
      code: 'session_expired',
    })
  })
})
