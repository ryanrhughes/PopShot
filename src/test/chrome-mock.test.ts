import { describe, it, expect, beforeEach } from 'vitest'
import {
  chromeMock,
  resetMockStorage,
  setMockStorage,
  getMockStorage,
  setMessageHandler,
  resetAllMocks,
} from './chrome-mock'

describe('chrome-mock', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  describe('storage.local', () => {
    it('sets and gets values', async () => {
      await chromeMock.storage.local.set({ apiKey: 'abc' })

      const result = await chromeMock.storage.local.get('apiKey')
      expect(result).toEqual({ apiKey: 'abc' })
    })

    it('gets multiple keys and ignores missing ones', async () => {
      await chromeMock.storage.local.set({ a: 1, b: 2 })

      const result = await chromeMock.storage.local.get(['a', 'c'])
      expect(result).toEqual({ a: 1 })
    })

    it('removes keys and clears storage', async () => {
      await chromeMock.storage.local.set({ a: 1, b: 2 })
      await chromeMock.storage.local.remove('a')

      const afterRemove = await chromeMock.storage.local.get(['a', 'b'])
      expect(afterRemove).toEqual({ b: 2 })

      await chromeMock.storage.local.clear()
      const afterClear = await chromeMock.storage.local.get(['a', 'b'])
      expect(afterClear).toEqual({})
    })
  })

  describe('storage.session', () => {
    it('provides no-op async methods', async () => {
      await expect(chromeMock.storage.session.get()).resolves.toEqual({})
      await expect(chromeMock.storage.session.set({})).resolves.toBeUndefined()
      await expect(chromeMock.storage.session.remove('x')).resolves.toBeUndefined()
      await expect(chromeMock.storage.session.clear()).resolves.toBeUndefined()
    })
  })

  describe('runtime.sendMessage', () => {
    it('returns default success when no handler is set', async () => {
      const result = await chromeMock.runtime.sendMessage({ ping: true })
      expect(result).toEqual({ success: true })
    })

    it('uses custom handler when provided', async () => {
      setMessageHandler((message) => ({ echoed: message }))

      const result = await chromeMock.runtime.sendMessage('hello')
      expect(result).toEqual({ echoed: 'hello' })
    })

    it('resets handler and storage via resetAllMocks', async () => {
      setMessageHandler(() => ({ ok: true }))
      setMockStorage({ a: 1 })

      resetAllMocks()

      const result = await chromeMock.runtime.sendMessage({})
      expect(result).toEqual({ success: true })
      expect(getMockStorage()).toEqual({})
    })
  })

  describe('helper utilities', () => {
    it('captures and restores mock storage state', () => {
      setMockStorage({ a: 1, b: 2 })
      expect(getMockStorage()).toEqual({ a: 1, b: 2 })

      resetMockStorage()
      expect(getMockStorage()).toEqual({})
    })
  })

  describe('other APIs', () => {
    it('exposes tabs, scripting, notifications, and context menu helpers', async () => {
      expect(chromeMock.runtime.getURL('icon.png')).toBe(
        'chrome-extension://mock-id/icon.png'
      )

      expect(await chromeMock.tabs.query({} as unknown as chrome.tabs.QueryInfo)).toEqual([])
      expect(await chromeMock.tabs.captureVisibleTab()).toContain('data:image/png')
      expect(await chromeMock.tabs.create({ url: 'https://example.com' } as unknown as chrome.tabs.CreateProperties)).toEqual({ id: 1 })

      expect(await chromeMock.scripting.executeScript({} as unknown as chrome.scripting.ScriptInjection)).toEqual([
        { result: {} },
      ])

      expect(await chromeMock.notifications.create({} as unknown as chrome.notifications.NotificationOptions)).toBe(
        'notification-id'
      )
      chromeMock.notifications.onClicked.addListener(() => {})
      chromeMock.notifications.onButtonClicked.addListener(() => {})

      chromeMock.contextMenus.create({} as unknown as chrome.contextMenus.CreateProperties)
      chromeMock.contextMenus.onClicked.addListener(() => {})

      chromeMock.action.onClicked.addListener(() => {})
    })
  })
})
