import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetAllMocks,
  setMockStorage,
  getMockStorage,
} from '../test/chrome-mock'
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  hasApiKey,
  getLastUsedBoard,
  setLastUsedBoard,
  getUrlBoardDefaults,
  setUrlBoardDefault,
  removeUrlBoardDefault,
  findDefaultBoardForUrl,
  getAllStorageData,
  clearAllStorageData,
  // Integration functions
  getIntegrationCredentials,
  setIntegrationCredentials,
  setFizzyCredentials,
  clearFizzyCredentials,
  setBasecampCredentials,
  clearBasecampCredentials,
  isIntegrationConfigured,
  getConfiguredIntegrationIds,
  getIntegrationPreferences,
  setIntegrationPreferences,
  getDefaultIntegration,
  setDefaultIntegration,
  getLastUsedDestination,
  setLastUsedDestination,
  getOriginFromUrl,
  getLastUsedIntegration,
  setLastUsedIntegration,
} from './storage'

describe('storage', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  describe('API Key management', () => {
    it('returns null when no API key is stored', async () => {
      const result = await getApiKey()
      expect(result).toBeNull()
    })

    it('stores and retrieves API key', async () => {
      await setApiKey('test-api-key-123')
      const result = await getApiKey()
      expect(result).toBe('test-api-key-123')
    })

    it('clears API key', async () => {
      await setApiKey('test-api-key-123')
      await clearApiKey()
      const result = await getApiKey()
      expect(result).toBeNull()
    })

    it('hasApiKey returns false when no key exists', async () => {
      const result = await hasApiKey()
      expect(result).toBe(false)
    })

    it('hasApiKey returns true when key exists', async () => {
      await setApiKey('test-api-key')
      const result = await hasApiKey()
      expect(result).toBe(true)
    })
  })

  describe('Last used board', () => {
    it('returns null when no board is stored', async () => {
      const result = await getLastUsedBoard()
      expect(result).toBeNull()
    })

    it('stores and retrieves last used board', async () => {
      await setLastUsedBoard('board-456')
      const result = await getLastUsedBoard()
      expect(result).toBe('board-456')
    })

    it('overwrites previous board', async () => {
      await setLastUsedBoard('board-1')
      await setLastUsedBoard('board-2')
      const result = await getLastUsedBoard()
      expect(result).toBe('board-2')
    })
  })

  describe('URL-to-board defaults', () => {
    it('returns empty object when no defaults exist', async () => {
      const result = await getUrlBoardDefaults()
      expect(result).toEqual({})
    })

    it('sets and retrieves URL board default', async () => {
      await setUrlBoardDefault('https://app.fizzy.do', 'board-fizzy')
      const result = await getUrlBoardDefaults()
      expect(result).toEqual({ 'https://app.fizzy.do': 'board-fizzy' })
    })

    it('stores multiple URL patterns', async () => {
      await setUrlBoardDefault('https://app.fizzy.do', 'board-fizzy')
      await setUrlBoardDefault('https://github.com', 'board-github')

      const result = await getUrlBoardDefaults()
      expect(result).toEqual({
        'https://app.fizzy.do': 'board-fizzy',
        'https://github.com': 'board-github',
      })
    })

    it('removes URL board default', async () => {
      await setUrlBoardDefault('https://app.fizzy.do', 'board-fizzy')
      await setUrlBoardDefault('https://github.com', 'board-github')
      await removeUrlBoardDefault('https://app.fizzy.do')

      const result = await getUrlBoardDefaults()
      expect(result).toEqual({ 'https://github.com': 'board-github' })
    })
  })

  describe('findDefaultBoardForUrl', () => {
    beforeEach(async () => {
      // Set up some default patterns
      setMockStorage({
        urlBoardDefaults: {
          'https://app.fizzy.do': 'board-fizzy',
          'github.com': 'board-github',
          'localhost:3000': 'board-local',
        },
      })
    })

    it('finds board by URL prefix match', async () => {
      const result = await findDefaultBoardForUrl(
        'https://app.fizzy.do/boards/123'
      )
      expect(result).toBe('board-fizzy')
    })

    it('finds board by URL contains match', async () => {
      const result = await findDefaultBoardForUrl(
        'https://github.com/user/repo'
      )
      expect(result).toBe('board-github')
    })

    it('finds board for localhost URLs', async () => {
      const result = await findDefaultBoardForUrl(
        'http://localhost:3000/dashboard'
      )
      expect(result).toBe('board-local')
    })

    it('returns null when no pattern matches', async () => {
      const result = await findDefaultBoardForUrl('https://unknown-site.com')
      expect(result).toBeNull()
    })

    it('returns null when no defaults are configured', async () => {
      setMockStorage({}) // Clear defaults
      const result = await findDefaultBoardForUrl('https://any-url.com')
      expect(result).toBeNull()
    })
  })

  describe('getAllStorageData', () => {
    it('returns all stored data', async () => {
      setMockStorage({
        apiKey: 'my-api-key',
        lastUsedBoard: 'board-123',
        urlBoardDefaults: { 'https://test.com': 'board-test' },
      })

      const result = await getAllStorageData()

      expect(result.apiKey).toBe('my-api-key')
      expect(result.lastUsedBoard).toBe('board-123')
      expect(result.urlBoardDefaults).toEqual({ 'https://test.com': 'board-test' })
    })

    it('returns partial data when some keys missing', async () => {
      setMockStorage({ apiKey: 'only-key' })

      const result = await getAllStorageData()

      expect(result.apiKey).toBe('only-key')
      expect(result.lastUsedBoard).toBeUndefined()
      expect(result.urlBoardDefaults).toBeUndefined()
    })
  })

  describe('clearAllStorageData', () => {
    it('clears all stored data', async () => {
      setMockStorage({
        apiKey: 'my-api-key',
        lastUsedBoard: 'board-123',
        urlBoardDefaults: { 'https://test.com': 'board-test' },
      })

      await clearAllStorageData()

      const storage = getMockStorage()
      expect(storage).toEqual({})
    })
  })

  // ============ Integration Credentials Tests ============

  describe('Integration Credentials', () => {
    describe('getIntegrationCredentials', () => {
      it('returns empty object when no credentials exist', async () => {
        const result = await getIntegrationCredentials()
        expect(result).toEqual({})
      })

      it('migrates legacy apiKey to fizzy credentials', async () => {
        setMockStorage({ apiKey: 'legacy-key' })
        const result = await getIntegrationCredentials()
        expect(result.fizzy?.apiKey).toBe('legacy-key')
      })

      it('does not overwrite existing fizzy credentials with legacy key', async () => {
        setMockStorage({
          apiKey: 'legacy-key',
          integrationCredentials: { fizzy: { apiKey: 'new-key' } },
        })
        const result = await getIntegrationCredentials()
        expect(result.fizzy?.apiKey).toBe('new-key')
      })

      it('returns stored integration credentials', async () => {
        setMockStorage({
          integrationCredentials: {
            fizzy: { apiKey: 'fizzy-key' },
            basecamp: { clientId: 'bc-client', clientSecret: 'bc-secret' },
          },
        })
        const result = await getIntegrationCredentials()
        expect(result.fizzy?.apiKey).toBe('fizzy-key')
        expect(result.basecamp?.clientId).toBe('bc-client')
      })
    })

    describe('setIntegrationCredentials', () => {
      it('stores integration credentials', async () => {
        await setIntegrationCredentials({
          fizzy: { apiKey: 'test-key' },
        })
        const storage = getMockStorage() as { integrationCredentials?: { fizzy?: { apiKey: string } } }
        expect(storage.integrationCredentials?.fizzy?.apiKey).toBe('test-key')
      })
    })

    describe('setFizzyCredentials', () => {
      it('sets fizzy credentials', async () => {
        await setFizzyCredentials({ apiKey: 'fizzy-test-key' })
        const result = await getIntegrationCredentials()
        expect(result.fizzy?.apiKey).toBe('fizzy-test-key')
      })

      it('preserves other integration credentials', async () => {
        setMockStorage({
          integrationCredentials: {
            basecamp: { clientId: 'bc-id', clientSecret: 'bc-secret' },
          },
        })
        await setFizzyCredentials({ apiKey: 'fizzy-key' })
        const result = await getIntegrationCredentials()
        expect(result.fizzy?.apiKey).toBe('fizzy-key')
        expect(result.basecamp?.clientId).toBe('bc-id')
      })
    })

    describe('clearFizzyCredentials', () => {
      it('removes fizzy credentials', async () => {
        setMockStorage({
          integrationCredentials: { fizzy: { apiKey: 'to-delete' } },
        })
        await clearFizzyCredentials()
        const result = await getIntegrationCredentials()
        expect(result.fizzy).toBeUndefined()
      })
    })

    describe('setBasecampCredentials', () => {
      it('sets basecamp credentials', async () => {
        await setBasecampCredentials({
          clientId: 'bc-client-id',
          clientSecret: 'bc-client-secret',
          accessToken: 'bc-token',
        })
        const result = await getIntegrationCredentials()
        expect(result.basecamp?.clientId).toBe('bc-client-id')
        expect(result.basecamp?.accessToken).toBe('bc-token')
      })
    })

    describe('clearBasecampCredentials', () => {
      it('removes basecamp credentials', async () => {
        setMockStorage({
          integrationCredentials: {
            basecamp: { clientId: 'id', clientSecret: 'secret' },
          },
        })
        await clearBasecampCredentials()
        const result = await getIntegrationCredentials()
        expect(result.basecamp).toBeUndefined()
      })
    })
  })

  describe('isIntegrationConfigured', () => {
    it('returns true when fizzy has API key', async () => {
      setMockStorage({
        integrationCredentials: { fizzy: { apiKey: 'key' } },
      })
      const result = await isIntegrationConfigured('fizzy')
      expect(result).toBe(true)
    })

    it('returns false when fizzy has no API key', async () => {
      const result = await isIntegrationConfigured('fizzy')
      expect(result).toBe(false)
    })

    it('returns true when basecamp has access token', async () => {
      setMockStorage({
        integrationCredentials: {
          basecamp: { clientId: 'id', clientSecret: 'secret', accessToken: 'token' },
        },
      })
      const result = await isIntegrationConfigured('basecamp')
      expect(result).toBe(true)
    })

    it('returns false when basecamp has no access token', async () => {
      setMockStorage({
        integrationCredentials: {
          basecamp: { clientId: 'id', clientSecret: 'secret' },
        },
      })
      const result = await isIntegrationConfigured('basecamp')
      expect(result).toBe(false)
    })

    it('returns false for unknown integration type', async () => {
      // @ts-expect-error - testing invalid type
      const result = await isIntegrationConfigured('unknown')
      expect(result).toBe(false)
    })
  })

  describe('getConfiguredIntegrationIds', () => {
    it('returns empty array when no integrations configured', async () => {
      const result = await getConfiguredIntegrationIds()
      expect(result).toEqual([])
    })

    it('returns fizzy when only fizzy is configured', async () => {
      setMockStorage({
        integrationCredentials: { fizzy: { apiKey: 'key' } },
      })
      const result = await getConfiguredIntegrationIds()
      expect(result).toEqual(['fizzy'])
    })

    it('returns basecamp when only basecamp is configured', async () => {
      setMockStorage({
        integrationCredentials: {
          basecamp: { clientId: 'id', clientSecret: 'secret', accessToken: 'token' },
        },
      })
      const result = await getConfiguredIntegrationIds()
      expect(result).toEqual(['basecamp'])
    })

    it('returns both when both are configured', async () => {
      setMockStorage({
        integrationCredentials: {
          fizzy: { apiKey: 'key' },
          basecamp: { clientId: 'id', clientSecret: 'secret', accessToken: 'token' },
        },
      })
      const result = await getConfiguredIntegrationIds()
      expect(result).toEqual(['fizzy', 'basecamp'])
    })
  })

  // ============ Integration Preferences Tests ============

  describe('Integration Preferences', () => {
    describe('getIntegrationPreferences', () => {
      it('returns empty object when no preferences exist', async () => {
        const result = await getIntegrationPreferences()
        expect(result).toEqual({})
      })

      it('returns stored preferences', async () => {
        setMockStorage({
          integrationPreferences: { defaultIntegration: 'fizzy' },
        })
        const result = await getIntegrationPreferences()
        expect(result.defaultIntegration).toBe('fizzy')
      })
    })

    describe('setIntegrationPreferences', () => {
      it('stores preferences', async () => {
        await setIntegrationPreferences({ defaultIntegration: 'basecamp' })
        const storage = getMockStorage() as { integrationPreferences?: { defaultIntegration?: string } }
        expect(storage.integrationPreferences?.defaultIntegration).toBe('basecamp')
      })
    })

    describe('getDefaultIntegration', () => {
      it('returns null when no integrations configured', async () => {
        const result = await getDefaultIntegration()
        expect(result).toBeNull()
      })

      it('returns default integration when set and configured', async () => {
        setMockStorage({
          integrationCredentials: { fizzy: { apiKey: 'key' } },
          integrationPreferences: { defaultIntegration: 'fizzy' },
        })
        const result = await getDefaultIntegration()
        expect(result).toBe('fizzy')
      })

      it('returns first configured integration when default is not set', async () => {
        setMockStorage({
          integrationCredentials: { fizzy: { apiKey: 'key' } },
        })
        const result = await getDefaultIntegration()
        expect(result).toBe('fizzy')
      })

      it('returns first configured integration when default is not configured', async () => {
        setMockStorage({
          integrationCredentials: { fizzy: { apiKey: 'key' } },
          integrationPreferences: { defaultIntegration: 'basecamp' }, // Not configured
        })
        const result = await getDefaultIntegration()
        expect(result).toBe('fizzy')
      })
    })

    describe('setDefaultIntegration', () => {
      it('sets the default integration', async () => {
        await setDefaultIntegration('basecamp')
        const prefs = await getIntegrationPreferences()
        expect(prefs.defaultIntegration).toBe('basecamp')
      })
    })
  })

  // ============ Last Used Destination Tests ============

  describe('Last Used Destination', () => {
    describe('getLastUsedDestination', () => {
      it('returns null when no last used destination', async () => {
        const result = await getLastUsedDestination('fizzy')
        expect(result).toBeNull()
      })

      it('returns fizzy last used destination', async () => {
        setMockStorage({
          integrationPreferences: {
            lastUsedDestinations: {
              fizzy: { boardId: 'board-123', accountSlug: 'account-slug' },
            },
          },
        })
        const result = await getLastUsedDestination('fizzy')
        expect(result).toEqual({
          destinationId: 'board-123',
          accountId: 'account-slug',
        })
      })

      it('returns basecamp last used destination with todolistId', async () => {
        setMockStorage({
          integrationPreferences: {
            lastUsedDestinations: {
              basecamp: { accountId: 'account-456', projectId: 'project-456', todolistId: 'todolist-789' },
            },
          },
        })
        const result = await getLastUsedDestination('basecamp')
        expect(result).toEqual({
          destinationId: 'project-456',
          accountId: 'account-456',
          subDestinationId: 'todolist-789',
        })
      })

      it('returns basecamp last used destination with columnId', async () => {
        setMockStorage({
          integrationPreferences: {
            lastUsedDestinations: {
              basecamp: { accountId: 'account-456', projectId: 'project-456', columnId: 'column-123' },
            },
          },
        })
        const result = await getLastUsedDestination('basecamp')
        expect(result).toEqual({
          destinationId: 'project-456',
          accountId: 'account-456',
          subDestinationId: 'column-123',
        })
      })

      it('returns null for unrecognized format', async () => {
        setMockStorage({
          integrationPreferences: {
            lastUsedDestinations: {
              fizzy: { unknownField: 'value' } as unknown as { boardId: string; accountSlug: string },
            },
          },
        })
        const result = await getLastUsedDestination('fizzy')
        expect(result).toBeNull()
      })
    })

    describe('setLastUsedDestination', () => {
      it('sets fizzy last used destination', async () => {
        await setLastUsedDestination('fizzy', 'board-abc', 'account-xyz')
        const prefs = await getIntegrationPreferences()
        expect(prefs.lastUsedDestinations?.fizzy).toEqual({
          boardId: 'board-abc',
          accountSlug: 'account-xyz',
        })
      })

      it('sets basecamp last used destination with todolist (default)', async () => {
        await setLastUsedDestination('basecamp', 'project-123', 'account-123', 'todolist-456')
        const prefs = await getIntegrationPreferences()
        expect(prefs.lastUsedDestinations?.basecamp).toEqual({
          accountId: 'account-123',
          projectId: 'project-123',
          todolistId: 'todolist-456',
        })
      })

      it('sets basecamp last used destination with column when destinationType is card', async () => {
        // Set up basecamp with card destination type
        setMockStorage({
          integrationCredentials: {
            basecamp: { clientId: 'id', clientSecret: 'secret', destinationType: 'card' },
          },
        })
        await setLastUsedDestination('basecamp', 'project-123', 'account-123', 'column-789')
        const prefs = await getIntegrationPreferences()
        expect(prefs.lastUsedDestinations?.basecamp).toEqual({
          accountId: 'account-123',
          projectId: 'project-123',
          columnId: 'column-789',
        })
      })

      it('initializes lastUsedDestinations if not present', async () => {
        await setLastUsedDestination('fizzy', 'board-1', 'account-1')
        const prefs = await getIntegrationPreferences()
        expect(prefs.lastUsedDestinations).toBeDefined()
        expect(prefs.lastUsedDestinations?.fizzy).toBeDefined()
      })

      it('preserves existing lastUsedDestinations', async () => {
        setMockStorage({
          integrationPreferences: {
            lastUsedDestinations: {
              fizzy: { boardId: 'old-board', accountSlug: 'old-account' },
            },
          },
        })
        await setLastUsedDestination('basecamp', 'project-new', 'project-new', 'todolist-new')
        const prefs = await getIntegrationPreferences()
        // Both should exist
        expect(prefs.lastUsedDestinations?.fizzy?.boardId).toBe('old-board')
        expect(prefs.lastUsedDestinations?.basecamp?.projectId).toBe('project-new')
      })

      it('does nothing for unknown integration type', async () => {
        // @ts-expect-error - testing unknown integration type
        await setLastUsedDestination('unknown', 'dest-1', 'account-1')
        const prefs = await getIntegrationPreferences()
        // lastUsedDestinations should exist but be empty
        expect(prefs.lastUsedDestinations).toBeDefined()
        expect(prefs.lastUsedDestinations?.fizzy).toBeUndefined()
        expect(prefs.lastUsedDestinations?.basecamp).toBeUndefined()
      })
    })
  })

  // ============ URL Origin Extraction Tests ============

  describe('getOriginFromUrl', () => {
    it('extracts origin from standard HTTPS URL', () => {
      const result = getOriginFromUrl('https://app.example.com/path/to/page')
      expect(result).toBe('https://app.example.com')
    })

    it('extracts origin from HTTP URL', () => {
      const result = getOriginFromUrl('http://example.com/page')
      expect(result).toBe('http://example.com')
    })

    it('extracts origin with port number', () => {
      const result = getOriginFromUrl('https://app.example.com:3000/dashboard')
      expect(result).toBe('https://app.example.com:3000')
    })

    it('extracts origin from localhost URL', () => {
      const result = getOriginFromUrl('http://localhost:8080/api/test')
      expect(result).toBe('http://localhost:8080')
    })

    it('extracts origin from URL with query params and hash', () => {
      const result = getOriginFromUrl('https://app.example.com/page?foo=bar#section')
      expect(result).toBe('https://app.example.com')
    })

    it('returns null for invalid URL', () => {
      const result = getOriginFromUrl('not-a-valid-url')
      expect(result).toBeNull()
    })

    it('returns null for empty string', () => {
      const result = getOriginFromUrl('')
      expect(result).toBeNull()
    })

    it('returns null for chrome:// URLs', () => {
      const result = getOriginFromUrl('chrome://extensions/')
      expect(result).toBeNull()
    })

    it('returns null for file:// URLs', () => {
      const result = getOriginFromUrl('file:///path/to/file.html')
      expect(result).toBeNull()
    })
  })

  // ============ URL-based Integration Tests ============

  describe('URL-based Last Used Integration', () => {
    describe('getLastUsedIntegration', () => {
      it('returns URL-specific integration when available', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'https://app.example.com': {
                lastUsedIntegration: 'basecamp',
              },
            },
            defaultIntegration: 'fizzy',
          },
        })
        const result = await getLastUsedIntegration('https://app.example.com/page/123')
        expect(result).toBe('basecamp')
      })

      it('falls back to global default when no URL-specific integration exists', async () => {
        setMockStorage({
          integrationPreferences: {
            defaultIntegration: 'fizzy',
          },
        })
        const result = await getLastUsedIntegration('https://app.example.com/page')
        expect(result).toBe('fizzy')
      })

      it('returns null when no URL-specific or global default exists', async () => {
        setMockStorage({
          integrationPreferences: {},
        })
        const result = await getLastUsedIntegration('https://app.example.com/page')
        expect(result).toBeNull()
      })

      it('falls back to global default for invalid URLs', async () => {
        setMockStorage({
          integrationPreferences: {
            defaultIntegration: 'basecamp',
          },
        })
        const result = await getLastUsedIntegration('not-a-valid-url')
        expect(result).toBe('basecamp')
      })

      it('falls back to global default for chrome:// URLs', async () => {
        setMockStorage({
          integrationPreferences: {
            defaultIntegration: 'fizzy',
          },
        })
        const result = await getLastUsedIntegration('chrome://extensions/')
        expect(result).toBe('fizzy')
      })

      it('returns global default when no URL provided', async () => {
        setMockStorage({
          integrationPreferences: {
            defaultIntegration: 'basecamp',
          },
        })
        const result = await getLastUsedIntegration()
        expect(result).toBe('basecamp')
      })

      it('returns null when no URL provided and no global default', async () => {
        setMockStorage({
          integrationPreferences: {},
        })
        const result = await getLastUsedIntegration()
        expect(result).toBeNull()
      })
    })

    describe('setLastUsedIntegration', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type StorageWithPrefs = { integrationPreferences: any }

      it('stores integration for specific URL origin', async () => {
        await setLastUsedIntegration('basecamp', 'https://app.example.com/page/123')
        const storage = getMockStorage() as StorageWithPrefs
        expect(storage.integrationPreferences.urlDestinations['https://app.example.com'].lastUsedIntegration).toBe('basecamp')
      })

      it('preserves existing URL destination data when setting integration', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'https://app.example.com': {
                fizzy: { boardId: 'existing-board', accountSlug: 'existing-account' },
              },
            },
          },
        })
        await setLastUsedIntegration('basecamp', 'https://app.example.com/page')
        const storage = getMockStorage() as StorageWithPrefs
        expect(storage.integrationPreferences.urlDestinations['https://app.example.com']).toEqual({
          fizzy: { boardId: 'existing-board', accountSlug: 'existing-account' },
          lastUsedIntegration: 'basecamp',
        })
      })

      it('sets global default when no URL provided', async () => {
        await setLastUsedIntegration('fizzy')
        const storage = getMockStorage() as StorageWithPrefs
        expect(storage.integrationPreferences.defaultIntegration).toBe('fizzy')
      })

      it('sets global default for invalid URLs', async () => {
        await setLastUsedIntegration('basecamp', 'not-a-valid-url')
        const storage = getMockStorage() as StorageWithPrefs
        expect(storage.integrationPreferences.defaultIntegration).toBe('basecamp')
      })

      it('sets global default for chrome:// URLs', async () => {
        await setLastUsedIntegration('fizzy', 'chrome://extensions/')
        const storage = getMockStorage() as StorageWithPrefs
        expect(storage.integrationPreferences.defaultIntegration).toBe('fizzy')
      })

      it('overwrites previous URL-specific integration', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'https://app.example.com': {
                lastUsedIntegration: 'fizzy',
              },
            },
          },
        })
        await setLastUsedIntegration('basecamp', 'https://app.example.com/page')
        const storage = getMockStorage() as StorageWithPrefs
        expect(storage.integrationPreferences.urlDestinations['https://app.example.com'].lastUsedIntegration).toBe('basecamp')
      })

      it('creates urlDestinations object if not exists', async () => {
        setMockStorage({
          integrationPreferences: {},
        })
        await setLastUsedIntegration('basecamp', 'https://new-site.com/page')
        const storage = getMockStorage() as StorageWithPrefs
        expect(storage.integrationPreferences.urlDestinations['https://new-site.com'].lastUsedIntegration).toBe('basecamp')
      })
    })
  })

  // ============ URL-based Destination Tests ============

  describe('URL-based Last Used Destination', () => {
    describe('getLastUsedDestination with URL', () => {
      it('returns URL-specific fizzy destination when available', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'https://app.example.com': {
                fizzy: { boardId: 'url-board-123', accountSlug: 'url-account' },
              },
            },
            lastUsedDestinations: {
              fizzy: { boardId: 'global-board', accountSlug: 'global-account' },
            },
          },
        })
        const result = await getLastUsedDestination('fizzy', 'https://app.example.com/page/123')
        expect(result).toEqual({
          destinationId: 'url-board-123',
          accountId: 'url-account',
        })
      })

      it('returns URL-specific basecamp destination with todolistId', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'https://app.example.com': {
                basecamp: { accountId: 'url-account', projectId: 'url-project', todolistId: 'url-todolist' },
              },
            },
          },
        })
        const result = await getLastUsedDestination('basecamp', 'https://app.example.com/dashboard')
        expect(result).toEqual({
          destinationId: 'url-project',
          accountId: 'url-account',
          subDestinationId: 'url-todolist',
        })
      })

      it('returns URL-specific basecamp destination with columnId', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'https://app.example.com': {
                basecamp: { accountId: 'url-account', projectId: 'url-project', columnId: 'url-column' },
              },
            },
          },
        })
        const result = await getLastUsedDestination('basecamp', 'https://app.example.com/kanban')
        expect(result).toEqual({
          destinationId: 'url-project',
          accountId: 'url-account',
          subDestinationId: 'url-column',
        })
      })

      it('falls back to global destination when no URL-specific one exists', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'https://other-site.com': {
                fizzy: { boardId: 'other-board', accountSlug: 'other-account' },
              },
            },
            lastUsedDestinations: {
              fizzy: { boardId: 'global-board', accountSlug: 'global-account' },
            },
          },
        })
        const result = await getLastUsedDestination('fizzy', 'https://app.example.com/page')
        expect(result).toEqual({
          destinationId: 'global-board',
          accountId: 'global-account',
        })
      })

      it('matches different paths on same origin', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'https://app.example.com': {
                fizzy: { boardId: 'origin-board', accountSlug: 'origin-account' },
              },
            },
          },
        })
        // Different paths should match the same origin
        const result1 = await getLastUsedDestination('fizzy', 'https://app.example.com/path1')
        const result2 = await getLastUsedDestination('fizzy', 'https://app.example.com/path2/nested')
        expect(result1).toEqual(result2)
      })

      it('differentiates between different ports', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'http://localhost:3000': {
                fizzy: { boardId: 'port-3000-board', accountSlug: 'account' },
              },
              'http://localhost:8080': {
                fizzy: { boardId: 'port-8080-board', accountSlug: 'account' },
              },
            },
          },
        })
        const result3000 = await getLastUsedDestination('fizzy', 'http://localhost:3000/app')
        const result8080 = await getLastUsedDestination('fizzy', 'http://localhost:8080/app')
        expect(result3000?.destinationId).toBe('port-3000-board')
        expect(result8080?.destinationId).toBe('port-8080-board')
      })
    })

    describe('setLastUsedDestination with URL', () => {
      it('stores fizzy destination for specific URL origin', async () => {
        await setLastUsedDestination(
          'fizzy',
          'url-board-456',
          'url-account-789',
          undefined,
          'https://myapp.example.com/page/1'
        )
        const prefs = await getIntegrationPreferences()
        expect(prefs.urlDestinations?.['https://myapp.example.com']?.fizzy).toEqual({
          boardId: 'url-board-456',
          accountSlug: 'url-account-789',
        })
      })

      it('stores basecamp todo destination for specific URL origin', async () => {
        await setLastUsedDestination(
          'basecamp',
          'url-project-123',
          'url-account-123',
          'url-todolist-456',
          'https://client.example.com/dashboard'
        )
        const prefs = await getIntegrationPreferences()
        expect(prefs.urlDestinations?.['https://client.example.com']?.basecamp).toEqual({
          accountId: 'url-account-123',
          projectId: 'url-project-123',
          todolistId: 'url-todolist-456',
        })
      })

      it('stores basecamp card destination when destinationType is card', async () => {
        setMockStorage({
          integrationCredentials: {
            basecamp: { clientId: 'id', clientSecret: 'secret', destinationType: 'card' },
          },
        })
        await setLastUsedDestination(
          'basecamp',
          'url-project-789',
          'url-account-789',
          'url-column-abc',
          'https://kanban.example.com/board'
        )
        const prefs = await getIntegrationPreferences()
        expect(prefs.urlDestinations?.['https://kanban.example.com']?.basecamp).toEqual({
          accountId: 'url-account-789',
          projectId: 'url-project-789',
          columnId: 'url-column-abc',
        })
      })

      it('initializes urlDestinations object if not present', async () => {
        await setLastUsedDestination(
          'fizzy',
          'new-board',
          'new-account',
          undefined,
          'https://new-site.com/page'
        )
        const prefs = await getIntegrationPreferences()
        expect(prefs.urlDestinations).toBeDefined()
        expect(prefs.urlDestinations?.['https://new-site.com']).toBeDefined()
      })

      it('preserves existing URL destinations when adding new one', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'https://existing-site.com': {
                fizzy: { boardId: 'existing-board', accountSlug: 'existing-account' },
              },
            },
          },
        })
        await setLastUsedDestination(
          'fizzy',
          'new-board',
          'new-account',
          undefined,
          'https://new-site.com/page'
        )
        const prefs = await getIntegrationPreferences()
        // Both should exist
        expect(prefs.urlDestinations?.['https://existing-site.com']?.fizzy?.boardId).toBe('existing-board')
        expect(prefs.urlDestinations?.['https://new-site.com']?.fizzy?.boardId).toBe('new-board')
      })

      it('updates existing URL destination', async () => {
        setMockStorage({
          integrationPreferences: {
            urlDestinations: {
              'https://myapp.example.com': {
                fizzy: { boardId: 'old-board', accountSlug: 'old-account' },
              },
            },
          },
        })
        await setLastUsedDestination(
          'fizzy',
          'updated-board',
          'updated-account',
          undefined,
          'https://myapp.example.com/different-page'
        )
        const prefs = await getIntegrationPreferences()
        expect(prefs.urlDestinations?.['https://myapp.example.com']?.fizzy).toEqual({
          boardId: 'updated-board',
          accountSlug: 'updated-account',
        })
      })

      it('can store both fizzy and basecamp destinations for same origin', async () => {
        await setLastUsedDestination(
          'fizzy',
          'fizzy-board',
          'fizzy-account',
          undefined,
          'https://shared-app.com/page'
        )
        await setLastUsedDestination(
          'basecamp',
          'bc-project',
          'bc-project',
          'bc-todolist',
          'https://shared-app.com/page'
        )
        const prefs = await getIntegrationPreferences()
        expect(prefs.urlDestinations?.['https://shared-app.com']?.fizzy?.boardId).toBe('fizzy-board')
        expect(prefs.urlDestinations?.['https://shared-app.com']?.basecamp?.projectId).toBe('bc-project')
      })
    })
  })
})
