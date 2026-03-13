import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetAllMocks, setMessageHandler, chromeMock } from '../test/chrome-mock'
import {
  formatMetadataAsText,
  formatMetadataAsHtml,
  generateDefaultTitle,
  captureMetadata,
  type PageMetadata,
  __test_escapeHtml,
  __test_getCurrentTabInfo,
} from './metadata'

describe('metadata', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  const sampleMetadata: PageMetadata = {
    url: 'https://example.com/page?query=1',
    title: 'Example Page',
    browser: 'Chrome',
    browserVersion: '120.0.0',
    viewportWidth: 1920,
    viewportHeight: 1080,
    devicePixelRatio: 2,
  }

  describe('formatMetadataAsText', () => {
    it('formats metadata as markdown text', () => {
      const result = formatMetadataAsText(sampleMetadata)

      expect(result).toContain('**URL:** https://example.com/page?query=1')
      expect(result).toContain('**Page Title:** Example Page')
      expect(result).toContain('**Browser:** Chrome 120.0.0')
      expect(result).toContain('**Viewport:** 1920 x 1080 @ 2x')
    })

    it('handles metadata with unknown values', () => {
      const unknownMetadata: PageMetadata = {
        url: 'Unknown',
        title: 'Unknown',
        browser: 'Unknown',
        browserVersion: 'Unknown',
        viewportWidth: 0,
        viewportHeight: 0,
        devicePixelRatio: 1,
      }

      const result = formatMetadataAsText(unknownMetadata)

      expect(result).toContain('**URL:** Unknown')
      expect(result).toContain('**Browser:** Unknown Unknown')
    })
  })

  describe('formatMetadataAsHtml', () => {
    it('formats metadata as HTML', () => {
      const result = formatMetadataAsHtml(sampleMetadata)

      expect(result).toContain('<strong>URL:</strong>')
      expect(result).toContain('href="https://example.com/page?query=1"')
      expect(result).toContain('<strong>Page Title:</strong> Example Page')
      expect(result).toContain('<strong>Browser:</strong> Chrome 120.0.0')
      expect(result).toContain('<strong>Viewport:</strong> 1920 x 1080 @ 2x')
    })

    it('escapes HTML special characters', () => {
      const maliciousMetadata: PageMetadata = {
        ...sampleMetadata,
        title: '<script>alert("xss")</script>',
        url: 'https://example.com/<script>',
      }

      const result = formatMetadataAsHtml(maliciousMetadata)

      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
    })

    it('escapes ampersands correctly', () => {
      const metadataWithAmpersand: PageMetadata = {
        ...sampleMetadata,
        url: 'https://example.com?foo=1&bar=2',
      }

      const result = formatMetadataAsHtml(metadataWithAmpersand)

      expect(result).toContain('foo=1&amp;bar=2')
    })

    it('escapes quotes in URLs', () => {
      const metadataWithQuotes: PageMetadata = {
        ...sampleMetadata,
        url: 'https://example.com?q="test"',
      }

      const result = formatMetadataAsHtml(metadataWithQuotes)

      expect(result).toContain('&quot;test&quot;')
    })
  })

  describe('generateDefaultTitle', () => {
    it('generates title from domain', () => {
      const result = generateDefaultTitle(sampleMetadata)

      expect(result).toBe('Feedback on example.com')
    })

    it('handles URLs with subdomains', () => {
      const metadata: PageMetadata = {
        ...sampleMetadata,
        url: 'https://app.fizzy.do/boards/123',
      }

      const result = generateDefaultTitle(metadata)

      expect(result).toBe('Feedback on app.fizzy.do')
    })

    it('handles invalid URLs gracefully', () => {
      const metadata: PageMetadata = {
        ...sampleMetadata,
        url: 'not-a-valid-url',
      }

      const result = generateDefaultTitle(metadata)

      expect(result).toBe('Feedback on Unknown')
    })

    it('handles "Unknown" URL', () => {
      const metadata: PageMetadata = {
        ...sampleMetadata,
        url: 'Unknown',
      }

      const result = generateDefaultTitle(metadata)

      expect(result).toBe('Feedback on Unknown')
    })
  })

  describe('captureMetadata', () => {
    it('captures metadata from chrome APIs', async () => {
      setMessageHandler((message: unknown) => {
        const msg = message as { action: string }
        if (msg.action === 'getCurrentTab') {
          return {
            success: true,
            tab: { url: 'https://test.com/page', title: 'Test Page' },
          }
        }
        if (msg.action === 'getTabViewport') {
          return {
            success: true,
            viewport: { width: 1440, height: 900 },
          }
        }
        return { success: false }
      })

      const result = await captureMetadata()

      expect(result.url).toBe('https://test.com/page')
      expect(result.title).toBe('Test Page')
      expect(result.viewportWidth).toBe(1440)
      expect(result.viewportHeight).toBe(900)
      expect(result.devicePixelRatio).toBe(window.devicePixelRatio)
    })

    it('handles missing tab info gracefully', async () => {
      setMessageHandler(() => ({ success: false }))

      const result = await captureMetadata()

      expect(result.url).toBe('Unknown')
      expect(result.title).toBe('Unknown')
    })

    it('handles chrome API errors gracefully', async () => {
      chromeMock.runtime.sendMessage.mockRejectedValue(new Error('Extension context invalidated'))

      const result = await captureMetadata()

      expect(result.url).toBe('Unknown')
      expect(result.title).toBe('Unknown')
      // Viewport falls back to window dimensions
      expect(result.viewportWidth).toBe(window.innerWidth)
      expect(result.viewportHeight).toBe(window.innerHeight)
    })

    it('handles missing url/title in tab response', async () => {
      setMessageHandler((message: unknown) => {
        const msg = message as { action: string }
        if (msg.action === 'getCurrentTab') {
          return {
            success: true,
            tab: {}, // No url or title
          }
        }
        if (msg.action === 'getTabViewport') {
          return { success: true, viewport: { width: 800, height: 600 } }
        }
        return { success: false }
      })

      const result = await captureMetadata()

      expect(result.url).toBe('Unknown')
      expect(result.title).toBe('Unknown')
    })
  })

  describe('browser detection', () => {
    const originalUserAgent = navigator.userAgent

    beforeEach(() => {
      resetAllMocks()
    })

    afterEach(() => {
      vi.stubGlobal('navigator', { userAgent: originalUserAgent })
    })

    it('detects Chrome browser', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      })
      setMessageHandler(() => ({ success: false }))

      const result = await captureMetadata()

      expect(result.browser).toBe('Chrome')
      expect(result.browserVersion).toBe('120.0.0.0')
    })

    it('detects Edge browser', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
      })
      setMessageHandler(() => ({ success: false }))

      const result = await captureMetadata()

      expect(result.browser).toBe('Edge')
      expect(result.browserVersion).toBe('120.0.2210.91')
    })

    it('detects Firefox browser', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      })
      setMessageHandler(() => ({ success: false }))

      const result = await captureMetadata()

      expect(result.browser).toBe('Firefox')
      expect(result.browserVersion).toBe('121.0')
    })

    it('detects Safari browser', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      })
      setMessageHandler(() => ({ success: false }))

      const result = await captureMetadata()

      expect(result.browser).toBe('Safari')
      expect(result.browserVersion).toBe('17.2')
    })

    it('returns Unknown for unrecognized browser', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'SomeWeirdBrowser/1.0',
      })
      setMessageHandler(() => ({ success: false }))

      const result = await captureMetadata()

      expect(result.browser).toBe('Unknown')
      expect(result.browserVersion).toBe('Unknown')
    })

    it('handles Chrome without version number', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 Chrome Safari/537.36',
      })
      setMessageHandler(() => ({ success: false }))

      const result = await captureMetadata()

      expect(result.browser).toBe('Chrome')
      expect(result.browserVersion).toBe('Unknown')
    })

    it('handles Edge without version number', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 Edg Safari/537.36',
      })
      setMessageHandler(() => ({ success: false }))

      const result = await captureMetadata()

      expect(result.browser).toBe('Edge')
      expect(result.browserVersion).toBe('Unknown')
    })

    it('handles Firefox without version number', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 Firefox Gecko/20100101',
      })
      setMessageHandler(() => ({ success: false }))

      const result = await captureMetadata()

      expect(result.browser).toBe('Firefox')
      expect(result.browserVersion).toBe('Unknown')
    })

    it('handles Safari without version number', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15',
      })
      setMessageHandler(() => ({ success: false }))

      const result = await captureMetadata()

      expect(result.browser).toBe('Safari')
      expect(result.browserVersion).toBe('Unknown')
    })
  })

  describe('internal helpers', () => {
    it('escapeHtml covers all mapped entities and leaves others', () => {
      const input = `& < > " ' plain`
      const result = __test_escapeHtml(input)

      expect(result).toContain('&amp;')
      expect(result).toContain('&lt;')
      expect(result).toContain('&gt;')
      expect(result).toContain('&quot;')
      expect(result).toContain('&#39;')
      expect(result).toContain('plain')
    })

    it('getCurrentTabInfo returns real values when provided', async () => {
      chromeMock.runtime.sendMessage.mockResolvedValue({
        success: true,
        tab: { url: 'https://real.test', title: 'Real' },
      })

      const result = await __test_getCurrentTabInfo()

      expect(result.url).toBe('https://real.test')
      expect(result.title).toBe('Real')
    })

    it('getCurrentTabInfo falls back when url/title empty', async () => {
      chromeMock.runtime.sendMessage.mockResolvedValue({
        success: true,
        tab: { url: '', title: '' },
      })

      const result = await __test_getCurrentTabInfo()

      expect(result.url).toBe('Unknown')
      expect(result.title).toBe('Unknown')
    })
  })
})
