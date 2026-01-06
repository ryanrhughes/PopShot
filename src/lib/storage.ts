/**
 * Storage utilities for Fizzy Feedback extension
 * Handles secure storage of API key and user preferences
 */

export interface StorageData {
  apiKey?: string
  lastUsedBoard?: string
  urlBoardDefaults?: Record<string, string>
}

/**
 * Get the stored API key
 */
export async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(['apiKey'])
  return result.apiKey || null
}

/**
 * Store the API key
 */
export async function setApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ apiKey })
}

/**
 * Clear the stored API key
 */
export async function clearApiKey(): Promise<void> {
  await chrome.storage.local.remove(['apiKey'])
}

/**
 * Check if an API key is stored
 */
export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey()
  return !!key
}

/**
 * Get the last used board ID
 */
export async function getLastUsedBoard(): Promise<string | null> {
  const result = await chrome.storage.local.get(['lastUsedBoard'])
  return result.lastUsedBoard || null
}

/**
 * Store the last used board ID
 */
export async function setLastUsedBoard(boardId: string): Promise<void> {
  await chrome.storage.local.set({ lastUsedBoard: boardId })
}

/**
 * Get URL-to-board default mappings
 */
export async function getUrlBoardDefaults(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(['urlBoardDefaults'])
  return result.urlBoardDefaults || {}
}

/**
 * Set a URL-to-board default mapping
 */
export async function setUrlBoardDefault(urlPattern: string, boardId: string): Promise<void> {
  const defaults = await getUrlBoardDefaults()
  defaults[urlPattern] = boardId
  await chrome.storage.local.set({ urlBoardDefaults: defaults })
}

/**
 * Remove a URL-to-board default mapping
 */
export async function removeUrlBoardDefault(urlPattern: string): Promise<void> {
  const defaults = await getUrlBoardDefaults()
  delete defaults[urlPattern]
  await chrome.storage.local.set({ urlBoardDefaults: defaults })
}

/**
 * Find the default board for a given URL
 */
export async function findDefaultBoardForUrl(url: string): Promise<string | null> {
  const defaults = await getUrlBoardDefaults()
  
  // Try to match URL patterns (simple prefix matching)
  for (const [pattern, boardId] of Object.entries(defaults)) {
    if (url.startsWith(pattern) || url.includes(pattern)) {
      return boardId
    }
  }
  
  return null
}

/**
 * Get all stored data
 */
export async function getAllStorageData(): Promise<StorageData> {
  return await chrome.storage.local.get(['apiKey', 'lastUsedBoard', 'urlBoardDefaults']) as StorageData
}

/**
 * Clear all stored data
 */
export async function clearAllStorageData(): Promise<void> {
  await chrome.storage.local.clear()
}
