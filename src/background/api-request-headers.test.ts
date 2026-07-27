import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resetAllMocks } from '../test/chrome-mock'

/**
 * Regression test for the apiRequest message boundary.
 *
 * fetchAllPages walks Basecamp's geared pagination by following the rel="next"
 * Link header, but the header only reaches it if the service worker forwards
 * response headers back through chrome.runtime.sendMessage. It previously did
 * not, so every collection silently stopped at the first page of 15 - and the
 * pagination unit tests missed it because they stub sendMessage directly and
 * hand back a response shape the real worker never produced.
 */
describe('apiRequest handler response shape', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    resetAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  async function dispatchApiRequest(headers: Record<string, string>) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(headers),
      json: () => Promise.resolve([{ id: 1 }]),
    })

    await import('./service-worker')

    const addListener = chrome.runtime.onMessage.addListener as unknown as {
      mock: { calls: Array<[(m: unknown, s: unknown, r: (v: unknown) => void) => boolean]> }
    }
    const listener = addListener.mock.calls[0][0]

    return new Promise<Record<string, unknown>>((resolve) => {
      listener(
        {
          action: 'apiRequest',
          method: 'GET',
          url: 'https://3.basecampapi.com/12345/projects.json',
          headers: {},
        },
        {},
        (response: unknown) => resolve(response as Record<string, unknown>)
      )
    })
  }

  it('forwards response headers so pagination can follow rel="next"', async () => {
    const link = '<https://3.basecampapi.com/12345/projects.json?page=2>; rel="next"'
    const response = await dispatchApiRequest({ Link: link })

    expect(response.success).toBe(true)
    expect(response.headers).toBeDefined()
    expect((response.headers as Record<string, string>).link).toBe(link)
  })

  it('still responds when there are no pagination headers', async () => {
    const response = await dispatchApiRequest({})

    expect(response.success).toBe(true)
    expect(response.data).toEqual([{ id: 1 }])
  })
})
