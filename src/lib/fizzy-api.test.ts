import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resetAllMocks, setMessageHandler } from '../test/chrome-mock'
import {
  validateApiKey,
  getIdentity,
  getBoards,
  getTags,
  getAllBoards,
  getAllTags,
  createDirectUpload,
  uploadFile,
  createCard,
  calculateChecksum,
  dataUrlToBlob,
  FizzyApiError,
} from './fizzy-api'

describe('fizzy-api', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  const mockIdentityResponse = {
    accounts: [
      {
        id: 'acc-1',
        name: 'Test Account',
        slug: 'test-account',
        created_at: '2024-01-01T00:00:00Z',
        user: {
          id: 'user-1',
          name: 'Test User',
          role: 'admin',
          active: true,
          email_address: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          url: 'https://app.fizzy.do/test-account/users/user-1',
        },
      },
    ],
  }

  const mockBoards = [
    {
      id: 'board-1',
      name: 'Test Board',
      all_access: true,
      created_at: '2024-01-01T00:00:00Z',
      url: 'https://app.fizzy.do/test-account/boards/board-1',
      creator: mockIdentityResponse.accounts[0].user,
    },
  ]

  const mockTags = [
    { id: 'tag-1', title: 'Bug', created_at: '2024-01-01T00:00:00Z' },
    { id: 'tag-2', title: 'Feature', created_at: '2024-01-01T00:00:00Z' },
  ]

  describe('validateApiKey', () => {
    it('returns identity response for valid API key', async () => {
      setMessageHandler(() => ({
        success: true,
        data: mockIdentityResponse,
      }))

      const result = await validateApiKey('valid-api-key')

      expect(result).toEqual(mockIdentityResponse)
    })

    it('throws FizzyApiError when service worker not responding', async () => {
      setMessageHandler(() => undefined)

      await expect(validateApiKey('api-key')).rejects.toThrow(FizzyApiError)
      await expect(validateApiKey('api-key')).rejects.toThrow(
        'Service worker not responding'
      )
    })

    it('throws FizzyApiError for invalid API key', async () => {
      setMessageHandler(() => ({
        success: false,
        error: 'Unauthorized',
        status: 401,
      }))

      await expect(validateApiKey('invalid-key')).rejects.toThrow(FizzyApiError)
    })

    it('uses default error message when none provided', async () => {
      setMessageHandler(() => ({
        success: false,
        // No error message
      }))

      await expect(validateApiKey('key')).rejects.toThrow('API request failed')
    })

    it('uses default status 500 when none provided', async () => {
      setMessageHandler(() => ({
        success: false,
        error: 'Something went wrong',
        // No status
      }))

      try {
        await validateApiKey('key')
      } catch (e) {
        expect((e as FizzyApiError).status).toBe(500)
      }
    })
  })

  describe('swFetch defaults (internal)', () => {
    it('uses GET and empty headers when not provided', async () => {
      let capturedMessage: Record<string, unknown> = {}
      setMessageHandler((message: unknown) => {
        capturedMessage = message as Record<string, unknown>
        return { success: true, data: {} }
      })

      const { __test_swFetch } = await import('./fizzy-api')

      await __test_swFetch('https://example.com')

      expect(capturedMessage.method).toBe('GET')
      expect(capturedMessage.headers).toEqual({})
    })
  })

  describe('getIdentity', () => {
    it('returns identity (delegates to validateApiKey)', async () => {
      setMessageHandler(() => ({
        success: true,
        data: mockIdentityResponse,
      }))

      const result = await getIdentity('api-key')

      expect(result).toEqual(mockIdentityResponse)
    })
  })

  describe('getBoards', () => {
    it('fetches boards for an account', async () => {
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string }
        if (msg.url.includes('/boards')) {
          // Return data on page 1, empty array on subsequent pages
          return { success: true, data: msg.url.includes('page=1') || !msg.url.includes('page=') ? mockBoards : [] }
        }
        return { success: false }
      })

      const result = await getBoards('api-key', 'test-account')

      expect(result).toEqual(mockBoards)
    })

    it('normalizes slug with leading slash', async () => {
      let capturedUrl = ''
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string }
        capturedUrl = msg.url
        if (msg.url.includes('/boards')) {
          return { success: true, data: msg.url.includes('page=1') ? mockBoards : [] }
        }
        return { success: true, data: mockBoards }
      })

      await getBoards('api-key', '/test-account')

      expect(capturedUrl).toContain('https://app.fizzy.do/test-account/boards')
    })
  })

  describe('getTags', () => {
    it('fetches tags for an account', async () => {
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string }
        if (msg.url.includes('/tags')) {
          return { success: true, data: msg.url.includes('page=1') || !msg.url.includes('page=') ? mockTags : [] }
        }
        return { success: false }
      })

      const result = await getTags('api-key', 'test-account')

      expect(result).toEqual(mockTags)
    })

    it('normalizes slug with leading slash', async () => {
      let capturedUrl = ''
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string }
        capturedUrl = msg.url
        if (msg.url.includes('/tags')) {
          return { success: true, data: msg.url.includes('page=1') ? mockTags : [] }
        }
        return { success: true, data: mockTags }
      })

      await getTags('api-key', '/test-account')

      expect(capturedUrl).toContain('https://app.fizzy.do/test-account/tags')
    })
  })

  describe('getAllBoards', () => {
    it('fetches boards for all accounts', async () => {
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string }
        if (msg.url.includes('/identity')) {
          return { success: true, data: mockIdentityResponse }
        }
        if (msg.url.includes('/boards')) {
          return { success: true, data: msg.url.includes('page=1') ? mockBoards : [] }
        }
        return { success: false }
      })

      const result = await getAllBoards('api-key')

      expect(result).toHaveLength(1)
      expect(result[0].account.slug).toBe('test-account')
      expect(result[0].boards).toEqual(mockBoards)
    })
  })

  describe('getAllTags', () => {
    it('fetches tags for all accounts', async () => {
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string }
        if (msg.url.includes('/identity')) {
          return { success: true, data: mockIdentityResponse }
        }
        if (msg.url.includes('/tags')) {
          return { success: true, data: msg.url.includes('page=1') ? mockTags : [] }
        }
        return { success: false }
      })

      const result = await getAllTags('api-key')

      expect(result).toHaveLength(1)
      expect(result[0].account.slug).toBe('test-account')
      expect(result[0].tags).toEqual(mockTags)
    })
  })

  describe('createDirectUpload', () => {
    it('creates a direct upload request', async () => {
      const mockDirectUpload = {
        id: 'upload-1',
        key: 'uploads/key',
        filename: 'screenshot.png',
        content_type: 'image/png',
        byte_size: 1024,
        checksum: 'abc123',
        direct_upload: {
          url: 'https://s3.amazonaws.com/bucket/key',
          headers: { 'Content-Type': 'image/png' },
        },
        signed_id: 'signed-id',
        attachable_sgid: 'sgid-123',
      }

      setMessageHandler(() => ({
        success: true,
        data: mockDirectUpload,
      }))

      const result = await createDirectUpload('api-key', 'test-account', {
        filename: 'screenshot.png',
        byteSize: 1024,
        checksum: 'abc123',
        contentType: 'image/png',
      })

      expect(result).toEqual(mockDirectUpload)
    })
  })

  describe('uploadFile', () => {
    it('uploads file to S3', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
      })

      const blob = new Blob(['test'], { type: 'image/png' })
      await uploadFile(
        'https://s3.amazonaws.com/bucket/key',
        { 'Content-Type': 'image/png' },
        blob
      )

      expect(global.fetch).toHaveBeenCalledWith(
        'https://s3.amazonaws.com/bucket/key',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: blob,
        }
      )
    })

    it('throws FizzyApiError on upload failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })

      const blob = new Blob(['test'], { type: 'image/png' })

      await expect(
        uploadFile('https://s3.amazonaws.com/bucket/key', {}, blob)
      ).rejects.toThrow(FizzyApiError)
    })
  })

  describe('createCard', () => {
    const mockCard = {
      id: 'card-1',
      number: 42,
      title: 'Test Card',
      status: 'open',
      description: 'Test description',
      description_html: '<p>Test description</p>',
      url: 'https://app.fizzy.do/test-account/boards/board-1/cards/card-1',
      board: mockBoards[0],
      creator: mockIdentityResponse.accounts[0].user,
    }

    it('creates a card and returns data directly', async () => {
      setMessageHandler(() => ({
        success: true,
        data: mockCard,
      }))

      const result = await createCard('api-key', 'test-account', 'board-1', {
        title: 'Test Card',
        description: 'Test description',
      })

      expect(result).toEqual(mockCard)
    })

    it('fetches card from location header if no data returned', async () => {
      let callCount = 0
      setMessageHandler((message: unknown) => {
        const msg = message as { method?: string }
        callCount++
        if (callCount === 1 && msg.method === 'POST') {
          return {
            success: true,
            data: null,
            location: '/test-account/boards/board-1/cards/card-1',
          }
        }
        // Second call to fetch the card
        return { success: true, data: mockCard }
      })

      const result = await createCard('api-key', 'test-account', 'board-1', {
        title: 'Test Card',
      })

      expect(result).toEqual(mockCard)
      expect(callCount).toBe(2)
    })

    it('throws error if no data or location returned', async () => {
      setMessageHandler(() => ({
        success: true,
        data: null,
        location: null,
      }))

      await expect(
        createCard('api-key', 'test-account', 'board-1', { title: 'Test' })
      ).rejects.toThrow('No card data returned')
    })

    it('includes tag_ids when provided', async () => {
      let capturedBody = ''
      setMessageHandler((message: unknown) => {
        const msg = message as { body?: string }
        if (msg.body) capturedBody = msg.body
        return { success: true, data: mockCard }
      })

      await createCard('api-key', 'test-account', 'board-1', {
        title: 'Test Card',
        tag_ids: ['tag-1', 'tag-2'],
      })

      const parsed = JSON.parse(capturedBody)
      expect(parsed.card.tag_ids).toEqual(['tag-1', 'tag-2'])
    })
  })

  describe('calculateChecksum', () => {
    it('calculates MD5 checksum as base64', async () => {
      const data = new TextEncoder().encode('hello world')
      const result = await calculateChecksum(data.buffer)

      // MD5 of "hello world" is 5eb63bbbe01eeed093cb22bb8f5acdc3
      // Base64 of the raw binary is XrY7u+Ae7tCTyyK7j1rNww==
      expect(result).toBe('XrY7u+Ae7tCTyyK7j1rNww==')
    })

    it('produces different checksums for different data', async () => {
      const data1 = new TextEncoder().encode('hello')
      const data2 = new TextEncoder().encode('world')

      const result1 = await calculateChecksum(data1.buffer)
      const result2 = await calculateChecksum(data2.buffer)

      expect(result1).not.toBe(result2)
    })
  })

  describe('dataUrlToBlob', () => {
    it('converts PNG data URL to blob', () => {
      // Minimal valid PNG (1x1 transparent pixel)
      const pngDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

      const blob = dataUrlToBlob(pngDataUrl)

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('image/png')
      expect(blob.size).toBeGreaterThan(0)
    })

    it('converts JPEG data URL to blob', () => {
      // Minimal JPEG header
      const jpegDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

      const blob = dataUrlToBlob(jpegDataUrl)

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('image/jpeg')
    })

    it('defaults to image/png when mime type pattern not found', () => {
      // Malformed data URL without colon-semicolon pattern
      const dataUrl = 'data:base64,dGVzdA=='

      const blob = dataUrlToBlob(dataUrl)

      expect(blob.type).toBe('image/png')
    })

    it('handles empty mime type between colon and semicolon', () => {
      // Edge case: empty mime type
      const dataUrl = 'data:;base64,dGVzdA=='

      const blob = dataUrlToBlob(dataUrl)

      // Empty string is captured, which is falsy but still a match
      expect(blob.type).toBe('')
    })

    it('handles data URL with complex mime type', () => {
      const dataUrl = 'data:image/webp;base64,dGVzdA=='

      const blob = dataUrlToBlob(dataUrl)

      expect(blob.type).toBe('image/webp')
    })
  })

  describe('FizzyApiError', () => {
    it('creates error with correct properties', () => {
      const error = new FizzyApiError('Not found', 404, 'Not Found')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(FizzyApiError)
      expect(error.message).toBe('Not found')
      expect(error.status).toBe(404)
      expect(error.statusText).toBe('Not Found')
      expect(error.name).toBe('FizzyApiError')
    })
  })

  describe('uploadImageAndCreateCard', () => {
    const mockCard = {
      id: 'card-1',
      number: 42,
      title: 'Test Card',
      status: 'open',
      description: 'Test description',
      description_html: '<p>Test description</p>',
      url: 'https://app.fizzy.do/test-account/boards/board-1/cards/card-1',
      board: {
        id: 'board-1',
        name: 'Test Board',
        all_access: true,
        created_at: '2024-01-01T00:00:00Z',
        url: 'https://app.fizzy.do/test-account/boards/board-1',
        creator: {
          id: 'user-1',
          name: 'Test User',
          role: 'admin',
          active: true,
          email_address: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          url: 'https://app.fizzy.do/test-account/users/user-1',
        },
      },
      creator: {
        id: 'user-1',
        name: 'Test User',
        role: 'admin',
        active: true,
        email_address: 'test@example.com',
        created_at: '2024-01-01T00:00:00Z',
        url: 'https://app.fizzy.do/test-account/users/user-1',
      },
    }

    const mockDirectUpload = {
      id: 'upload-1',
      key: 'uploads/key',
      filename: 'screenshot.png',
      content_type: 'image/png',
      byte_size: 1024,
      checksum: 'abc123',
      direct_upload: {
        url: 'https://s3.amazonaws.com/bucket/key',
        headers: { 'Content-Type': 'image/png' },
      },
      signed_id: 'signed-id',
      attachable_sgid: 'sgid-123',
    }

    // Minimal 1x1 transparent PNG as data URL
    const pngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    it('uploads image and creates card', async () => {
      // Mock S3 upload
      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      // Mock chrome API calls
      let capturedCardBody = ''
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string; method?: string; body?: string }
        if (msg.url.includes('/direct_uploads')) {
          return { success: true, data: mockDirectUpload }
        }
        if (msg.url.includes('/cards') && msg.method === 'POST') {
          capturedCardBody = msg.body || ''
          return { success: true, data: mockCard }
        }
        return { success: false }
      })

      const { uploadImageAndCreateCard } = await import('./fizzy-api')
      const result = await uploadImageAndCreateCard(
        'api-key',
        'test-account',
        'board-1',
        pngDataUrl,
        'Test Feedback',
        '<p>Metadata here</p>'
      )

      expect(result.card).toEqual(mockCard)
      expect(result.cardUrl).toBe(mockCard.url)

      // Verify S3 upload was called
      expect(global.fetch).toHaveBeenCalledWith(
        'https://s3.amazonaws.com/bucket/key',
        expect.objectContaining({
          method: 'PUT',
        })
      )

      const parsed = JSON.parse(capturedCardBody)
      expect(parsed.card.description).toContain('action-text-attachment')
      expect(parsed.card.description).toContain(mockDirectUpload.attachable_sgid)
      expect(parsed.card.description).toContain('Metadata here')
    })

    it('uploads image and creates card with tags', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      let capturedCardBody = ''
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string; method?: string; body?: string }
        if (msg.url.includes('/direct_uploads')) {
          return { success: true, data: mockDirectUpload }
        }
        if (msg.url.includes('/cards') && msg.method === 'POST') {
          capturedCardBody = msg.body || ''
          return { success: true, data: mockCard }
        }
        return { success: false }
      })

      const { uploadImageAndCreateCard } = await import('./fizzy-api')
      await uploadImageAndCreateCard(
        'api-key',
        'test-account',
        'board-1',
        pngDataUrl,
        'Test Feedback',
        '<p>Metadata</p>',
        ['tag-1', 'tag-2']
      )

      const parsed = JSON.parse(capturedCardBody)
      expect(parsed.card.tag_ids).toEqual(['tag-1', 'tag-2'])
      expect(parsed.card.description).toContain(mockDirectUpload.attachable_sgid)
    })

    it('omits tag_ids when tags array is empty', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      let capturedCardBody = ''
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string; method?: string; body?: string }
        if (msg.url.includes('/direct_uploads')) {
          return { success: true, data: mockDirectUpload }
        }
        if (msg.url.includes('/cards') && msg.method === 'POST') {
          capturedCardBody = msg.body || ''
          return { success: true, data: mockCard }
        }
        return { success: false }
      })

      const { uploadImageAndCreateCard } = await import('./fizzy-api')
      await uploadImageAndCreateCard(
        'api-key',
        'test-account',
        'board-1',
        pngDataUrl,
        'Test Feedback',
        '<p>Metadata</p>',
        [] // Empty tags
      )

      const parsed = JSON.parse(capturedCardBody)
      expect(parsed.card.tag_ids).toBeUndefined()
    })

    it('throws when S3 upload fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      setMessageHandler((message: unknown) => {
        const msg = message as { url: string }
        if (msg.url.includes('/direct_uploads')) {
          return { success: true, data: mockDirectUpload }
        }
        return { success: false }
      })

      const { uploadImageAndCreateCard } = await import('./fizzy-api')

      await expect(
        uploadImageAndCreateCard(
          'api-key',
          'test-account',
          'board-1',
          pngDataUrl,
          'Test Feedback',
          '<p>Metadata</p>'
        )
      ).rejects.toThrow(FizzyApiError)
    })

    it('throws when direct upload creation fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      setMessageHandler(() => ({ success: false, error: 'bad upload', status: 503 }))

      const { uploadImageAndCreateCard } = await import('./fizzy-api')

      await expect(
        uploadImageAndCreateCard(
          'api-key',
          'test-account',
          'board-1',
          pngDataUrl,
          'Test Feedback',
          '<p>Metadata</p>'
        )
      ).rejects.toThrow(FizzyApiError)
    })
  })
})
