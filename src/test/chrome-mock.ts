/**
 * Chrome API mock for testing
 * Provides a mock implementation of the Chrome extension APIs used by PopShot
 */

import { vi } from 'vitest'

// In-memory storage for mocking chrome.storage.local
let mockStorage: Record<string, unknown> = {}

// Message handler for mocking chrome.runtime.sendMessage
let messageHandler: ((message: unknown) => unknown) | null = null

export const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        if (typeof keys === 'string') {
          return { [keys]: mockStorage[keys] }
        }
        const result: Record<string, unknown> = {}
        for (const key of keys) {
          if (key in mockStorage) {
            result[key] = mockStorage[key]
          }
        }
        return result
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items)
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const keysArray = typeof keys === 'string' ? [keys] : keys
        for (const key of keysArray) {
          delete mockStorage[key]
        }
      }),
      clear: vi.fn(async () => {
        mockStorage = {}
      }),
    },
    session: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    },
  },
  runtime: {
    sendMessage: vi.fn(async (message: unknown) => {
      if (messageHandler) {
        return messageHandler(message)
      }
      return { success: true }
    }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
    openOptionsPage: vi.fn(async () => {}),
  },
  tabs: {
    query: vi.fn(async () => []),
    captureVisibleTab: vi.fn(async () => 'data:image/png;base64,mock'),
    create: vi.fn(async () => ({ id: 1 })),
  },
  scripting: {
    executeScript: vi.fn(async () => [{ result: {} }]),
  },
  notifications: {
    create: vi.fn(async () => 'notification-id'),
    onClicked: {
      addListener: vi.fn(),
    },
    onButtonClicked: {
      addListener: vi.fn(),
    },
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
  action: {
    onClicked: {
      addListener: vi.fn(),
    },
  },
}

/**
 * Helper to reset the mock storage between tests
 */
export function resetMockStorage() {
  mockStorage = {}
}

/**
 * Helper to set initial mock storage state
 */
export function setMockStorage(data: Record<string, unknown>) {
  mockStorage = { ...data }
}

/**
 * Helper to get current mock storage state (for assertions)
 */
export function getMockStorage(): Record<string, unknown> {
  return { ...mockStorage }
}

/**
 * Helper to set a custom message handler for chrome.runtime.sendMessage
 */
export function setMessageHandler(handler: ((message: unknown) => unknown) | null) {
  messageHandler = handler
}

/**
 * Reset all mocks - call this in beforeEach
 */
export function resetAllMocks() {
  resetMockStorage()
  setMessageHandler(null)
  vi.clearAllMocks()
}
